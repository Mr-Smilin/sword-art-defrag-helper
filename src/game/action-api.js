// 遊戲「執行行動」API 的知識都集中在這個檔案。
// 遊戲後端改版時，通常只需要動這裡。
//
// 實測到的行為（2026/08）：
//
//   POST https://betawtf.swordartdefrag.page/api/actions/
//   request  body: {"actionId":"self_training"}
//
//   成功 200：
//     { "expGained": 15, "growth": {}, "actionCooldown": { "remainingSeconds": 3 },
//       "updatedPlayer": { "totalExp": 52038, "lastActionId": "self_training" } }
//
//   失敗 400：
//     { "error": "Action cooldown is active until 2026-08-16T17:02:47.722167+00:00." }
//
// ★ 兩個重點推論：
//   1. 「成功才會產生一筆新的行動記錄」，所以這支 API 的回應就是判斷「清單會不會多一筆」
//      的權威訊號，不需要再用文字比對去猜。
//   2. 伺服器有行動冷卻（actionCooldown），代表行動是被序列化的，
//      同一時間幾乎不可能有兩筆行動請求在途 —— 這讓「請求 <-> 按鈕」的配對非常可靠。

import { ACTION_ID_STORAGE_KEY } from "../core/constants.js";

export const ACTION_API_PATH = "/api/actions/";

// 已經實測確認的對照。其餘 actionId 會在使用者第一次點到該行動時自動學起來
// （見 learnActionId），所以不需要事先把七個 id 都湊齊。
const SEED_ACTION_IDS = {
	self_training: "自主訓練",
};

const FALLBACK_ORIGIN = "https://betawtf.swordartdefrag.page";

function toPathname(url) {
	try {
		const base =
			typeof location !== "undefined" && location.href
				? location.href
				: FALLBACK_ORIGIN;
		return new URL(String(url), base).pathname;
	} catch (e) {
		return String(url).split("?")[0];
	}
}

/** 這個請求是不是「執行行動」？ */
export function isActionRequest(url, method) {
	if (!url) return false;
	if (String(method || "GET").toUpperCase() !== "POST") return false;
	return toPathname(url).endsWith(ACTION_API_PATH);
}

function safeJson(text) {
	if (typeof text !== "string" || text.trim() === "") return null;
	try {
		return JSON.parse(text);
	} catch (e) {
		return null;
	}
}

/** 從 request body 取出 actionId（支援 JSON 字串、已解析物件、URLSearchParams）。 */
export function extractActionId(body) {
	if (body == null) return null;
	if (typeof body === "string") {
		const parsed = safeJson(body);
		return typeof parsed?.actionId === "string" ? parsed.actionId : null;
	}
	if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
		return body.get("actionId");
	}
	if (typeof body === "object" && typeof body.actionId === "string") {
		return body.actionId;
	}
	return null;
}

/**
 * 判斷一次行動請求的結果。
 * @param {{ status: number, bodyText?: string }} response
 * @returns {{ success: boolean, actionId: string|null, expGained: number|null, error: string|null }}
 */
export function parseActionResponse({ status, bodyText }) {
	const body = safeJson(bodyText);

	// 失敗的回應一律帶 error 欄位（例：冷卻中）。
	// 先看 error 再看 status，因為就算哪天後端改用 200 回傳業務失敗，這裡也還是判得對。
	if (body && typeof body.error === "string") {
		return { success: false, actionId: null, expGained: null, error: body.error };
	}

	const httpOk = Number(status) >= 200 && Number(status) < 300;
	if (!httpOk) {
		return {
			success: false,
			actionId: null,
			expGained: null,
			error: `HTTP ${status}`,
		};
	}

	// body 解析不出來但 HTTP 是 2xx：仍然視為成功。
	// 伺服器既然接受了這一動，記錄清單就一定會多一筆；這時若判成失敗，
	// 對照表反而會少推一格，造成之後每一筆都錯位（這正是這次要修掉的問題）。
	return {
		success: true,
		actionId:
			typeof body?.updatedPlayer?.lastActionId === "string"
				? body.updatedPlayer.lastActionId
				: null,
		expGained: typeof body?.expGained === "number" ? body.expGained : null,
		error: null,
	};
}

// ---------------- actionId <-> 中文名稱對照（執行時自動學習） ----------------

let idToName = null;

function ensureMap() {
	if (idToName) return idToName;
	idToName = { ...SEED_ACTION_IDS };
	try {
		const raw = localStorage.getItem(ACTION_ID_STORAGE_KEY);
		const parsed = raw ? JSON.parse(raw) : null;
		if (parsed && typeof parsed === "object") {
			for (const [id, name] of Object.entries(parsed)) {
				if (typeof id === "string" && typeof name === "string") {
					idToName[id] = name;
				}
			}
		}
	} catch (e) {
		// 讀不到就只用種子對照，不影響功能（會退回用點擊配對）。
	}
	return idToName;
}

export function actionNameFromId(actionId) {
	if (!actionId) return null;
	return ensureMap()[actionId] ?? null;
}

/** 把新學到的 actionId -> 名稱 對照記起來並持久化。 */
export function learnActionId(actionId, name) {
	if (!actionId || !name) return;
	const map = ensureMap();
	if (map[actionId] === name) return;
	map[actionId] = name;
	try {
		localStorage.setItem(ACTION_ID_STORAGE_KEY, JSON.stringify(map));
	} catch (e) {
		// 存不起來也沒關係，下次重新學一遍就好。
	}
}

/** 測試用：清掉記憶體裡的對照表快取。 */
export function resetActionIdMap() {
	idToName = null;
}
