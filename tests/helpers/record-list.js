// 模擬遊戲「行動記錄」清單的 React 渲染行為。
//
// 重現的關鍵特性（src/records.js 開頭有完整說明）：
//   1. 最新的在最上面，但節點是「照位置重複使用」的：新增一筆時是把既有節點的文字
//      整批往下挪一格重寫，新的 <article> 節點是補在「最後面」。
//   2. 重繪時會用它自己資料裡的原始文字覆蓋回去，把我們補上的行動名稱蓋掉。
//   3. ★ 但 React 只會在「值真的不一樣」時才去寫 DOM。
//      兩筆紀錄的文字完全相同時（同一個行動、同樣的經驗值），它一個字都不會動 ——
//      節點語意上已經換成新的那筆紀錄了，畫面上卻還留著我們替舊紀錄寫的行動名稱。
//      這一點是這個 fixture 最重要的部分：不重現它就測不到真正會出事的那條路徑。
//
// 測試如果不重現這三點，就測不到真正會出事的那條路徑。

/**
 * @param {HTMLElement} container 放 <article> 的容器
 * @param {number} cap 清單最多保留幾筆（超過就把最舊的擠掉）
 */
export function createRecordList(container, cap = 5) {
	/** @type {string[]} texts[0] 是最新一筆 */
	const texts = [];

	// React 上一次渲染時，每個位置實際的資料值。
	// 它是拿這份去比對新資料的，不是拿 DOM 現況去比。
	const rendered = [];

	function render() {
		// 不足的節點補在最後面（跟 React 的行為一致）
		while (container.querySelectorAll("article").length < texts.length) {
			const article = document.createElement("article");
			const inner = document.createElement("div");
			inner.appendChild(document.createTextNode(""));
			article.appendChild(inner);
			container.appendChild(article);
		}
		const articles = Array.from(container.querySelectorAll("article"));
		articles.forEach((article, i) => {
			const next = texts[i] ?? "";
			// ★ 值沒變就完全不碰 DOM —— 這正是 React 的實際行為，
			//   也是「經驗值相同時舊標註不會被蓋掉」的來源。
			if (rendered[i] === next) return;
			article.firstChild.firstChild.nodeValue = next;
			rendered[i] = next;
		});
		rendered.length = articles.length;
	}

	return {
		/** 新增一筆紀錄（最新的會出現在最上面）。 */
		push(text) {
			texts.unshift(text);
			if (texts.length > cap) texts.pop();
			render();
		},
		/**
		 * 只重繪，不新增。
		 * 因為值沒變，React 什麼都不會寫 —— 我們的標註會原封不動留在畫面上。
		 */
		redraw() {
			render();
		},
		/**
		 * 模擬元件重新掛載：React 忘記上一次渲染的值，於是把每個位置都重寫一遍，
		 * 我們補上的行動名稱會被整批蓋回原文。
		 */
		forceRedraw() {
			rendered.length = 0;
			render();
		},
		/** 目前畫面上每一筆的實際文字（含我們補上的行動名稱）。 */
		visibleTexts() {
			return Array.from(container.querySelectorAll("article")).map((a) =>
				a.textContent.trim(),
			);
		},
	};
}

/** 遊戲原本的紀錄文字。 */
export function rawRecord(exp) {
	return `行動成功！獲得了 ${exp} 點經驗值。`;
}
