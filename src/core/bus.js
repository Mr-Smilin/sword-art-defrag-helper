// 極簡事件匯流排。
//
// 為什麼需要：拆檔之後，「改動狀態的模組」（order.js / reward.js）跟「重繪畫面的模組」
// （ui/order-panel.js）會互相需要對方 —— 前者改完要叫後者重畫，後者的按鈕又要呼叫前者。
// 直接 import 就會變成循環相依。改成前者只負責發事件、後者自己訂閱，相依方向就單向了。

const handlers = new Map();

/** 狀態有變動，需要重新套用畫面（按鈕顯示、面板內容、獎勵覆蓋）。 */
export const STATE_CHANGED = "state-changed";

/**
 * 一次行動的結果已經確定（由網路層發出）。
 * payload: { success: boolean, actionId: string|null, name: string|null }
 */
export const ACTION_RESULT = "action-result";

export function on(event, handler) {
	if (!handlers.has(event)) handlers.set(event, new Set());
	handlers.get(event).add(handler);
	return () => off(event, handler);
}

export function off(event, handler) {
	handlers.get(event)?.delete(handler);
}

export function emit(event, payload) {
	const set = handlers.get(event);
	if (!set) return;
	// 複製一份再跑，避免 handler 內部又註冊/移除造成迭代出錯。
	for (const handler of Array.from(set)) {
		try {
			handler(payload);
		} catch (err) {
			console.warn(`[SAO 輔助工具] 事件 ${event} 的處理器發生錯誤：`, err);
		}
	}
}

/** 測試用：清掉所有訂閱。 */
export function resetBus() {
	handlers.clear();
}
