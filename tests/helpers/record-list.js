// 模擬遊戲「行動記錄」清單的 React 渲染行為。
//
// 重現的關鍵特性（src/records.js 開頭有完整說明）：
//   1. 最新的在最上面，但節點是「照位置重複使用」的：新增一筆時是把既有節點的文字
//      整批往下挪一格重寫，新的 <article> 節點是補在「最後面」。
//   2. 每次重繪都會用原始文字覆蓋回去，把我們補上的行動名稱蓋掉。
//
// 測試如果不重現這兩點，就測不到真正會出事的那條路徑。

/**
 * @param {HTMLElement} container 放 <article> 的容器
 * @param {number} cap 清單最多保留幾筆（超過就把最舊的擠掉）
 */
export function createRecordList(container, cap = 5) {
	/** @type {string[]} texts[0] 是最新一筆 */
	const texts = [];

	function render() {
		// 不足的節點補在最後面（跟 React 的行為一致）
		while (container.querySelectorAll("article").length < texts.length) {
			const article = document.createElement("article");
			const inner = document.createElement("div");
			inner.appendChild(document.createTextNode(""));
			article.appendChild(inner);
			container.appendChild(article);
		}
		// 照位置把文字整批重寫（會覆蓋掉我們補上的行動名稱）
		const articles = Array.from(container.querySelectorAll("article"));
		articles.forEach((article, i) => {
			const textNode = article.firstChild.firstChild;
			textNode.nodeValue = texts[i] ?? "";
		});
	}

	return {
		/** 新增一筆紀錄（最新的會出現在最上面）。 */
		push(text) {
			texts.unshift(text);
			if (texts.length > cap) texts.pop();
			render();
		},
		/** 只重繪，不新增：模擬 React 因為其他狀態變動把我們的標註蓋回原文。 */
		redraw() {
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
