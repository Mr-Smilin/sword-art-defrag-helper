import { beforeEach, describe, expect, it } from "vitest";
import {
	getLabels,
	recordSuccess,
	resetRecords,
	scanRecords,
} from "../../src/features/records.js";
import { createRecordList, rawRecord } from "../helpers/record-list.js";

describe("records - 行動記錄補名稱", () => {
	/** @type {ReturnType<typeof createRecordList>} */
	let list;

	function setup(cap) {
		document.body.innerHTML = "<div id='log'></div>";
		list = createRecordList(document.getElementById("log"), cap);
		resetRecords();
	}

	/** 一次行動成功：對照表推一筆，畫面多一筆，然後掃描。 */
	function succeed(name, exp) {
		recordSuccess(name);
		list.push(rawRecord(exp));
		scanRecords();
	}

	beforeEach(() => {
		setup(5);
	});

	it("成功的行動會把名稱補到最新一筆上", () => {
		succeed("釣魚", 10);

		expect(getLabels()).toEqual(["釣魚"]);
		expect(list.visibleTexts()[0]).toBe("釣魚成功！獲得了 10 點經驗值。");
	});

	it("腳本載入前就存在的舊紀錄不會被亂標", () => {
		list.push(rawRecord(1));
		list.push(rawRecord(2));
		scanRecords(); // 初始化掃描，對照表是空的

		expect(getLabels()).toEqual([]);
		expect(list.visibleTexts()).toEqual([rawRecord(2), rawRecord(1)]);
	});

	it("多筆紀錄會各自對到正確的行動", () => {
		succeed("狩獵兔肉", 3);
		succeed("釣魚", 8);

		expect(getLabels()).toEqual(["釣魚", "狩獵兔肉"]);
		expect(list.visibleTexts()).toEqual([
			"釣魚成功！獲得了 8 點經驗值。",
			"狩獵兔肉成功！獲得了 3 點經驗值。",
		]);
	});

	it("元件重新掛載把標註整批蓋回原文後，會重新補上", () => {
		succeed("汁妹", 7);
		expect(list.visibleTexts()[0]).toBe("汁妹成功！獲得了 7 點經驗值。");

		list.forceRedraw(); // React 重新掛載，文字被蓋回原文
		expect(list.visibleTexts()[0]).toBe(rawRecord(7));

		scanRecords();
		expect(list.visibleTexts()[0]).toBe("汁妹成功！獲得了 7 點經驗值。");
		expect(getLabels()).toEqual(["汁妹"]); // 沒有被誤判成又多了一筆
	});

	it("單純重繪（值沒變、React 不寫 DOM）不會影響標註", () => {
		succeed("汁妹", 7);
		list.redraw();
		scanRecords();

		expect(list.visibleTexts()[0]).toBe("汁妹成功！獲得了 7 點經驗值。");
		expect(getLabels()).toEqual(["汁妹"]);
	});

	// ★ 使用者實測回報的情境：循環順序設定「狩獵兔肉 x2 -> 外出野餐 x1」，
	// 三次行動的經驗值剛好相同（文字一模一樣）時，行動紀錄的標註會整批錯掉。
	// 關鍵在於 React 看到值沒變就完全不改 DOM，於是節點語意上換成了新紀錄，
	// 畫面上卻還留著我們替舊紀錄寫上去的行動名稱。
	it("三筆文字完全相同、中途換行動時，標註仍然正確", () => {
		succeed("狩獵兔肉", 5);
		succeed("狩獵兔肉", 5);
		succeed("外出野餐", 5);

		expect(getLabels()).toEqual(["外出野餐", "狩獵兔肉", "狩獵兔肉"]);
		expect(list.visibleTexts()).toEqual([
			"外出野餐成功！獲得了 5 點經驗值。",
			"狩獵兔肉成功！獲得了 5 點經驗值。",
			"狩獵兔肉成功！獲得了 5 點經驗值。",
		]);
	});

	// 同上，但清單已經滿了：這時 React 連新增節點都不會做，畫面上一個字都不會變，
	// 完全沒有任何 DOM 訊號可以依賴，只能靠 API 給的對照表。
	it("清單已滿且每一筆文字都相同時，換行動的標註仍然正確", () => {
		setup(3);
		list.push(rawRecord(5));
		list.push(rawRecord(5));
		list.push(rawRecord(5));
		scanRecords();

		succeed("狩獵兔肉", 5);
		succeed("狩獵兔肉", 5);
		succeed("外出野餐", 5);

		expect(list.visibleTexts()).toEqual([
			"外出野餐成功！獲得了 5 點經驗值。",
			"狩獵兔肉成功！獲得了 5 點經驗值。",
			"狩獵兔肉成功！獲得了 5 點經驗值。",
		]);
	});

	it("清單已滿且連續兩筆文字完全相同時，仍然不會錯位", () => {
		setup(3);
		list.push(rawRecord(1));
		list.push(rawRecord(2));
		list.push(rawRecord(3));
		scanRecords();

		succeed("狩獵兔肉", 5);
		succeed("狩獵兔肉", 5); // 原始文字與上一筆一字不差
		succeed("釣魚", 7);

		expect(getLabels().slice(0, 3)).toEqual([
			"釣魚",
			"狩獵兔肉",
			"狩獵兔肉",
		]);
		expect(list.visibleTexts()[0]).toBe("釣魚成功！獲得了 7 點經驗值。");
	});

	it("兩次掃描之間連續進來多筆，也能各自對到正確的行動", () => {
		setup(3);
		list.push(rawRecord(1));
		list.push(rawRecord(2));
		list.push(rawRecord(3));
		scanRecords();

		recordSuccess("做善事");
		recordSuccess("坐下休息");
		list.push(rawRecord(4));
		list.push(rawRecord(5));
		scanRecords(); // 一次掃描要吃掉兩筆

		expect(getLabels().slice(0, 2)).toEqual(["坐下休息", "做善事"]);
		expect(list.visibleTexts().slice(0, 2)).toEqual([
			"坐下休息成功！獲得了 5 點經驗值。",
			"做善事成功！獲得了 4 點經驗值。",
		]);
	});

	it("成功但認不出行動名稱時，仍然佔一格避免後續錯位", () => {
		succeed(null, 6);
		expect(getLabels()).toEqual([null]);
		expect(list.visibleTexts()[0]).toBe(rawRecord(6)); // 沒有名字就不動它

		succeed("釣魚", 9);
		expect(getLabels()).toEqual(["釣魚", null]);
		expect(list.visibleTexts()).toEqual([
			"釣魚成功！獲得了 9 點經驗值。",
			rawRecord(6),
		]);
	});

	it("重複掃描不會有副作用", () => {
		succeed("釣魚", 10);
		const before = list.visibleTexts();
		scanRecords();
		scanRecords();
		expect(list.visibleTexts()).toEqual(before);
	});

	it("沒有紀錄節點時不會出錯", () => {
		document.body.innerHTML = "";
		resetRecords();
		expect(() => scanRecords()).not.toThrow();
		expect(getLabels()).toEqual([]);
	});
});
