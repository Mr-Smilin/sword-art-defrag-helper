// 循環行動順序：按鈕顯示控制與序列編輯。
//
// 這裡只負責「改狀態」，改完發 STATE_CHANGED 事件；重繪面板是 ui/order-panel.js 訂閱後自己做的。
// 這樣可以避免 order.js 跟 ui/order-panel.js 互相 import 形成循環相依。

import { STATE_CHANGED, emit } from "./bus.js";
import { ACTION_NAMES } from "./constants.js";
import { getActionButtonMap } from "./dom.js";
import {
	defaultSequence,
	resetProgress,
	save,
	state,
	currentStep,
} from "./state.js";

// 只剩一顆行動按鈕時，把它稍微放大一點，比較好點擊（不是縮小成一小格）。
export const ENLARGED_BUTTON_STYLE = {
	minWidth: "200px",
	minHeight: "60px",
	fontSize: "22px",
	padding: "16px 28px",
};

function clearEnlargedButton(btn) {
	btn.style.minWidth = "";
	btn.style.minHeight = "";
	btn.style.fontSize = "";
	btn.style.padding = "";
}

export function applyOrderVisibility() {
	const map = getActionButtonMap();
	if (!state.orderMode) {
		ACTION_NAMES.forEach((n) => {
			if (!map[n]) return;
			map[n].style.removeProperty("display");
			clearEnlargedButton(map[n]);
		});
		return;
	}
	const step = currentStep();
	const current = step ? step.name : null;
	ACTION_NAMES.forEach((n) => {
		if (!map[n]) return;
		const btn = map[n];
		if (n === current) {
			btn.style.display = "";
			Object.assign(btn.style, ENLARGED_BUTTON_STYLE);
		} else {
			btn.style.display = "none";
			clearEnlargedButton(btn);
		}
	});
}

function commit() {
	save();
	emit(STATE_CHANGED);
}

export function setOrderMode(enabled) {
	state.orderMode = !!enabled;
	commit();
}

export function moveSeqItem(index, dir) {
	const newIndex = index + dir;
	if (newIndex < 0 || newIndex >= state.sequence.length) return;
	const arr = state.sequence;
	[arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
	resetProgress();
	commit();
}

export function addSeqItem() {
	state.sequence.push({ name: ACTION_NAMES[0], count: 1 });
	commit();
}

export function removeSeqItem(index) {
	if (state.sequence.length <= 1) return; // 至少保留一步
	state.sequence.splice(index, 1);
	resetProgress();
	commit();
}

export function setSeqItemName(index, name) {
	const item = state.sequence[index];
	if (!item || !ACTION_NAMES.includes(name)) return;
	item.name = name;
	resetProgress();
	commit();
}

/** 設定某一步要連點幾次；回傳實際採用的值（會被夾在 1~99）。 */
export function setSeqItemCount(index, count) {
	const item = state.sequence[index];
	if (!item) return null;
	const value = Math.max(1, Math.min(99, parseInt(count, 10) || 1));
	item.count = value;
	resetProgress();
	commit();
	return value;
}

export function resetSequenceProgress() {
	resetProgress();
	commit();
}

export function restoreDefaultSequence() {
	state.sequence = defaultSequence();
	resetProgress();
	commit();
}
