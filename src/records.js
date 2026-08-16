// 行動記錄自動補上行動名稱。
//
// 遊戲原本的「行動記錄」只會顯示「行動成功！獲得了 xx 點經驗值。」，沒有講是哪個行動。
//
// ★ 這一段被改寫過好幾次，因為遊戲的紀錄清單有兩個很容易踩雷的特性
//   （下面兩點是實際在頁面上量測出來的，不是猜的）：
//
//   1. 清單是「最新的在最上面」，但 React 是用「位置」在對應節點，不是用內容。
//      新增一筆紀錄時，它並不會在最上面插入一個新的 <article>，
//      而是把「既有每個節點的文字」整批往下挪一格重寫，然後在「最後面」補一個新節點。
//      => 最新的那筆紀錄是「改既有節點的文字」，不會觸發 childList 的新增節點事件；
//         真正被新增的那個節點反而裝的是「最舊」的那筆內容。
//
//   2. 每次重繪，React 都會用它自己資料裡的原始文字覆蓋回去，
//      也就是我們改過的字會被整個蓋掉、變回「行動成功！...」。
//      => 標註不能只做一次，必須在每次重繪後持續重新套用。
//
// 所以做法是：自己維護一份「第幾筆紀錄 = 哪個行動」的對照表（labels，索引 0 是最新一筆），
// 每次重繪後都依照這份對照表把名字重新補回去。
//
// ★★ 「什麼時候該往對照表推一筆新的」這件事，過去是靠比對最上面那筆文字有沒有變，
//    但連續兩次同樣行動又拿到相同經驗值時文字會一模一樣，會直接漏判並永久錯位。
//    現在改成兩段式：
//      (a) 由網路層（network.js）確認 API 回應成功後，先把名字放進 awaiting 排隊；
//          失敗的行動根本不會進來，所以也不會誤推。
//      (b) 等 DOM 真的發生「整批往下位移」時才 commit 進 labels。
//    位移偵測比對的是「現在的第 k 筆 == 上一輪的第 1 筆」，也就是看『位置有沒有挪動』，
//    而不是看『內容有沒有改變』，所以文字重複也判得出來。

import { RAW_RECORD_PREFIX } from "./constants.js";
import { findLeadingTextNode, getRecordArticles } from "./dom.js";

let labels = []; // labels[i] = 第 i 筆紀錄（0 = 最新）對應的行動名稱，沒有就是 null
let awaiting = []; // 已確認成功、但 DOM 還沒長出對應紀錄的行動（先進先出）
let lastCount = 0; // 上次看到的紀錄筆數
let lastTopRaw = null; // 上次看到的「最新一筆」的原始文字（還原成未標註的樣子）
let lastSignature = null; // 上次整份清單的原始文字簽章，用來確認「這次掃描到底有沒有東西動過」

// 萬一某次成功的行動因為不明原因始終沒有對應的紀錄出現，
// 讓它逾時被丟掉，避免它卡在隊伍最前面害後面每一筆都錯位。
const AWAITING_TIMEOUT_MS = 15000;

// 串接整份清單做簽章用的分隔字元。
// 用 NUL 而不是空白，是因為紀錄文字本身就含空白，用空白會讓相鄰兩筆的邊界變得不明確。
const RECORD_SEPARATOR = "\u0000";

/** 網路層確認行動成功後呼叫；name 可以是 null（成功但認不出是哪個行動）。 */
export function queueLabel(name) {
	awaiting.push({ name: name ?? null, at: Date.now() });
}

function dropExpired() {
	const now = Date.now();
	while (awaiting.length && now - awaiting[0].at > AWAITING_TIMEOUT_MS) {
		awaiting.shift();
	}
}

/**
 * 取得某筆紀錄「還原成未標註」的原始文字。
 * 已經被我們改過名字的，會把名字換回「行動」兩個字再回傳，
 * 這樣不管有沒有標註過，同一筆紀錄算出來的字串都一樣，才能拿來比對位移。
 */
