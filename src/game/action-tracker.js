// 把「點了哪顆按鈕」跟「API 說這一動成功沒」接起來。
//
// 配對策略：
//   主鍵用 request body 帶的 actionId，因為那是伺服器認定的行動，最不會錯。
//   第一次遇到沒見過的 actionId 時，用「剛剛點的那顆按鈕」把對照學起來並存進 localStorage
//   —— 遊戲有行動冷卻、請求是序列化的，同一時間幾乎不可能有兩筆在途，所以這個配對可靠。
//   萬一連 actionId 都拿不到（例如遊戲改用別的傳法），就退回單純用點擊順序配對。

import { ACTION_RESULT, STATE_CHANGED, emit, on } from "../core/bus.js";
import { actionNameFromId, learnActionId } from "./action-api.js";
import { ACTION_NAMES } from "../core/constants.js";
import { recordSuccess } from "../features/records.js";
import { advanceStep, currentStep, save, state } from "../core/state.js";

const pendingClicks = []; // 點過但還沒收到 API 回應的行動名稱（先進先出）
const MAX_PENDING = 20;

function handleClick(e) {
	const btn = e.target?.closest?.("button");
	if (!btn) return;
	if (btn.closest("[data-sao-helper]")) return; // 忽略我們自己加的控制項
	const text = btn.textContent.trim();
	if (!ACTION_NAMES.includes(text)) return;

	pendingClicks.push(text);
	if (pendingClicks.length > MAX_PENDING) pendingClicks.shift();
}

/** 收到一次行動結果。導出給測試直接呼叫。 */
export function handleActionResult({ actionId, success }) {
	const clicked = pendingClicks.shift() ?? null;

	let name = actionNameFromId(actionId);
	if (!name && actionId && clicked) {
		learnActionId(actionId, clicked);
		name = clicked;
	}
	if (!name) name = clicked;

	// 行動沒有成立（冷卻中、連線失敗、伺服器拒絕）：
	// 畫面不會多一筆紀錄，順序也必須停在原地等使用者重點一次。
	if (!success) return;

	// 成功一定會多一筆紀錄，直接推進對照表。
	// 就算 name 是 null 也要推，否則對照表會少佔一格，後面每一筆都跟著錯位。
	recordSuccess(name);

	if (state.orderMode && name) {
		const step = currentStep();
		if (step && name === step.name) {
			advanceStep();
			save();
		}
	}

	emit(STATE_CHANGED);
}

/**
 * 用事件代理監聽整個 document（capture），遊戲重新渲染按鈕節點也抓得到。
 * @returns {() => void} 解除監聽用（主要給測試重建環境）
 */
export function installActionTracker(target = document) {
	target.addEventListener("click", handleClick, true);
	const offActionResult = on(ACTION_RESULT, handleActionResult);
	return () => {
		target.removeEventListener("click", handleClick, true);
		offActionResult();
	};
}

/** 測試用。 */
export function resetActionTracker() {
	pendingClicks.length = 0;
}

/** 測試用。 */
export function getPendingClicks() {
	return pendingClicks.slice();
}
