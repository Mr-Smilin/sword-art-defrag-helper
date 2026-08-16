// 攔截遊戲自己發出的行動請求，把「這一動成功了沒」變成一個明確的事件。
//
// 為什麼要攔網路而不是只看畫面：
//   舊版是靠「行動記錄清單最上面那筆文字有沒有變」來猜有沒有新紀錄，有兩個致命問題 ——
//     (a) 連續兩次做同一個行動又拿到相同經驗值時，文字一模一樣，會直接漏判；
//     (b) 行動失敗（例如冷卻中）時畫面不會多一筆，但舊版仍然把它當成做過了。
//   兩者都會讓對照表永久錯位一格。改成看 API 回應就完全沒有這個問題。
//
// fetch 和 XMLHttpRequest 都攔，是因為不確定遊戲前端用哪一種，兩邊都補上最保險。

import { ACTION_RESULT, emit } from "./bus.js";
import {
	extractActionId,
	isActionRequest,
	parseActionResponse,
} from "./action-api.js";

let installed = false;

function report({ actionId, success, expGained = null, error = null }) {
	emit(ACTION_RESULT, { actionId: actionId ?? null, success, expGained, error });
}

/** 取得 fetch 第一個參數代表的網址。 */
function resolveUrl(input) {
	if (typeof input === "string") return input;
	if (input && typeof input.url === "string") return input.url; // Request
	if (input && typeof input.href === "string") return input.href; // URL
	return "";
}

function resolveMethod(input, init) {
	if (init && init.method) return init.method;
	if (input && typeof input.method === "string") return input.method;
	return "GET";
}

// 一定要在呼叫原本的 fetch「之前」就把 body 複製走。
// Request 的 body 是串流，被遊戲讀掉之後就再也讀不到了。
async function readRequestBody(input, init) {
	if (init && init.body != null) return init.body;
	if (typeof Request !== "undefined" && input instanceof Request) {
		try {
			return await input.clone().text();
		} catch (e) {
			return null;
		}
	}
	return null;
}

function patchFetch(target) {
	const original = target.fetch;
	if (typeof original !== "function") return;

	target.fetch = function patchedFetch(input, init, ...rest) {
		const url = resolveUrl(input);
		const method = resolveMethod(input, init);
		if (!isActionRequest(url, method)) {
			return original.call(this, input, init, ...rest);
		}

		const actionIdPromise = readRequestBody(input, init)
			.then(extractActionId)
			.catch(() => null);

		let promise;
		try {
			promise = original.call(this, input, init, ...rest);
		} catch (err) {
			actionIdPromise.then((actionId) =>
				report({ actionId, success: false, error: String(err) }),
			);
			throw err;
		}

		return Promise.resolve(promise).then(
			(res) => {
				// 一定要用 clone() 再讀，否則會把 body 吃掉，遊戲自己就讀不到回應了。
				let bodyTextPromise;
				try {
					bodyTextPromise = res.clone().text();
				} catch (e) {
					bodyTextPromise = Promise.resolve("");
				}
				Promise.all([actionIdPromise, bodyTextPromise.catch(() => "")]).then(
					([actionId, bodyText]) => {
						const parsed = parseActionResponse({
							status: res.status,
							bodyText,
						});
						report({ ...parsed, actionId: parsed.actionId || actionId });
					},
				);
				return res;
			},
			(err) => {
				// 連線層失敗（斷網、被擋）：行動沒有成立，必須當失敗處理。
				actionIdPromise.then((actionId) =>
					report({ actionId, success: false, error: String(err) }),
				);
				throw err;
			},
		);
	};
}

function patchXhr(target) {
	const XHR = target.XMLHttpRequest;
	if (typeof XHR !== "function") return;
	const originalOpen = XHR.prototype.open;
	const originalSend = XHR.prototype.send;

	XHR.prototype.open = function patchedOpen(method, url, ...rest) {
		this.__saoMethod = method;
		this.__saoUrl = url;
		return originalOpen.call(this, method, url, ...rest);
	};

	XHR.prototype.send = function patchedSend(body) {
		if (isActionRequest(this.__saoUrl, this.__saoMethod)) {
			const actionId = extractActionId(body);
			this.addEventListener("loadend", () => {
				// status 0 = 連線根本沒完成（斷網 / CORS 被擋），視為失敗。
				if (this.status === 0) {
					report({ actionId, success: false, error: "network error" });
					return;
				}
				let bodyText = "";
				try {
					bodyText = this.responseType === "" || this.responseType === "text"
						? this.responseText
						: JSON.stringify(this.response);
				} catch (e) {
					bodyText = "";
				}
				const parsed = parseActionResponse({ status: this.status, bodyText });
				report({ ...parsed, actionId: parsed.actionId || actionId });
			});
		}
		return originalSend.call(this, body);
	};
}

/**
 * 安裝攔截。重複呼叫只會生效一次（避免把自己包好幾層）。
 * @returns {boolean} 這次是否真的安裝了
 */
export function installNetworkHooks(target = typeof window !== "undefined" ? window : globalThis) {
	if (installed) return false;
	installed = true;
	patchFetch(target);
	patchXhr(target);
	return true;
}

/** 測試用：讓下一次 installNetworkHooks 可以重新安裝。 */
export function resetNetworkHooks() {
	installed = false;
}
