import { beforeEach, describe, expect, it } from "vitest";
import { ACTION_NAMES, STORAGE_KEY } from "../src/constants.js";
import {
	advanceStep,
	currentStep,
	defaultSequence,
	loadState,
	reloadState,
	resetProgress,
	sanitizeSequence,
	save,
	state,
} from "../src/state.js";

describe("state - sanitizeSequence", () => {
	it("保留合法步驟", () => {
		expect(
			sanitizeSequence([
				{ name: "釣魚", count: 3 },
				{ name: "汁妹", count: 1 },
			]),
		).toEqual([
			{ name: "釣魚", count: 3 },
			{ name: "汁妹", count: 1 },
		]);
	});

	it("濾掉不存在的行動名稱", () => {
		expect(
			sanitizeSequence([{ name: "不存在的行動", count: 1 }, { name: "釣魚", count: 1 }]),
		).toEqual([{ name: "釣魚", count: 1 }]);
	});

	it("count 會被夾在 1~99", () => {
		expect(sanitizeSequence([{ name: "釣魚", count: 0 }])[0].count).toBe(1);
		expect(sanitizeSequence([{ name: "釣魚", count: -5 }])[0].count).toBe(1);
		expect(sanitizeSequence([{ name: "釣魚", count: 999 }])[0].count).toBe(99);
		expect(sanitizeSequence([{ name: "釣魚", count: "abc" }])[0].count).toBe(1);
	});

	it("完全不合法時回傳 null", () => {
		expect(sanitizeSequence(null)).toBeNull();
		expect(sanitizeSequence([])).toBeNull();
		expect(sanitizeSequence("nope")).toBeNull();
		expect(sanitizeSequence([{ name: "不存在的行動", count: 1 }])).toBeNull();
	});
});

describe("state - 持久化", () => {
	beforeEach(() => {
		localStorage.clear();
		reloadState();
	});

	it("沒有存檔時使用預設值", () => {
		expect(state.orderMode).toBe(false);
		expect(state.rewardOverlay).toBe(false);
		expect(state.sequence).toEqual(defaultSequence());
		expect(state.sequence).toHaveLength(ACTION_NAMES.length);
	});

	it("存檔後可以讀回來", () => {
		state.orderMode = true;
		state.sequence = [{ name: "釣魚", count: 4 }];
		state.stepIndex = 0;
		state.stepProgress = 2;
		save();

		const loaded = reloadState();
		expect(loaded.orderMode).toBe(true);
		expect(loaded.sequence).toEqual([{ name: "釣魚", count: 4 }]);
		expect(loaded.stepProgress).toBe(2);
	});

	it("存檔壞掉時退回預設值，不會拋錯", () => {
		localStorage.setItem(STORAGE_KEY, "{{{ not json");
		expect(() => reloadState()).not.toThrow();
		expect(state.sequence).toEqual(defaultSequence());
	});

	it("存檔裡的 sequence 不合法時退回預設順序", () => {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ orderMode: true, sequence: [{ name: "亂寫", count: 1 }] }),
		);
		reloadState();
		expect(state.orderMode).toBe(true);
		expect(state.sequence).toEqual(defaultSequence());
	});

	it("stepIndex / stepProgress 不是整數時歸零", () => {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ stepIndex: "x", stepProgress: null }),
		);
		reloadState();
		expect(state.stepIndex).toBe(0);
		expect(state.stepProgress).toBe(0);
	});
});

describe("state - 步驟推進", () => {
	beforeEach(() => {
		localStorage.clear();
		reloadState();
		state.sequence = [
			{ name: "自主訓練", count: 2 },
			{ name: "釣魚", count: 1 },
		];
		resetProgress();
	});

	it("currentStep 回傳目前這一步", () => {
		expect(currentStep()).toEqual({ name: "自主訓練", count: 2 });
	});

	it("stepIndex 超出範圍時會折回合法區間", () => {
		state.stepIndex = 5;
		expect(currentStep()).toEqual({ name: "釣魚", count: 1 }); // 5 % 2 = 1
		state.stepIndex = -1;
		expect(currentStep()).toEqual({ name: "釣魚", count: 1 });
	});

	it("點滿 count 次才換下一步", () => {
		expect(advanceStep()).toBe(false);
		expect(state.stepProgress).toBe(1);
		expect(state.stepIndex).toBe(0);

		expect(advanceStep()).toBe(true);
		expect(state.stepProgress).toBe(0);
		expect(state.stepIndex).toBe(1);
	});

	it("跑完全部步驟會從頭循環", () => {
		advanceStep();
		advanceStep(); // -> 步驟 2
		expect(state.stepIndex).toBe(1);
		expect(advanceStep()).toBe(true); // 步驟 2 只要一次
		expect(state.stepIndex).toBe(0);
	});

	it("resetProgress 會歸零", () => {
		advanceStep();
		resetProgress();
		expect(state.stepIndex).toBe(0);
		expect(state.stepProgress).toBe(0);
	});

	it("sequence 是空的時候不會出錯", () => {
		state.sequence = [];
		expect(currentStep()).toBeNull();
		expect(advanceStep()).toBe(false);
	});
});
