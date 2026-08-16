// 行動記錄自動補上行動名稱。
//
// 遊戲原本的「行動記錄」只會顯示「行動成功！獲得了 xx 點經驗值。」，沒有講是哪個行動。
//
// ★ 這一段被改寫過好幾次，因為遊戲的紀錄清單有三個很容易踩雷的特性
//   （都是實際在頁面上量測出來的，不是猜的）：
//
//   1. 清單是「最新的在最上面」，但 React 是用「位置」在對應節點，不是用內容。
//      新增一筆紀錄時，它並不會在最上面插入一個新的 <article>，
//      而是把「既有每個節點的文字」整批往下挪一格重寫，然後在「最後面」補一個新節點。
//      => 最新的那筆紀錄是「改既有節點的文字」，不會觸發 childList 的新增節點事件；
//         真正被新增的那個節點反而裝的是「最舊」的那筆內容。
//
//   2. 重繪時 React 會用它自己資料裡的原始文字覆蓋回去，把我們改過的字整個蓋掉。
//      => 標註不能只做一次，必須在每次重繪後持續重新套用。
//
//   3. ★ 但 React 只在「值真的不一樣」時才寫 DOM。
//      連續兩筆紀錄文字完全相同時（同一個行動又拿到同樣的經驗值），它一個字都不會動。
//      => 節點語意上已經換成新的那筆紀錄，畫面上卻還留著我們替舊紀錄寫的行動名稱。
//
//   特性 3 是最陰的一個，它讓「只處理開頭還是『行動』的節點」這種寫法必然出錯：
//   我們自己寫上去的名字讓文字不再以「行動」開頭，於是那個節點就被永遠跳過，
//   就算它後來被拿去裝別的行動也修不回來。實測症狀是循環順序換行動後，
//   紀錄整批顯示成同一個行動名稱。
//
// 所以現在的做法是兩件事分開：
//
//   (a) 「第幾筆是哪個行動」完全由 API 決定。
//       network.js 確認回應成功的當下就 recordSuccess()，直接推進 labels（索引 0 是最新）。
//       失敗的行動不會進來，畫面訊號再怎麼曖昧都不影響這份對照表。
//
//   (b) 「畫面上怎麼呈現」每次掃描都重新算一遍。
//       每個節點都記住它「沒有我們標註時的原文」（applied 快取），
//       所以不管節點現在掛的是原文、還是我們上次寫的舊名字，都能算出正確的目標文字並覆寫。
//       這讓標註變成可重複覆寫的，而不是只能寫一次。

import { RAW_RECORD_PREFIX } from "../core/constants.js";
import { findLeadingTextNode, getRecordArticles } from "../game/dom.js";

// labels[i] = 第 i 筆紀錄（0 = 最新）對應的行動名稱，認不出來就是 null。
let labels = [];

// applied[i] = 第 i 個節點目前的狀態：{ raw: 沒有標註時的原文, text: 我們最後寫進去的文字 }。
// 這是「節點」的快取，不是「紀錄」的，所以清單往下位移時不跟著移動。
let applied = [];

// labels 只會從前面長，設個上限避免長時間掛著無限增長。
// 遊戲的紀錄清單遠比這短，超出的部分本來就再也不會被用到。
const MAX_LABELS = 200;

/** 網路層確認行動成功後呼叫；name 可以是 null（成功但認不出是哪個行動）。 */
export function recordSuccess(name) {
	labels.unshift(name ?? null);
	if (labels.length > MAX_LABELS) labels.length = MAX_LABELS;
}

/** 把原文開頭的「行動」兩個字換成行動名稱，其餘文字完全不動。 */
function annotate(raw, name) {
	const trimmed = raw.trimStart();
	if (!trimmed.startsWith(RAW_RECORD_PREFIX)) return raw;
	const lead = raw.length - trimmed.length; // 開頭空白數，也就是「行動」的起始位置
	return (
		raw.slice(0, lead) + name + raw.slice(lead + RAW_RECORD_PREFIX.length)
	);
}

/**
 * 還原出某個節點「沒有我們標註」時的原文。
 * 拿不出來（認不得這段文字）時回傳 null，那就完全不要碰它。
 */
function rawBaseOf(index, current) {
	// 開頭是「行動」→ 這是 React 剛寫進來的原文
	if (current.trimStart().startsWith(RAW_RECORD_PREFIX)) return current;
	// 跟我們上次寫進去的一字不差 → 取回當時的原文
	if (applied[index] && applied[index].text === current) {
		return applied[index].raw;
	}
	return null;
}

export function scanRecords() {
	const articles = getRecordArticles();

	articles.forEach((article, index) => {
		const node = findLeadingTextNode(article);
		if (!node) return;

		const current = node.nodeValue;
		const raw = rawBaseOf(index, current);
		if (raw === null) return; // 不是我們認得的內容，別動

		const name = labels[index];
		const want = name ? annotate(raw, name) : raw;

		// 只在真的不一樣時才寫，才不會沒完沒了地觸發自己的 MutationObserver。
		if (current !== want) node.nodeValue = want;
		applied[index] = { raw, text: want };
	});

	applied.length = articles.length;
}

// characterData 也要監聽：最新一筆是用「改既有節點的文字」的方式更新的，
// 只聽 childList 會完全漏掉它。scanRecords 是冪等的（內容已經正確時不會再寫），
// 所以被自己的修改再觸發一次也會自然收斂，不會無限迴圈。
export function startRecordObserver(target = document.body) {
	const observer = new MutationObserver(() => scanRecords());
	observer.observe(target, {
		childList: true,
		subtree: true,
		characterData: true,
	});
	return observer;
}

/** 測試用。 */
export function resetRecords() {
	labels = [];
	applied = [];
}

/** 測試用：目前的對照表（0 = 最新一筆）。 */
export function getLabels() {
	return labels.slice();
}
