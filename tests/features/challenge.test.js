import { beforeEach, describe, expect, it } from "vitest";
import { STATE_CHANGED, on, resetBus } from "../../src/core/bus.js";
import { CHALLENGE_MODES } from "../../src/core/constants.js";
import {
	applyChallengeFilter,
	getChallengeItems,
	setSafeChallengeOnly,
} from "../../src/features/challenge.js";
import { reloadState, state } from "../../src/core/state.js";
import { ensureChallengeToggle } from "../../src/ui/challenge-toggle.js";
import {
	redrawChallengeCard,
	renderChallengeCard,
	visibleChallengeDescriptions,
	visibleChallengeNames,
} from "../helpers/challenge-card.js";

function safeButton() {
	return Array.from(document.querySelectorAll("article button")).find(
		(b) => b.textContent.trim() === "友好切磋",
	);
}

function safeArticle() {
	return safeButton().closest("article");
}

describe("challenge - 預設值", () => {
	beforeEach(() => {
		localStorage.clear();
		reloadState();
	});

	it("安全模式預設是開啟的", () => {
		expect(state.safeChallengeOnly).toBe(true);
	});

	it("舊版存檔沒有這個欄位時，一樣是開啟的", () => {
		localStorage.setItem(
			"saoDefragHelper_v3",
			JSON.stringify({ orderMode: true, rewardOverlay: true }),
		);
		reloadState();
		expect(state.safeChallengeOnly).toBe(true);
	});
});

describe("challenge - 選項篩選", () => {
	beforeEach(() => {
		localStorage.clear();
		resetBus();
		reloadState();
		document.body.innerHTML = "";
		renderChallengeCard();
	});

	it("找得到四個挑戰選項", () => {
		expect(getChallengeItems().map((i) => i.name)).toEqual(CHALLENGE_MODES);
	});

	it("開啟時只留下友好切磋", () => {
		applyChallengeFilter();
		expect(visibleChallengeNames()).toEqual(["友好切磋"]);
	});

	it("開啟時其他選項的描述也一起消失", () => {
		applyChallengeFilter();
		const descriptions = visibleChallengeDescriptions();
		expect(descriptions).toHaveLength(1);
		expect(descriptions[0]).toContain("最安全的訓練方式");
	});

	it("開啟時友好切磋的按鈕會放大，並改成單欄撐滿寬度", () => {
		applyChallengeFilter();
		expect(safeButton().style.fontSize).toBe("20px");
		expect(safeButton().style.minHeight).toBe("56px");
		expect(safeArticle().style.gridTemplateColumns).toBe("1fr");
	});

	it("關閉時四個選項全部回復顯示", () => {
		applyChallengeFilter();
		state.safeChallengeOnly = false;
		applyChallengeFilter();

		expect(visibleChallengeNames()).toEqual(CHALLENGE_MODES);
		expect(visibleChallengeDescriptions()).toHaveLength(4);
	});

	it("關閉時放大與單欄的樣式會被清乾淨", () => {
		applyChallengeFilter();
		state.safeChallengeOnly = false;
		applyChallengeFilter();

		expect(safeButton().style.fontSize).toBe("");
		expect(safeButton().style.minHeight).toBe("");
		expect(safeButton().style.padding).toBe("");
		// inline 覆蓋被移掉，版面交還給網站原本的 sm:grid-cols-[9rem_1fr]
		expect(safeArticle().style.gridTemplateColumns).toBe("");
		expect(safeArticle().className).toContain("sm:grid-cols-[9rem_1fr]");
	});

	it("重複套用不會有副作用", () => {
		applyChallengeFilter();
		applyChallengeFilter();
		applyChallengeFilter();
		expect(visibleChallengeNames()).toEqual(["友好切磋"]);
	});

	it("React 重繪把樣式清掉後，會重新套用回去", () => {
		applyChallengeFilter();
		expect(visibleChallengeNames()).toEqual(["友好切磋"]);

		redrawChallengeCard(); // 整個重建，inline style 全沒了
		expect(visibleChallengeNames()).toEqual(CHALLENGE_MODES);

		applyChallengeFilter();
		expect(visibleChallengeNames()).toEqual(["友好切磋"]);
	});

	it("不會動到喊話輸入框", () => {
		applyChallengeFilter();
		const input = document.querySelector('input[data-slot="input"]');
		expect(input).not.toBeNull();
		expect(input.closest("label").style.display).toBe("");
	});

	it("畫面上沒有挑戰卡片時回傳 false，不會出錯", () => {
		document.body.innerHTML = "";
		expect(applyChallengeFilter()).toBe(false);
	});

	it("有挑戰卡片時回傳 true", () => {
		expect(applyChallengeFilter()).toBe(true);
	});

	it("切換開關會存檔並通知重繪", () => {
		let changes = 0;
		on(STATE_CHANGED, () => changes++);

		setSafeChallengeOnly(false);
		expect(state.safeChallengeOnly).toBe(false);
		expect(changes).toBe(1);

		reloadState();
		expect(state.safeChallengeOnly).toBe(false); // 有寫進 localStorage
	});
});

