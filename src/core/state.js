// 使用者設定與循環進度的狀態管理（含 localStorage 持久化）。

import { ACTION_NAMES, STORAGE_KEY } from "./constants.js";

// sequence 的每個項目是一個「步驟」：{ name: 行動名稱, count: 需要點幾次才會換下一步 }
// 例如：想要「自主訓練點兩次 -> 外出野餐點一次 -> 循環」
//   sequence = [ { name: '自主訓練', count: 2 }, { name: '外出野餐', count: 1 } ]
export const defaultSequence = () =>
	ACTION_NAMES.map((n) => ({ name: n, count: 1 }));

export const defaultState = () => ({
	orderMode: false, // 只顯示當前輪到的行動（其餘隱藏）
	sequence: defaultSequence(), // 自訂循環順序（可重複、可設定連續次數）
	stepIndex: 0, // 目前在序列的第幾步
	stepProgress: 0, // 目前這一步已經點了幾次
	rewardOverlay: false, // 可領取時，覆蓋在行動按鈕上
	// 挑戰只顯示「友好切磋」，其餘選項連同描述一起隱藏。
	// 預設開啟：其他選項都有機率讓角色死亡，誤點的代價太大。
	safeChallengeOnly: true,
});

export function sanitizeSequence(seq) {
	if (!Array.isArray(seq) || seq.length === 0) return null;
	const cleaned = seq
		.filter((s) => s && ACTION_NAMES.includes(s.name))
		.map((s) => ({
			name: s.name,
			count: Math.max(1, Math.min(99, parseInt(s.count, 10) || 1)),
		}));
	return cleaned.length ? cleaned : null;
}

export function loadState() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return defaultState();
		const parsed = JSON.parse(raw);
		const base = defaultState();
		const seq = sanitizeSequence(parsed.sequence);
		return {
			...base,
			...parsed,
			sequence: seq || defaultSequence(),
			stepIndex: Number.isInteger(parsed.stepIndex) ? parsed.stepIndex : 0,
			stepProgress: Number.isInteger(parsed.stepProgress)
				? parsed.stepProgress
				: 0,
		};
	} catch (e) {
		return defaultState();
	}
}

export let state = loadState();

export function save() {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch (err) {
		console.warn("[SAO 輔助工具] 設定存檔失敗：", err);
	}
}

/** 測試用：重新從 localStorage 讀回狀態。 */
export function reloadState() {
	state = loadState();
	return state;
}

export function currentStep() {
	if (!state.sequence.length) return null;
	// 取模兩次是為了讓負數的 stepIndex 也能被折回合法範圍。
	state.stepIndex =
		((state.stepIndex % state.sequence.length) + state.sequence.length) %
		state.sequence.length;
	return state.sequence[state.stepIndex];
}

export function resetProgress() {
	state.stepIndex = 0;
	state.stepProgress = 0;
}

/**
 * 完成當前步驟的一次計數；點滿 count 次就換下一步。
 * @returns {boolean} 是否換到了下一步
 */
export function advanceStep() {
	const step = currentStep();
	if (!step) return false;
	state.stepProgress += 1;
	if (state.stepProgress < step.count) return false;
	state.stepProgress = 0;
	state.stepIndex = (state.stepIndex + 1) % state.sequence.length;
	return true;
}
