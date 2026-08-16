// 進入點：把各模組接起來。
//
// 資料流：
//   點按鈕 ─┐
//           ├─> action-tracker ─(成功)─> records.queueLabel  ─> scanRecords 補上行動名稱
//   API 回應┘                  └─(成功)─> state.advanceStep  ─> STATE_CHANGED ─> 重繪畫面
//                              └─(失敗)─> 什麼都不做（順序停在原地）
//
// 目錄分工：
//   core/     事件匯流排、常數、狀態持久化（不碰畫面）
//   game/     定位遊戲原本的元素、攔截遊戲的 API 請求
//   features/ 各功能本身的邏輯
//   ui/       我們注入畫面的控制項

import { STATE_CHANGED, on } from "./core/bus.js";
import { installActionTracker } from "./game/action-tracker.js";
import { installNetworkHooks } from "./game/network.js";
import { applyChallengeFilter } from "./features/challenge.js";
import { applyOrderVisibility } from "./features/order.js";
import { scanRecords, startRecordObserver } from "./features/records.js";
import { applyRewardOverlay } from "./features/reward.js";
import { ensureChallengeToggle } from "./ui/challenge-toggle.js";
import { mountOrderEditor, renderOrderUI } from "./ui/order-panel.js";
import { mountRewardToggle } from "./ui/reward-toggle.js";

// Tampermonkey 正常只會注入一次，不會遇到這個情況；只有手動重複貼上 Console 才需要擔心。
function alreadyInjected() {
	if (window.__saoHelperInjected) {
		console.warn(
			"[SAO 輔助工具] 偵測到已經注入過，略過重複注入（如需重新載入請重新整理頁面）。",
		);
		return true;
	}
	window.__saoHelperInjected = true;
	return false;
}

// 主要邏輯已經在點擊/API 回應/切換開關/編輯順序當下同步套用了；這裡保留低頻率輪詢當保險。
// 挑戰安全模式則是「必須」靠它：/profile/ 是另一個頁面，站內切換過去時
// 掛載當下畫面上還沒有挑戰卡片，得等它出現才掛得上開關。
const RECONCILE_INTERVAL_MS = 1000;

function reconcile() {
	applyOrderVisibility();
	applyRewardOverlay();
	scanRecords();
	ensureChallengeToggle();
	applyChallengeFilter();
}

export function start() {
	// 攔截要盡早裝好，才不會漏掉使用者第一次點擊發出的請求。
	installNetworkHooks();
	installActionTracker();

	on(STATE_CHANGED, () => {
		applyOrderVisibility();
		applyRewardOverlay();
		renderOrderUI();
		applyChallengeFilter();
	});

	// 先掃一次，把「腳本載入前就已經存在的舊紀錄」登記起來（此時 awaiting 是空的，
	// 所以它們的對照名稱都會是 null），之後就不會去動到這些沒辦法對應行動的舊紀錄。
	scanRecords();
	startRecordObserver();

	mountRewardToggle();
	mountOrderEditor();
	applyOrderVisibility();
	applyRewardOverlay();

	ensureChallengeToggle();
	applyChallengeFilter();

	setInterval(reconcile, RECONCILE_INTERVAL_MS);
}

if (!alreadyInjected()) start();
