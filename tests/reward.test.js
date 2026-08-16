import { beforeEach, describe, expect, it, vi } from "vitest";
import { STATE_CHANGED, on, resetBus } from "../src/bus.js";
import { ACTION_NAMES, REWARD_NAME } from "../src/constants.js";
import {
	applyRewardOverlay,
	resetRewardOverlay,
	setRewardOverlay,
} from "../src/reward.js";
import { reloadState, state } from "../src/state.js";

function setupPage({ rewardDisabled = false } = {}) {
	document.body.innerHTML = "<div id='row'></div><div id='floor'></div>";
	const row = document.getElementById("row");
	ACTION_NAMES.forEach((n) => {
		const btn = document.createElement("button");
		btn.textContent = n;
		row.appendChild(btn);
	});
	const reward = document.createElement("button");
	reward.textContent = REWARD_NAME;
	reward.disabled = rewardDisabled;
	document.getElementById("floor").appendChild(reward);
	return { row, reward };
}

function overlayIn(row) {
	return Array.from(row.querySelectorAll("button[data-sao-helper]")).find(
		(b) => b.textContent === REWARD_NAME,
	);
}

describe("reward - 領取獎勵覆蓋", () => {
	beforeEach(() => {
		localStorage.clear();
		resetBus();
		resetRewardOverlay();
		reloadState();
	});

	it("開關關閉時不會出現覆蓋按鈕", () => {
		const { row } = setupPage();
		state.rewardOverlay = false;
		applyRewardOverlay();
		expect(overlayIn(row)).toBeUndefined();
	});

	it("開關開啟且獎勵可領取時，覆蓋按鈕會蓋在行動按鈕列上", () => {
		const { row } = setupPage();
		state.rewardOverlay = true;
		applyRewardOverlay();

		const overlay = overlayIn(row);
		expect(overlay).toBeDefined();
		expect(overlay.style.position).toBe("absolute");
		expect(row.style.position).toBe("relative"); // 容器要能定位
	});

	it("獎勵還不能領取時不會出現", () => {
		const { row } = setupPage({ rewardDisabled: true });
		state.rewardOverlay = true;
		applyRewardOverlay();
		expect(overlayIn(row)).toBeUndefined();
	});

	it("從可領取變成不可領取時，覆蓋按鈕會被移掉", () => {
		const { row, reward } = setupPage();
		state.rewardOverlay = true;
		applyRewardOverlay();
		expect(overlayIn(row)).toBeDefined();

		reward.disabled = true;
		applyRewardOverlay();
		expect(overlayIn(row)).toBeUndefined();
	});

	it("點覆蓋按鈕會轉去點遊戲原本的領取按鈕", () => {
		const { row, reward } = setupPage();
		const spy = vi.spyOn(reward, "click");
		state.rewardOverlay = true;
		applyRewardOverlay();

		overlayIn(row).click();
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it("重複套用不會疊出兩顆覆蓋按鈕", () => {
		const { row } = setupPage();
		state.rewardOverlay = true;
		applyRewardOverlay();
		applyRewardOverlay();
		applyRewardOverlay();

		expect(row.querySelectorAll("button[data-sao-helper]")).toHaveLength(1);
	});

	it("行動按鈕還沒渲染出來時不會出錯", () => {
		document.body.innerHTML = "";
		state.rewardOverlay = true;
		expect(() => applyRewardOverlay()).not.toThrow();
	});

	it("切換開關會存檔並通知重繪", () => {
		setupPage();
		let changes = 0;
		on(STATE_CHANGED, () => changes++);

		setRewardOverlay(true);
		expect(state.rewardOverlay).toBe(true);
		expect(changes).toBe(1);

		reloadState();
		expect(state.rewardOverlay).toBe(true);
	});
});
