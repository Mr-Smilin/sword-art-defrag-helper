import { beforeEach, describe, expect, it } from "vitest";
import { resetActionIdMap } from "../src/action-api.js";
import {
	getPendingClicks,
	handleActionResult,
	installActionTracker,
	resetActionTracker,
} from "../src/action-tracker.js";
import { resetBus } from "../src/bus.js";
import { getAwaiting, resetRecords } from "../src/records.js";
import { reloadState, state } from "../src/state.js";

function clickAction(name) {
	const btn = document.createElement("button");
	btn.textContent = name;
	document.body.appendChild(btn);
	btn.click();
	return btn;
}

describe("action-tracker - 點擊與 API 結果的配對", () => {
	beforeEach(() => {
		localStorage.clear();
		document.body.innerHTML = "";
		resetBus();
		resetRecords();
		resetActionTracker();
		resetActionIdMap();
		reloadState();
		installActionTracker();
	});

	it("只記錄七顆行動按鈕的點擊", () => {
		clickAction("自主訓練");
		clickAction("修行"); // 不是行動按鈕
		expect(getPendingClicks()).toEqual(["自主訓練"]);
	});

	it("忽略我們自己加的控制項", () => {
		const wrap = document.createElement("div");
		wrap.setAttribute("data-sao-helper", "1");
		const btn = document.createElement("button");
		btn.textContent = "自主訓練";
		wrap.appendChild(btn);
		document.body.appendChild(wrap);
		btn.click();
		expect(getPendingClicks()).toEqual([]);
	});

	it("行動成功時，把名稱排進紀錄佇列", () => {
		clickAction("自主訓練");
		handleActionResult({ actionId: "self_training", success: true });

		expect(getAwaiting()).toEqual(["自主訓練"]);
		expect(getPendingClicks()).toEqual([]);
	});

	// ★ 這是這次修正的核心回歸測試之一：
	// 舊版只要按鈕被點到就當作做過了，冷卻中被拒絕一樣會推進順序、也會佔掉一個紀錄名額。
	it("行動失敗時，不推進順序也不排進紀錄佇列", () => {
		state.orderMode = true;
		state.sequence = [
			{ name: "自主訓練", count: 2 },
			{ name: "釣魚", count: 1 },
		];
		state.stepIndex = 0;
		state.stepProgress = 0;

		clickAction("自主訓練");
		handleActionResult({
			actionId: "self_training",
			success: false,
			error: "Action cooldown is active until ...",
		});

		expect(getAwaiting()).toEqual([]);
		expect(state.stepProgress).toBe(0);
		expect(state.stepIndex).toBe(0);
	});

	it("行動成功時才會推進順序進度", () => {
		state.orderMode = true;
		state.sequence = [
			{ name: "自主訓練", count: 2 },
			{ name: "釣魚", count: 1 },
		];
		state.stepIndex = 0;
		state.stepProgress = 0;

		clickAction("自主訓練");
		handleActionResult({ actionId: "self_training", success: true });
		expect(state.stepProgress).toBe(1);
		expect(state.stepIndex).toBe(0);

		clickAction("自主訓練");
		handleActionResult({ actionId: "self_training", success: true });
		expect(state.stepProgress).toBe(0);
		expect(state.stepIndex).toBe(1); // 點滿兩次，換下一步
	});

	it("失敗後重點一次成功，進度接得回去", () => {
		state.orderMode = true;
		state.sequence = [{ name: "自主訓練", count: 2 }];
		state.stepIndex = 0;
		state.stepProgress = 0;

		clickAction("自主訓練");
		handleActionResult({ actionId: "self_training", success: false });
		expect(state.stepProgress).toBe(0);

		clickAction("自主訓練");
		handleActionResult({ actionId: "self_training", success: true });
		expect(state.stepProgress).toBe(1);
	});

	it("點到不是當前輪到的行動，不會推進順序", () => {
		state.orderMode = true;
		state.sequence = [
			{ name: "自主訓練", count: 1 },
			{ name: "釣魚", count: 1 },
		];
		state.stepIndex = 0;
		state.stepProgress = 0;

		clickAction("釣魚");
		handleActionResult({ actionId: "fishing", success: true });

		expect(state.stepIndex).toBe(0);
		expect(state.stepProgress).toBe(0);
		expect(getAwaiting()).toEqual(["釣魚"]); // 紀錄還是要正確標註
	});

	it("第一次遇到沒見過的 actionId，會用剛剛點的按鈕學起來", () => {
		clickAction("釣魚");
		handleActionResult({ actionId: "fishing", success: true });
		expect(getAwaiting()).toEqual(["釣魚"]);

		// 學會之後，就算點擊佇列是空的（例如遊戲自己觸發）也認得出來
		resetActionTracker();
		resetRecords();
		handleActionResult({ actionId: "fishing", success: true });
		expect(getAwaiting()).toEqual(["釣魚"]);
	});

	it("拿不到 actionId 時，退回用點擊順序配對", () => {
		clickAction("做善事");
		handleActionResult({ actionId: null, success: true });
		expect(getAwaiting()).toEqual(["做善事"]);
	});

	it("成功但完全認不出行動時，仍然佔一格避免錯位", () => {
		handleActionResult({ actionId: null, success: true });
		expect(getAwaiting()).toEqual([null]);
	});
});