describe("challenge - 標題旁的開關", () => {
	beforeEach(() => {
		localStorage.clear();
		resetBus();
		reloadState();
		document.body.innerHTML = "";
		renderChallengeCard();
	});

	it("掛在「挑戰」標題所在的卡片標題列裡", () => {
		const toggle = ensureChallengeToggle();
		expect(toggle).not.toBeNull();

		const header = document.querySelector('[data-slot="card-header"]');
		expect(header.contains(toggle)).toBe(true);
		expect(toggle.textContent).toContain("只顯示友好切磋");
	});

	it("用網站自己的 card-action 機制排到標題右邊", () => {
		const toggle = ensureChallengeToggle();
		expect(toggle.getAttribute("data-slot")).toBe("card-action");
	});

	it("預設是勾選狀態", () => {
		const toggle = ensureChallengeToggle();
		expect(toggle.querySelector("input").checked).toBe(true);
	});

	it("重複呼叫不會掛出第二顆", () => {
		ensureChallengeToggle();
		ensureChallengeToggle();
		ensureChallengeToggle();

		const header = document.querySelector('[data-slot="card-header"]');
		expect(header.querySelectorAll("[data-sao-helper]")).toHaveLength(1);
	});

	it("React 重繪把開關移除後，會自動補回來", () => {
		ensureChallengeToggle();
		redrawChallengeCard();
		expect(document.querySelector("[data-sao-helper]")).toBeNull();

		const toggle = ensureChallengeToggle();
		expect(toggle).not.toBeNull();
		expect(document.querySelectorAll("[data-sao-helper]")).toHaveLength(1);
	});

	it("狀態從別處被改動時，勾選狀態會同步回來", () => {
		const toggle = ensureChallengeToggle();
		expect(toggle.querySelector("input").checked).toBe(true);

		setSafeChallengeOnly(false);
		ensureChallengeToggle(); // reconcile 迴圈會再跑一次
		expect(toggle.querySelector("input").checked).toBe(false);
	});

	it("點開關會關掉安全模式，四個選項全部出現", () => {
		const toggle = ensureChallengeToggle();
		applyChallengeFilter();
		expect(visibleChallengeNames()).toEqual(["友好切磋"]);

		const checkbox = toggle.querySelector("input");
		checkbox.checked = false;
		checkbox.dispatchEvent(new Event("change"));

		expect(state.safeChallengeOnly).toBe(false);
		applyChallengeFilter();
		expect(visibleChallengeNames()).toEqual(CHALLENGE_MODES);
	});

	it("畫面上沒有挑戰卡片時回傳 null", () => {
		document.body.innerHTML = "";
		expect(ensureChallengeToggle()).toBeNull();
	});

	it("首頁的「行動」標題不會被誤認成挑戰卡片", () => {
		document.body.innerHTML = "<div><h2>行動</h2></div>";
		expect(ensureChallengeToggle()).toBeNull();
	});
});
