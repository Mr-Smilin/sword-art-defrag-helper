import { beforeEach, describe, expect, it } from "vitest";
import {
	actionNameFromId,
	extractActionId,
	isActionRequest,
	learnActionId,
	parseActionResponse,
	resetActionIdMap,
} from "../../src/game/action-api.js";
import { ACTION_ID_STORAGE_KEY } from "../../src/core/constants.js";

// 實測樣本（2026/08）
const SUCCESS_BODY = JSON.stringify({
	expGained: 15,
	growth: {},
	actionCooldown: { remainingSeconds: 3 },
	updatedPlayer: { totalExp: 52038, lastActionId: "self_training" },
});
const COOLDOWN_BODY = JSON.stringify({
	error: "Action cooldown is active until 2026-08-16T17:02:47.722167+00:00.",
});

describe("action-api - 請求辨識", () => {
	it("認得行動 API 的絕對網址與相對路徑", () => {
		expect(
			isActionRequest("https://betawtf.swordartdefrag.page/api/actions/", "POST"),
		).toBe(true);
		expect(isActionRequest("/api/actions/", "POST")).toBe(true);
		expect(isActionRequest("/api/actions/", "post")).toBe(true);
	});

	it("不是 POST 就不算行動請求", () => {
		expect(isActionRequest("/api/actions/", "GET")).toBe(false);
		expect(isActionRequest("/api/actions/", undefined)).toBe(false);
	});

	it("其他 API 不會被誤判", () => {
		expect(isActionRequest("/api/player/", "POST")).toBe(false);
		expect(isActionRequest("/api/actions/history/", "POST")).toBe(false);
		expect(isActionRequest("", "POST")).toBe(false);
	});
});

describe("action-api - 取出 actionId", () => {
	it("從 JSON 字串取出", () => {
		expect(extractActionId('{"actionId":"self_training"}')).toBe("self_training");
	});

	it("從已解析的物件取出", () => {
		expect(extractActionId({ actionId: "fishing" })).toBe("fishing");
	});

	it("從 URLSearchParams 取出", () => {
		expect(extractActionId(new URLSearchParams("actionId=picnic"))).toBe("picnic");
	});

	it("取不到時回傳 null，不會拋錯", () => {
		expect(extractActionId(null)).toBeNull();
		expect(extractActionId("not json")).toBeNull();
		expect(extractActionId("{}")).toBeNull();
		expect(extractActionId({ foo: 1 })).toBeNull();
	});
});

describe("action-api - 判斷成功或失敗", () => {
	it("200 + 成功樣本 → 成功，並帶出 actionId 與經驗值", () => {
		const result = parseActionResponse({ status: 200, bodyText: SUCCESS_BODY });
		expect(result.success).toBe(true);
		expect(result.actionId).toBe("self_training");
		expect(result.expGained).toBe(15);
		expect(result.error).toBeNull();
	});

	it("400 + 冷卻中 → 失敗", () => {
		const result = parseActionResponse({ status: 400, bodyText: COOLDOWN_BODY });
		expect(result.success).toBe(false);
		expect(result.error).toContain("cooldown");
	});

	it("就算後端改用 200 回傳 error，也判定為失敗", () => {
		const result = parseActionResponse({ status: 200, bodyText: COOLDOWN_BODY });
		expect(result.success).toBe(false);
	});

	it("非 2xx 且 body 不是 JSON → 失敗", () => {
		const result = parseActionResponse({
			status: 500,
			bodyText: "<html>Server Error</html>",
		});
		expect(result.success).toBe(false);
		expect(result.error).toBe("HTTP 500");
	});

	it("403（session 過期）→ 失敗", () => {
		expect(parseActionResponse({ status: 403, bodyText: "" }).success).toBe(false);
	});

	// 這一條是刻意的取捨：伺服器既然回 2xx，行動就已經成立、清單一定會多一筆，
	// 這時判成失敗反而會讓對照表少推一格而永久錯位。
	it("2xx 但 body 讀不到 → 仍視為成功", () => {
		const result = parseActionResponse({ status: 200, bodyText: "" });
		expect(result.success).toBe(true);
		expect(result.actionId).toBeNull();
		expect(result.expGained).toBeNull();
	});
});

describe("action-api - actionId 對照表", () => {
	beforeEach(() => {
		localStorage.clear();
		resetActionIdMap();
	});

	it("內建已實測的 self_training 對照", () => {
		expect(actionNameFromId("self_training")).toBe("自主訓練");
	});

	it("沒學過的 id 回傳 null", () => {
		expect(actionNameFromId("unknown_action")).toBeNull();
		expect(actionNameFromId(null)).toBeNull();
	});

	it("學到的對照會持久化，重載後仍在", () => {
		learnActionId("rabbit_hunt", "狩獵兔肉");
		expect(actionNameFromId("rabbit_hunt")).toBe("狩獵兔肉");

		const stored = JSON.parse(localStorage.getItem(ACTION_ID_STORAGE_KEY));
		expect(stored.rabbit_hunt).toBe("狩獵兔肉");

		resetActionIdMap(); // 模擬重新載入頁面
		expect(actionNameFromId("rabbit_hunt")).toBe("狩獵兔肉");
	});

	it("參數不完整時不會寫入髒資料", () => {
		learnActionId(null, "釣魚");
		learnActionId("fishing", null);
		expect(actionNameFromId("fishing")).toBeNull();
	});

	it("localStorage 內容壞掉時不會拋錯", () => {
		localStorage.setItem(ACTION_ID_STORAGE_KEY, "{{{ not json");
		resetActionIdMap();
		expect(() => actionNameFromId("self_training")).not.toThrow();
		expect(actionNameFromId("self_training")).toBe("自主訓練");
	});
});
