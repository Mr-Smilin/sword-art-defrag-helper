// 針對「實際發布的那個檔案」的煙霧測試。
//
// src/ 各模組的測試都過，不代表打包出來的 sword-art-defrag-helper.js 是好的
// （可能忘了重跑 build、或 esbuild 這層出問題）。這支測試直接載入建置產物來跑，
// 而且會檢查它的版本號跟 package.json 是否一致 —— 忘記重新建置就會在這裡被擋下來。

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as challengeHelpers from "./helpers/challenge-card.js";

const ROOT = path.resolve(__dirname, "..");
const BUNDLE_PATH = path.join(ROOT, "sword-art-defrag-helper.js");

const bundle = readFileSync(BUNDLE_PATH, "utf8");
const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("bundle - UserScript metadata", () => {
	it("metadata block 在檔案最開頭", () => {
		const lines = bundle.split("\n");
		expect(lines[0]).toBe("// ==UserScript==");
		expect(lines.slice(0, 20).join("\n")).toContain("// ==/UserScript==");
	});

	it("版本號與 package.json 一致（沒有重新建置就會失敗）", () => {
		const version = /@version\s+(\S+)/.exec(bundle)?.[1];
		expect(version).toBe(pkg.version);
	});

	it("@match 同時涵蓋首頁與 /profile/ 頁面", () => {
		const matches = Array.from(bundle.matchAll(/@match\s+(\S+)/g)).map(
			(m) => m[1],
		);
		expect(matches).toEqual([
			"https://betawtf.swordartdefrag.page",
			"https://betawtf.swordartdefrag.page/profile/*",
		]);
	});

	it("沒有殘留 ESM 的 import / export 語法", () => {
		const code = bundle.replace(/^\/\/.*$/gm, "");
		expect(code).not.toMatch(/^\s*import\s/m);
		expect(code).not.toMatch(/^\s*export\s/m);
	});
});

describe("bundle - 實際執行", () => {
	let realFetch;
	let realMutationObserver;
	let realSetInterval;
	let observers;
	let intervals;

	// 腳本本身是「裝上去就不會卸下」的設計（頁面關掉才結束），沒有對外的解除 API。
	// 測試環境會反覆載入它，所以這裡把 MutationObserver 與 setInterval 包起來記下來，
	// 每個測試結束後主動收掉，否則環境拆掉後它們還會繼續觸發並噴一堆錯誤。
	function trackGlobals() {
		observers = [];
		intervals = [];
		realMutationObserver = globalThis.MutationObserver;
		realSetInterval = globalThis.setInterval;

		globalThis.MutationObserver = class TrackedMutationObserver extends realMutationObserver {
			constructor(callback) {
				super(callback);
				observers.push(this);
			}
		};
		globalThis.setInterval = (...args) => {
			const id = realSetInterval(...args);
			intervals.push(id);
			return id;
		};
	}

	function restoreGlobals() {
		observers.forEach((o) => o.disconnect());
		intervals.forEach((id) => clearInterval(id));
		globalThis.MutationObserver = realMutationObserver;
		globalThis.setInterval = realSetInterval;
	}

	// 「行動」與「樓層獎勵」兩個標題都要存在，掛載才會同步完成、
	// 不會留下長達 5 秒的輪詢 setTimeout 鏈。
	function setupGamePage() {
		document.body.innerHTML = `
			<div id="action-box"><h3>行動</h3><div id="row"></div></div>
			<div id="floor-box"><h3>樓層獎勵</h3><button>領取獎勵</button></div>
			<div id="log"></div>
		`;
		const row = document.getElementById("row");
		["狩獵兔肉", "自主訓練", "釣魚"].forEach((name) => {
			const btn = document.createElement("button");
			btn.textContent = name;
			row.appendChild(btn);
		});
	}

	function pushRecord(text) {
		const log = document.getElementById("log");
		const article = document.createElement("article");
		const inner = document.createElement("div");
		inner.appendChild(document.createTextNode(text));
		article.appendChild(inner);
		// 最新的在最上面
		log.insertBefore(article, log.firstChild);
	}

	beforeEach(() => {
		realFetch = globalThis.fetch;
		localStorage.clear();
		delete window.__saoHelperInjected;
		setupGamePage();
		trackGlobals();
	});

	afterEach(() => {
		restoreGlobals();
		globalThis.fetch = realFetch;
		window.fetch = realFetch;
		delete window.__saoHelperInjected;
	});

	function runBundle() {
		// eslint-disable-next-line no-new-func
		new Function(bundle).call(window);
	}

	it("載入時不會拋錯，並標記已注入", () => {
		expect(() => runBundle()).not.toThrow();
		expect(window.__saoHelperInjected).toBe(true);
	});

	it("會攔截 window.fetch", () => {
		const before = window.fetch;
		runBundle();
		expect(window.fetch).not.toBe(before);
	});

	it("成功的行動會被標註到行動記錄上", async () => {
		window.fetch = async () =>
			new Response(
				JSON.stringify({
					expGained: 11,
					growth: {},
					actionCooldown: { remainingSeconds: 3 },
					updatedPlayer: { totalExp: 100, lastActionId: "fishing" },
				}),
				{ status: 200 },
			);
		runBundle();

		const btn = Array.from(document.querySelectorAll("#row button")).find(
			(b) => b.textContent === "釣魚",
		);
		btn.click();
		await window.fetch("/api/actions/", {
			method: "POST",
			body: JSON.stringify({ actionId: "fishing" }),
		});
		await flush();

		pushRecord("行動成功！獲得了 11 點經驗值。");
		await flush(); // 等 MutationObserver

		expect(document.querySelector("article").textContent.trim()).toBe(
			"釣魚成功！獲得了 11 點經驗值。",
		);
	});

	it("挑戰安全模式預設生效，只留下友好切磋", () => {
		const { renderChallengeCard, visibleChallengeNames } = challengeHelpers;
		renderChallengeCard(document.body);

		runBundle();

		expect(visibleChallengeNames()).toEqual(["友好切磋"]);
		// 標題旁邊要掛上開關，而且是勾選狀態
		const header = document.querySelector('[data-slot="card-header"]');
		const toggle = header.querySelector("[data-sao-helper]");
		expect(toggle).not.toBeNull();
		expect(toggle.querySelector("input").checked).toBe(true);
	});

	it("失敗的行動不會被標註", async () => {
		window.fetch = async () =>
			new Response(JSON.stringify({ error: "Action cooldown is active" }), {
				status: 400,
			});
		runBundle();

		const btn = Array.from(document.querySelectorAll("#row button")).find(
			(b) => b.textContent === "釣魚",
		);
		btn.click();
		await window
			.fetch("/api/actions/", {
				method: "POST",
				body: JSON.stringify({ actionId: "fishing" }),
			})
			.catch(() => {});
		await flush();

		// 失敗不會產生新紀錄；就算畫面上有別的紀錄也不該被亂標
		pushRecord("行動成功！獲得了 3 點經驗值。");
		await flush();

		expect(document.querySelector("article").textContent.trim()).toBe(
			"行動成功！獲得了 3 點經驗值。",
		);
	});
});
