// 挑戰安全模式：/profile/ 頁面的「挑戰」卡片裡，只保留「友好切磋」。
//
// 挑戰卡片有四個選項，每個選項是一個 <article>，裡面裝一顆按鈕加一段描述：
//   友好切磋 / 認真對決 / 決一死戰 / 我要殺死你
// 除了友好切磋以外，全部都有機率讓角色直接死亡，誤點的代價很大，
// 所以預設把其餘三個連同描述一起隱藏，只留下友好切磋並把按鈕放大。
//
// 定位方式是「從按鈕文字往上找 <article>」而不是靠卡片的 class。
// 網站是 React + Tailwind，class 名稱是編譯產生的、改版就會變，但畫面上的中文字穩定得多。

import { STATE_CHANGED, emit } from "../core/bus.js";
import { SAFE_CHALLENGE_MODE } from "../core/constants.js";
import { save, state } from "../core/state.js";
import { getChallengeButtons } from "../game/dom.js";

// 只剩一顆按鈕時放大，比較好點，也讓「現在只有安全選項」這件事一眼看得出來。
const ENLARGED_CHALLENGE_BUTTON_STYLE = {
	minHeight: "56px",
	fontSize: "20px",
	padding: "14px 24px",
};

function clearEnlargedButton(btn) {
	btn.style.minHeight = "";
	btn.style.fontSize = "";
	btn.style.padding = "";
}

/**
 * 取得畫面上的挑戰選項。
 * @returns {Array<{ article: HTMLElement, button: HTMLElement, name: string }>}
 */
export function getChallengeItems() {
	const seen = new Set();
	const items = [];
	for (const button of getChallengeButtons()) {
		const article = button.closest("article");
		if (!article || seen.has(article)) continue;
		seen.add(article);
		items.push({ article, button, name: button.textContent.trim() });
	}
	return items;
}

/**
 * 依照目前設定套用顯示狀態。React 重繪後會把 inline style 清掉，
 * 所以這個函式設計成冪等的，由 reconcile 迴圈持續重新套用。
 * @returns {boolean} 畫面上是否有挑戰卡片
 */
export function applyChallengeFilter() {
	const items = getChallengeItems();
	if (!items.length) return false;

	for (const { article, button, name } of items) {
		if (!state.safeChallengeOnly) {
			article.style.removeProperty("display");
			article.style.removeProperty("grid-template-columns");
			clearEnlargedButton(button);
			continue;
		}

		if (name === SAFE_CHALLENGE_MODE) {
			article.style.removeProperty("display");
			// 原本是「按鈕 9rem ｜ 描述」兩欄；只剩一個選項時改成單欄，
			// 按鈕才能撐滿寬度，描述移到下方。
			article.style.gridTemplateColumns = "1fr";
			Object.assign(button.style, ENLARGED_CHALLENGE_BUTTON_STYLE);
		} else {
			article.style.display = "none";
			clearEnlargedButton(button);
		}
	}
	return true;
}

export function setSafeChallengeOnly(enabled) {
	state.safeChallengeOnly = !!enabled;
	save();
	emit(STATE_CHANGED);
}