function rawTextOf(article, labelName) {
	if (!article) return null;
	const node = findLeadingTextNode(article);
	if (!node) return null;
	const raw = node.nodeValue;
	const trimmed = raw.trimStart();
	if (trimmed.startsWith(RAW_RECORD_PREFIX)) return raw;
	if (labelName && trimmed.startsWith(labelName)) {
		const lead = raw.length - trimmed.length;
		return (
			raw.slice(0, lead) + RAW_RECORD_PREFIX + raw.slice(lead + labelName.length)
		);
	}
	return raw;
}

/**
 * 偵測清單往下位移了幾格：找出「上一輪的第 1 筆」現在跑到第幾個位置去了。
 * 從大往小找，是為了處理「兩次掃描之間連續進來多筆」的情況。
 * 上限鎖在 awaiting.length，確保絕不會推出比實際確認成功還多的筆數。
 */
function detectShiftAmount(raws) {
	if (lastTopRaw === null) return 0;
	const max = Math.min(raws.length - 1, awaiting.length);
	for (let k = max; k >= 1; k--) {
		if (raws[k] === lastTopRaw) return k;
	}
	return 0;
}

/**
 * 依照對照表把名字補回去。
 * React 每次重繪都會把我們改的字蓋回原文，所以這裡每次都要重新套用一遍。
 * 已經是我們改過的（開頭不是「行動」）就會自動跳過，重複執行不會有副作用。
 */
function applyLabels(articles) {
	articles.forEach((article, i) => {
		const name = labels[i];
		if (!name) return;
		const node = findLeadingTextNode(article);
		if (!node) return;
		const raw = node.nodeValue;
		const trimmed = raw.trimStart();
		if (!trimmed.startsWith(RAW_RECORD_PREFIX)) return; // 開頭不是「行動」→ 不處理
		const lead = raw.length - trimmed.length; // 開頭空白數，也就是「行動」的起始位置
		node.nodeValue =
			raw.slice(0, lead) + name + raw.slice(lead + RAW_RECORD_PREFIX.length);
	});
}

export function scanRecords() {
	const articles = getRecordArticles();
	const n = articles.length;
	if (!n) {
		lastCount = 0;
		lastTopRaw = null;
		lastSignature = null;
		return;
	}

	dropExpired();

	// 先把每一筆都還原成「未標註」的樣子再比對，這樣自己上一輪加的名字不會干擾判斷。
	const raws = articles.map((a, i) => rawTextOf(a, labels[i]));
	const signature = raws.join(RECORD_SEPARATOR);

	let newCount = 0;
	if (n > lastCount) {
		// 清單還沒滿，筆數變多了。
		// 這裡不鎖 awaiting.length，是為了讓「腳本載入前就已存在的舊紀錄」也能佔位（標成 null）。
		newCount = n - lastCount;
	} else if (awaiting.length && signature !== lastSignature) {
		// 清單已達上限、筆數不再變多，只能靠位移偵測。
		//
		// 這裡一定要先確認「整份清單的內容真的變過」才做位移比對。
		// 否則遇到相鄰兩筆文字剛好一模一樣、又碰上 React 把我們的標註蓋回原文的重繪時，
		// raws[1] === lastTopRaw 會成立，於是把還沒發生的位移誤判成已經發生，
		// 提早 commit 一格之後就再也對不回來了。
		newCount = detectShiftAmount(raws);
	}

	for (let k = 0; k < newCount; k++) {
		labels.unshift(awaiting.length ? awaiting.shift().name : null);
	}
	labels.length = n; // 跟目前筆數對齊（清單捲掉的舊紀錄就一起丟掉）

	applyLabels(articles);

	lastCount = n;
	lastTopRaw = raws[0];
	lastSignature = signature;
}

// characterData 也要監聽：最新一筆是用「改既有節點的文字」的方式更新的，
// 只聽 childList 會完全漏掉它。scanRecords 本身是冪等的（重複跑不會有副作用、
// 也不會再產生新的變動），所以被自己的修改再觸發一次也會自然收斂，不會無限迴圈。
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
	awaiting = [];
	lastCount = 0;
	lastTopRaw = null;
	lastSignature = null;
}

/** 測試用：目前的對照表（0 = 最新一筆）。 */
export function getLabels() {
	return labels.slice();
}

/** 測試用：還在等 DOM 出現的行動名稱。 */
export function getAwaiting() {
	return awaiting.map((a) => a.name);
}
