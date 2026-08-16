// 在「挑戰」標題旁邊掛上安全模式開關。

import { setSafeChallengeOnly } from "../features/challenge.js";
import { getChallengeHeading } from "../game/dom.js";
import { state } from "../core/state.js";
import { checkboxRow } from "./components.js";

// 用一個獨特的標記值，重繪後才找得回自己掛上去的那一顆。
const TOGGLE_MARK = "challenge-toggle";

/**
 * 確保開關存在且狀態正確。
 *
 * 這裡刻意做成「每次呼叫都檢查一遍」而不是只掛一次：
 *   1. /profile/ 是另一個頁面，使用者可能是在站內切換過去的，掛載當下畫面還沒有挑戰卡片；
 *   2. React 重繪時會把我們插進去的節點整個移除。
 * 由 reconcile 迴圈每秒呼叫，兩種情況都能自動補回來。
 *
 * @returns {HTMLElement|null} 開關節點；畫面上沒有挑戰卡片時回傳 null
 */
export function ensureChallengeToggle() {
	const heading = getChallengeHeading();
	const header = heading?.parentElement;
	if (!header) return null;

	const existing = header.querySelector(`[data-sao-helper="${TOGGLE_MARK}"]`);
	if (existing) {
		// 節點還在，只要把勾選狀態同步回來就好（例如從別處改了設定）。
		const checkbox = existing.querySelector("input");
		if (checkbox) checkbox.checked = state.safeChallengeOnly;
		return existing;
	}

	const { row } = checkboxRow(
		"只顯示友好切磋",
		state.safeChallengeOnly,
		setSafeChallengeOnly,
	);
	row.setAttribute("data-sao-helper", TOGGLE_MARK);
	// 網站自己的卡片標題列有一條規則：只要底下出現 data-slot="card-action"，
	// 就會從單欄變成 [1fr auto] 兩欄，把 action 排到標題右邊。
	// 這裡沿用同一套機制，開關就會出現在「挑戰」旁邊而不是換行到下面。
	row.setAttribute("data-slot", "card-action");
	Object.assign(row.style, {
		justifySelf: "end",
		alignSelf: "center",
		whiteSpace: "nowrap",
	});

	header.appendChild(row);
	return row;
}
