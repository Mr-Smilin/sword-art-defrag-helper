import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTION_RESULT, on, resetBus } from "../src/bus.js";
import { installNetworkHooks, resetNetworkHooks } from "../src/network.js";

const SUCCESS_BODY = JSON.stringify({
	expGained: 15,
	growth: {},
	actionCooldown: { remainingSeconds: 3 },
	updatedPlayer: { totalExp: 52038, lastActionId: "self_training" },
});
const COOLDOWN_BODY = JSON.stringify({
	error: "Action cooldown is active until 2026-08-16T17:02:47.722167+00:00.",
});

/** 等所有 microtask 跑完（攔截層是在 response 解析完之後才發事件）。 */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function jsonResponse(status, body) {
	return new Response(body, {
		status,
		headers: { "content-type": "application/json" },
	});
}

describe("network - fetch 攔截", () => {
	let results;
	let target;

	beforeEach(() => {
		resetBus();
		resetNetworkHooks();
		results = [];
		on(ACTION_RESULT, (r) => results.push(r));
	});

	afterEach(() => {
		resetNetworkHooks();
	});

	function setupFetch(impl) {
		target = { fetch: vi.fn(impl) };
		installNetworkHooks(target);
		return target;
	}

	function postAction(actionId = "self_training") {
		return target.fetch("/api/actions/", {
			method: "POST",
			body: JSON.stringify({ actionId }),
		});
	}

	it("成功的行動會發出 success 事件，並帶出 actionId", async () => {
		setupFetch(async () => jsonResponse(200, SUCCESS_BODY));
		await postAction();
		await flush();

		expect(results).toHaveLength(1);
		expect(results[0].success).toBe(true);
		expect(results[0].actionId).toBe("self_training");
		expect(results[0].expGained).toBe(15);
	});

	it("冷卻中被拒絕會發出 failure 事件", async () => {
		setupFetch(async () => jsonResponse(400, COOLDOWN_BODY));
		await postAction();
		await flush();

		expect(results).toHaveLength(1);
		expect(results[0].success).toBe(false);
		expect(results[0].actionId).toBe("self_training"); // 從 request body 取得
	});

	it("不會把回應的 body 吃掉，遊戲自己還讀得到", async () => {
		setupFetch(async () => jsonResponse(200, SUCCESS_BODY));
		const res = await postAction();
		const parsed = await res.json();
		await flush();

		expect(parsed.expGained).toBe(15);
		expect(results[0].success).toBe(true);
	});

	it("連線失敗時視為行動失敗，並把錯誤往外拋", async () => {
		setupFetch(async () => {
			throw new TypeError("Failed to fetch");
		});
		await expect(postAction()).rejects.toThrow("Failed to fetch");
		await flush();

		expect(results).toHaveLength(1);
		expect(results[0].success).toBe(false);
	});

	it("其他 API 的請求完全不碰", async () => {
		setupFetch(async () => jsonResponse(200, "{}"));
		await target.fetch("/api/player/", { method: "GET" });
		await target.fetch("/api/floor/", { method: "POST", body: "{}" });
		await flush();

		expect(results).toEqual([]);
	});

	it("支援用 Request 物件呼叫 fetch", async () => {
		setupFetch(async () => jsonResponse(200, SUCCESS_BODY));
		const request = new Request("https://betawtf.swordartdefrag.page/api/actions/", {
			method: "POST",
			body: JSON.stringify({ actionId: "self_training" }),
		});
		await target.fetch(request);
		await flush();

		expect(results[0].success).toBe(true);
	});

	it("重複安裝不會把 fetch 包好幾層", async () => {
		setupFetch(async () => jsonResponse(200, SUCCESS_BODY));
		expect(installNetworkHooks(target)).toBe(false);

		await postAction();
		await flush();
		expect(results).toHaveLength(1); // 不是 2
	});
});

describe("network - XMLHttpRequest 攔截", () => {
	let results;
	let FakeXHR;

	// 每個測試都要拿一個全新的 class：攔截是直接改寫 prototype 上的 open/send，
	// 重複用同一個 class 會讓每次安裝都往上再疊一層，事件就會被重複發出。
	function createFakeXhrClass() {
		return class FakeXHR extends EventTarget {
			constructor() {
				super();
				this.status = 0;
				this.responseText = "";
				this.responseType = "";
			}
			open(method, url) {
				this.method = method;
				this.url = url;
			}
			send(body) {
				this.body = body;
			}
			/** 測試用：模擬伺服器回應。 */
			respond(status, text) {
				this.status = status;
				this.responseText = text;
				this.dispatchEvent(new Event("loadend"));
			}
		};
	}

	beforeEach(() => {
		resetBus();
		resetNetworkHooks();
		results = [];
		on(ACTION_RESULT, (r) => results.push(r));
		FakeXHR = createFakeXhrClass();
		installNetworkHooks({ XMLHttpRequest: FakeXHR });
	});

	afterEach(() => {
		resetNetworkHooks();
	});

	function sendAction() {
		const xhr = new FakeXHR();
		xhr.open("POST", "/api/actions/");
		xhr.send(JSON.stringify({ actionId: "self_training" }));
		return xhr;
	}

	it("成功的行動會發出 success 事件", () => {
		sendAction().respond(200, SUCCESS_BODY);

		expect(results).toHaveLength(1);
		expect(results[0].success).toBe(true);
		expect(results[0].actionId).toBe("self_training");
	});

	it("冷卻中被拒絕會發出 failure 事件", () => {
		sendAction().respond(400, COOLDOWN_BODY);

		expect(results).toHaveLength(1);
		expect(results[0].success).toBe(false);
	});

	it("status 0（連線沒完成）視為失敗", () => {
		const xhr = sendAction();
		xhr.dispatchEvent(new Event("loadend"));

		expect(results).toHaveLength(1);
		expect(results[0].success).toBe(false);
	});

	it("其他 API 的請求完全不碰", () => {
		const xhr = new FakeXHR();
		xhr.open("GET", "/api/player/");
		xhr.send(null);
		xhr.respond(200, "{}");

		expect(results).toEqual([]);
	});
});
