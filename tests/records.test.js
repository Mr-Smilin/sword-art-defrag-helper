import { beforeEach, describe, expect, it } from "vitest";
import {
	getAwaiting,
	getLabels,
	queueLabel,
	resetRecords,
	scanRecords,
} from "../src/records.js";
import { createRecordList, rawRecord } from "./helpers/record-list.js";

describe("records - 行動記錄補名稱", () => {
	/** @type {ReturnType<typeof createRecordList>} */
	let list;

	function setup(cap) {
		document.body.innerHTML = "<div id='log'></div>";
		list = createRecordList(document.getElementById("log"), cap);
		resetRecords();
	}

	beforeEach(() => {
		setup(5);
	});

	it("成功的行動會把名稱補到最新一筆上", () => {
		queueLabel("釣魚");
		list.push(rawRecord(10));
		scanRecords();

		expect(getLabels()).toEqual(["釣魚"]);
		expect(list.visibleTexts()[0]).toBe("釣魚成功！獲得了 10 點經驗值。");
	});

	it("腳本載入前就存在的舊紀錄不會被亂標", () => {
		list.push(rawRecord(1));
		list.push(rawRecord(2));
		scanRecords(); // 初始化掃描，awaiting 是空的

		expect(getLabels()).toEqual([null, null]);
		expect(list.visibleTexts()).toEqual([
			rawRecord(2),
			rawRecord(1),
		]);
	});

	it("React 重繪把標註蓋回原文後，會重新補上（且不會多推一格）", () => {
		queueLabel("汁妹");
		list.push(rawRecord(7));
		scanRecords();
		expect(list.visibleTexts()[0]).toBe("汁妹成功！獲得了 7 點經驗值。");

		list.redraw(); // React 把文字蓋回「行動成功！...」
		expect(list.visibleTexts()[0]).toBe(rawRecord(7));

		scanRecords();
		expect(list.visibleTexts()[0]).toBe("汁妹成功！獲得了 7 點經驗值。");
		expect(getLabels()).toEqual(["汁妹"]); // 沒有被誤判成又多了一筆
	});

	it("多筆紀錄會各自對到正確的行動", () => {
		queueLabel("狩獵兔肉");
		list.push(rawRecord(3));
		scanRecords();

		queueLabel("釣魚");
		list.push(rawRecord(8));
		scanRecords();

		expect(getLabels()).toEqual(["釣魚", "狩獵兔肉"]);
		expect(list.visibleTexts()).toEqual([
			"釣魚成功！獲得了 8 點經驗值。",
			"狩獵兔肉成功！獲得了 3 點經驗值。",
		]);
	});

	// ★ 這是這次修正的核心回歸測試。
	// 舊版靠「最新一筆的文字有沒有變」判斷有沒有新紀錄，清單滿了之後遇到
	// 連續兩次相同行動又拿到相同經驗值，文字一模一樣就會漏判，並且從此永久錯位一格。
	it("清單已滿且連續兩筆文字完全相同時，仍然不會錯位", () => {
		setup(3);
		// 先把清單塞滿
		list.push(rawRecord(1));
		list.push(rawRecord(2));
		list.push(rawRecord(3));
		scanRecords();
		expect(getLabels()).toEqual([null, null, null]);

		queueLabel("狩獵兔肉");
		list.push(rawRecord(5));
		scanRecords();
		expect(getLabels()[0]).toBe("狩獵兔肉");

		// 同一個行動、同樣的經驗值 → 原始文字與上一筆一字不差
		queueLabel("狩獵兔肉");
		list.push(rawRecord(5));
		scanRecords();
		expect(getLabels().slice(0, 2)).toEqual(["狩獵兔肉", "狩獵兔肉"]);

		// 換一個行動，這裡是舊版真正暴露錯位的地方
		queueLabel("釣魚");
		list.push(rawRecord(7));
		scanRecords();

		expect(getLabels()).toEqual(["釣魚", "狩獵兔肉", "狩獵兔肉"]);
		expect(list.visibleTexts()[0]).toBe("釣魚成功！獲得了 7 點經驗值。");
	});

	it("清單已滿時，相鄰兩筆文字相同又碰上重繪，不會提早 commit", () => {
		setup(3);
		list.push(rawRecord(1));
		list.push(rawRecord(4));
		list.push(rawRecord(4)); // 第 1、2 筆文字相同
		scanRecords();

		// 行動已確認成功，但畫面還沒更新，這時 React 只是重繪
		queueLabel("釣魚");
		list.redraw();
		scanRecords();

		expect(getLabels()).toEqual([null, null, null]); // 還沒 commit
		expect(getAwaiting()).toEqual(["釣魚"]); // 仍在排隊

		// 真正的新紀錄進來才 commit
		list.push(rawRecord(9));
		scanRecords();
		expect(getLabels()[0]).toBe("釣魚");
		expect(getAwaiting()).toEqual([]);
	});

	it("兩次掃描之間連續進來多筆，也能各自對到正確的行動", () => {
		setup(3);
		list.push(rawRecord(1));
		list.push(rawRecord(2));
		list.push(rawRecord(3));
		scanRecords();

		queueLabel("做善事");
		queueLabel("坐下休息");
		list.push(rawRecord(4));
		list.push(rawRecord(5));
		scanRecords(); // 一次掃描要吃掉兩筆

		expect(getLabels().slice(0, 2)).toEqual(["坐下休息", "做善事"]);
	});

	it("成功但認不出行動名稱時，仍然佔一格避免後續錯位", () => {
		queueLabel(null);
		list.push(rawRecord(6));
		scanRecords();
		expect(getLabels()).toEqual([null]);

		queueLabel("釣魚");
		list.push(rawRecord(9));
		scanRecords();
		expect(getLabels()).toEqual(["釣魚", null]);
	});

	it("沒有紀錄節點時不會出錯", () => {
		document.body.innerHTML = "";
		resetRecords();
		expect(() => scanRecords()).not.toThrow();
		expect(getLabels()).toEqual([]);
	});
});
