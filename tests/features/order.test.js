import { beforeEach, describe, expect, it } from "vitest";
import { STATE_CHANGED, on, resetBus } from "../../src/core/bus.js";
import { ACTION_NAMES } from "../../src/core/constants.js";
import {
	addSeqItem,
	applyOrderVisibility,
	moveSeqItem,
	removeSeqItem,
	resetSequenceProgress,
	restoreDefaultSequence,
	setOrderMode,
	setSeqItemCount,
	setSeqItemName,
} from "../../src/features/order.js";
import { defaultSequence, reloadState, state } from "../../src/core/state.js";

function renderActionButtons() {
	document.body.innerHTML = "<div id='row'></div>";
	const row = document.getElementById("row");
	ACTION_NAMES.forEach((n) => {
		const btn = document.createElement("button");
		btn.textContent = n;
		row.appendChild(btn);
	});
	return row;
}

function visibleActionNames() {
	return Array.from(document.querySelectorAll("#row button"))
		.filter((b) => b.style.display !== "none")
		.map((b) => b.textContent);
}

describe("order - 按鈕顯示控制", () => {
	beforeEach(() => {
		localStorage.clear();
		resetBus();
		reloadState();
		renderActionButtons();
	});

	it("關閉順序模式時，全部按鈕都顯示", () => {
		state.orderMode = false;
		applyOrderVisibility();
		expect(visibleActionNames()).toEqual(ACTION_NAMES);
	});

	it("啟用順序模式時，只顯示當前輪到的行動", () => {
		state.orderMode = true;
		state.sequence = [
			{ name: "釣魚", count: 1 },
			{ name: "汁妹", count: 1 },
		];
		state.stepIndex = 0;
		applyOrderVisibility();

		expect(visibleActionNames()).toEqual(["釣魚"]);
	});

	it("僅存的那顆按鈕會被放大，方便點擊", () => {
		state.orderMode = true;
		state.sequence = [{ name: "釣魚", count: 1 }];
		state.stepIndex = 0;
		applyOrderVisibility();

		const btn = Array.from(document.querySelectorAll("button")).find(
			(b) => b.textContent === "釣魚",
		);
		expect(btn.style.minWidth).toBe("200px");
		expect(btn.style.fontSize).toBe("22px");
	});

	it("關掉順序模式後，放大的樣式會被清掉", () => {
		state.orderMode = true;
		state.sequence = [{ name: "釣魚", count: 1 }];
		applyOrderVisibility();
		state.orderMode = false;
		applyOrderVisibility();

		const btn = Array.from(document.querySelectorAll("button")).find(
			(b) => b.textContent === "釣魚",
		);
		expect(btn.style.minWidth).toBe("");
		expect(btn.style.fontSize).toBe("");
		expect(visibleActionNames()).toEqual(ACTION_NAMES);
	});

	it("按鈕還沒渲染出來時不會出錯", () => {
		document.body.innerHTML = "";
		state.orderMode = true;
		expect(() => applyOrderVisibility()).not.toThrow();
	});
});

describe("order - 序列編輯", () => {
	let changes;

	beforeEach(() => {
		localStorage.clear();
		resetBus();
		reloadState();
		renderActionButtons();
		changes = 0;
		on(STATE_CHANGED, () => changes++);
		state.sequence = [
			{ name: "狩獵兔肉", count: 1 },
			{ name: "釣魚", count: 2 },
			{ name: "汁妹", count: 1 },
		];
		state.stepIndex = 1;
		state.stepProgress = 1;
	});

	it("上移／下移會交換順序並重設進度", () => {
		moveSeqItem(1, -1);
		expect(state.sequence.map((s) => s.name)).toEqual([
			"釣魚",
			"狩獵兔肉",
			"汁妹",
		]);
		expect(state.stepIndex).toBe(0);
		expect(state.stepProgress).toBe(0);
		expect(changes).toBe(1);
	});

	it("移出邊界時什麼都不做", () => {
		moveSeqItem(0, -1);
		moveSeqItem(2, 1);
		expect(state.sequence.map((s) => s.name)).toEqual([
			"狩獵兔肉",
			"釣魚",
			"汁妹",
		]);
		expect(changes).toBe(0);
	});

	it("新增步驟會加在最後面", () => {
		addSeqItem();
		expect(state.sequence).toHaveLength(4);
		expect(state.sequence[3]).toEqual({ name: ACTION_NAMES[0], count: 1 });
	});

	it("刪除步驟", () => {
		removeSeqItem(1);
		expect(state.sequence.map((s) => s.name)).toEqual(["狩獵兔肉", "汁妹"]);
	});

	it("至少保留一步，不能刪光", () => {
		state.sequence = [{ name: "釣魚", count: 1 }];
		removeSeqItem(0);
		expect(state.sequence).toHaveLength(1);
		expect(changes).toBe(0);
	});

	it("改變步驟的行動名稱", () => {
		setSeqItemName(0, "做善事");
		expect(state.sequence[0].name).toBe("做善事");
		expect(state.stepProgress).toBe(0);
	});

	it("不合法的行動名稱會被忽略", () => {
		setSeqItemName(0, "不存在的行動");
		expect(state.sequence[0].name).toBe("狩獵兔肉");
		expect(changes).toBe(0);
	});

	it("次數會被夾在 1~99 並回傳實際採用的值", () => {
		expect(setSeqItemCount(0, 500)).toBe(99);
		expect(state.sequence[0].count).toBe(99);
		expect(setSeqItemCount(0, 0)).toBe(1);
		expect(setSeqItemCount(0, "abc")).toBe(1);
		expect(setSeqItemCount(99, 5)).toBeNull(); // 索引不存在
	});

	it("重設進度", () => {
		resetSequenceProgress();
		expect(state.stepIndex).toBe(0);
		expect(state.stepProgress).toBe(0);
	});

	it("還原預設順序", () => {
		restoreDefaultSequence();
		expect(state.sequence).toEqual(defaultSequence());
		expect(state.stepIndex).toBe(0);
	});

	it("切換順序模式會存檔並通知重繪", () => {
		setOrderMode(true);
		expect(state.orderMode).toBe(true);
		expect(changes).toBe(1);

		reloadState();
		expect(state.orderMode).toBe(true); // 有寫進 localStorage
	});
});
