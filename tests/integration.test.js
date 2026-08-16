// 端對端：點按鈕 -> 遊戲發出 API 請求 -> 攔截判定成敗 -> 標註紀錄 / 推進順序。
//
// 單一模組的測試各自都會過，但真正會出事的是模組之間的接縫，所以這裡把整條鏈接起來跑。

import { beforeEach, describe, expect, it } from "vitest";
import { resetActionIdMap } from "../src/game/action-api.js";
import {
	installActionTracker,
	resetActionTracker,
} from "../src/game/action-tracker.js";
import { STATE_CHANGED, on, resetBus } from "../src/core/bus.js";
import { ACTION_NAMES } from "../src/core/constants.js";
import { installNetworkHooks, resetNetworkHooks } from "../src/game/network.js";
import { applyOrderVisibility } from "../src/features/order.js";
import { getLabels, resetRecords, scanRecords } from "../src/features/records.js";
import { reloadState, state } from "../src/core/state.js";
import { createRecordList, rawRecord } from "./helpers/record-list.js";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// 測試用的 actionId 對照（真實 id 只確認過 self_training，其餘讓程式自己學）
const ACTION_IDS = {
	狩獵兔肉: "rabbit_hunt",
	自主訓練: "self_training",
	外出野餐: "picnic",
	汁妹: "flirt",
	做善事: "good_deed",
	坐下休息: "rest",
	釣魚: "fishing",
};

function successBody(actionId, exp) {
	return JSON.stringify({
		expGained: exp,
		growth: {},
		actionCooldown: { remainingSeconds: 3 },
		updatedPlayer: { totalExp: 52038, lastActionId: actionId },
	});
}

const COOLDOWN_BODY = JSON.stringify({
	error: "Action cooldown is active until 2026-08-16T17:02:47.722167+00:00.",
});

let disposeTracker = null;

/**
 * 架一個假的遊戲頁面：七顆行動按鈕 + 行動記錄清單，按鈕會真的發出 API 請求。
 * 每次呼叫都會把所有模組狀態重置乾淨，所以同一個測試裡可以重建。
 */
function createGame({ cap = 5 } = {}) {
	disposeTracker?.();
	localStorage.clear();
	resetBus();
	resetRecords();
	resetActionTracker();
	resetActionIdMap();
	resetNetworkHooks(); // 不重置的話，第二次 installNetworkHooks 會直接被防重複的旗標擋掉
	reloadState();

	document.body.innerHTML = "<div id='row'></div><div id='log'></div>";
	const row = document.getElementById("row");
	const list = createRecordList(document.getElementById("log"), cap);

	let pendingResponse = null;

	const win = {
		async fetch(url, init) {
			const { status, body } = pendingResponse;
			return new Response(body, { status });
		},
	};

	ACTION_NAMES.forEach((name) => {
		const btn = document.createElement("button");
		btn.textContent = name;
		// 遊戲自己的行為：點下去就打 API
		btn.addEventListener("click", () => {
			win.fetch("/api/actions/", {
				method: "POST",
				body: JSON.stringify({ actionId: ACTION_IDS[name] }),
			});
		});
		row.appendChild(btn);
	});

	installNetworkHooks(win);
	disposeTracker = installActionTracker(document);
	// main.js 裡的接線：狀態一變就重新套用按鈕顯示。整合測試要一起重現。
	on(STATE_CHANGED, applyOrderVisibility);

	function button(name) {
		return Array.from(row.querySelectorAll("button")).find(
			(b) => b.textContent === name,
		);
	}

	return {
		list,
		/** 模擬使用者點一次行動，並等整條鏈跑完。 */
		async act(name, { success = true, exp = 5 } = {}) {
			pendingResponse = success
				? { status: 200, body: successBody(ACTION_IDS[name], exp) }
				: { status: 400, body: COOLDOWN_BODY };

			button(name).click();
			await flush(); // 等攔截層讀完回應、發出事件

			if (success) list.push(rawRecord(exp)); // 成功才會多一筆紀錄
			scanRecords(); // MutationObserver 觸發
		},
		/** 一開始就存在的舊紀錄。 */
		seed(count) {
			for (let i = 1; i <= count; i++) list.push(rawRecord(i));
			scanRecords();
		},
	};
}

