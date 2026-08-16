// 定位遊戲原本的畫面元素。
//
// 這裡全部是「用文字內容找節點」而不是用 class/id，因為網站是 React + Tailwind，
// class 名稱是編譯產生的、每次改版都可能變，但畫面上的中文字相對穩定得多。

import { ACTION_NAMES, REWARD_NAME } from "./constants.js";

// 一律排除我們自己加的控制項（都帶 data-sao-helper）。
//
// ★ 這個排除是必要的，不是保險：「領取獎勵」覆蓋按鈕的文字跟遊戲原本那顆一模一樣，
//   不排掉的話 getRewardButton() 會依 DOM 順序找到我們自己蓋上去的那顆，造成
//   (a) 點覆蓋按鈕變成點自己，什麼都不會發生；
//   (b) 獎勵領完後 disabled 狀態讀的是覆蓋按鈕自己的，導致它不會消失。
export function getAllButtons() {
	return Array.from(document.querySelectorAll("button:not([data-sao-helper])"));
}

export function getActionButtonMap() {
	const all = getAllButtons();
	const map = {};
	ACTION_NAMES.forEach((n) => {
		map[n] = all.find((b) => b.textContent.trim() === n) || null;
	});
	return map;
}

export function getRewardButton() {
	return (
		getAllButtons().find((b) => b.textContent.trim() === REWARD_NAME) || null
	);
}

export function getActionButtonsRow() {
	const map = getActionButtonMap();
	const first = ACTION_NAMES.map((n) => map[n]).find(Boolean);
	return first ? first.parentElement : null;
}

/** 找出畫面上文字「完全等於」指定字串的最小節點（不含子元素），用來定位標題。 */
export function findLeafByExactText(text) {
	const all = document.querySelectorAll("body *");
	for (const el of all) {
		if (el.children.length === 0 && el.textContent.trim() === text) return el;
	}
	return null;
}

// 剛載入網頁時，遊戲畫面可能還沒渲染出來，直接查會查不到。
// 這裡改成輪詢：每 150ms 查一次，最多等 5 秒，找到就馬上回傳，逾時回傳 null。
export function waitForLeafByExactText(
	text,
	{ timeout = 5000, interval = 150 } = {},
) {
	return new Promise((resolve) => {
		const start = Date.now();
		(function tryFind() {
			const found = findLeafByExactText(text);
			if (found) return resolve(found);
			if (Date.now() - start >= timeout) return resolve(null);
			setTimeout(tryFind, interval);
		})();
	});
}

export function getActionHeading() {
	return waitForLeafByExactText("行動");
}

export function getRewardHeading() {
	return waitForLeafByExactText("樓層獎勵");
}

export function getRecordArticles() {
	return Array.from(document.querySelectorAll("article"));
}

/** 找出節點裡「文件順序上第一個非空白文字節點」，也就是真正裝訊息的那個文字節點。 */
export function findLeadingTextNode(root) {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let n;
	while ((n = walker.nextNode())) {
		if (n.nodeValue && n.nodeValue.trim() !== "") return n;
	}
	return null;
}