describe("整合 - 行動 -> API -> 紀錄標註 / 順序推進", () => {
	let game;

	beforeEach(() => {
		game = createGame({ cap: 5 });
	});

	it("成功的行動會被正確標註", async () => {
		await game.act("釣魚", { exp: 12 });

		expect(getLabels()).toEqual(["釣魚"]);
		expect(game.list.visibleTexts()[0]).toBe("釣魚成功！獲得了 12 點經驗值。");
	});

	it("失敗的行動不會產生紀錄，也不會佔用對照表", async () => {
		await game.act("釣魚", { success: false });

		expect(getLabels()).toEqual([]);
		expect(game.list.visibleTexts()).toEqual([]);
	});

	// ★ 舊版最容易壞的情境：中間夾一次失敗，之後每一筆都會錯位。
	it("成功、失敗、成功交錯時，標註不會錯位", async () => {
		await game.act("狩獵兔肉", { exp: 3 });
		await game.act("自主訓練", { success: false }); // 冷卻中被拒絕
		await game.act("釣魚", { exp: 8 });

		expect(getLabels()).toEqual(["釣魚", "狩獵兔肉"]);
		expect(game.list.visibleTexts()).toEqual([
			"釣魚成功！獲得了 8 點經驗值。",
			"狩獵兔肉成功！獲得了 3 點經驗值。",
		]);
	});

	// ★ 另一個舊版會壞的情境：清單滿了之後連續兩次相同行動又拿到相同經驗值。
	it("清單已滿且連續兩筆文字相同時，標註不會錯位", async () => {
		game = createGame({ cap: 3 });
		game.seed(3);

		await game.act("汁妹", { exp: 5 });
		await game.act("汁妹", { exp: 5 }); // 原始文字與上一筆一字不差
		await game.act("做善事", { exp: 9 });

		expect(getLabels()).toEqual(["做善事", "汁妹", "汁妹"]);
		expect(game.list.visibleTexts()[0]).toBe("做善事成功！獲得了 9 點經驗值。");
	});

	it("行動失敗時，循環順序會停在原地", async () => {
		state.orderMode = true;
		state.sequence = [
			{ name: "自主訓練", count: 2 },
			{ name: "釣魚", count: 1 },
		];
		state.stepIndex = 0;
		state.stepProgress = 0;

		await game.act("自主訓練", { exp: 4 });
		expect(state.stepProgress).toBe(1);

		await game.act("自主訓練", { success: false });
		expect(state.stepProgress).toBe(1); // 沒有前進
		expect(state.stepIndex).toBe(0);

		await game.act("自主訓練", { exp: 6 });
		expect(state.stepIndex).toBe(1); // 點滿兩次，換下一步
		expect(state.stepProgress).toBe(0);

		expect(getLabels()).toEqual(["自主訓練", "自主訓練"]);
	});

	it("順序模式下只顯示當前輪到的按鈕，並隨著成功推進", async () => {
		state.orderMode = true;
		state.sequence = [
			{ name: "自主訓練", count: 1 },
			{ name: "釣魚", count: 1 },
		];
		state.stepIndex = 0;
		state.stepProgress = 0;

		await game.act("自主訓練", { exp: 4 });

		const visible = Array.from(document.querySelectorAll("#row button"))
			.filter((b) => b.style.display !== "none")
			.map((b) => b.textContent);
		expect(visible).toEqual(["釣魚"]);
	});

	it("執行時學到的 actionId 對照會被保留下來", async () => {
		await game.act("做善事", { exp: 2 });

		// 重建一次（模擬重新整理頁面），對照表要還在
		resetActionIdMap();
		const { actionNameFromId } = await import("../src/game/action-api.js");
		expect(actionNameFromId("good_deed")).toBe("做善事");
	});

	it("腳本載入前的舊紀錄不會被亂標，之後的新紀錄照樣正確", async () => {
		game = createGame({ cap: 5 });
		game.seed(2);
		// 對照表只記錄「我們親眼看到成功的行動」，載入前就存在的舊紀錄不會進來
		expect(getLabels()).toEqual([]);
		expect(game.list.visibleTexts().every((t) => t.startsWith("行動"))).toBe(
			true,
		);

		await game.act("坐下休息", { exp: 7 });
		expect(getLabels()).toEqual(["坐下休息"]);
		expect(game.list.visibleTexts()[0]).toBe("坐下休息成功！獲得了 7 點經驗值。");
		// 舊紀錄仍然維持原樣
		expect(game.list.visibleTexts()[1]).toBe("行動成功！獲得了 2 點經驗值。");
	});

	// ★ 使用者實測回報的完整情境：循環順序「狩獵兔肉 x2 -> 外出野餐 x1」，
	// 三次行動的經驗值都一樣。走完整條鏈（點按鈕 -> API -> 標註）驗證。
	it("循環順序換行動、且每次經驗值都相同時，行動紀錄標註正確", async () => {
		state.orderMode = true;
		state.sequence = [
			{ name: "狩獵兔肉", count: 2 },
			{ name: "外出野餐", count: 1 },
		];
		state.stepIndex = 0;
		state.stepProgress = 0;

		await game.act("狩獵兔肉", { exp: 5 });
		await game.act("狩獵兔肉", { exp: 5 });
		expect(state.stepIndex).toBe(1); // 換到外出野餐這一步

		await game.act("外出野餐", { exp: 5 });

		expect(game.list.visibleTexts()).toEqual([
			"外出野餐成功！獲得了 5 點經驗值。",
			"狩獵兔肉成功！獲得了 5 點經驗值。",
			"狩獵兔肉成功！獲得了 5 點經驗值。",
		]);
		expect(state.stepIndex).toBe(0); // 跑完一輪，回到第一步
	});
});
