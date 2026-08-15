// ==UserScript==
// @name         Sword Art 經典服輔助工具
// @description  行動記錄 / 循環行動順序 / 樓層獎勵覆蓋
// @namespace    sword-art-defrag-helper
// @version      1.1.0
// @license      MIT
// @author       smilin
// @match        https://betawtf.swordartdefrag.page
// @grant        none
// ==/UserScript==

(function () {
	"use strict";

	// Tampermonkey 正常只會注入一次，不會遇到這個情況；只有手動重複貼上 Console 才需要擔心。
	if (window.__saoHelperInjected) {
		console.warn(
			"[SAO 輔助工具] 偵測到已經注入過，略過重複注入（如需重新載入請重新整理頁面）。",
		);
		return;
	}
	window.__saoHelperInjected = true;

	const ACTION_NAMES = [
		"狩獵兔肉",
		"自主訓練",
		"外出野餐",
		"汁妹",
		"做善事",
		"坐下休息",
		"釣魚",
	];
	const REWARD_NAME = "領取獎勵";
	const STORAGE_KEY = "saoDefragHelper_v3";

	// ---------------- state / 持久化 ----------------
	// sequence 的每個項目是一個「步驟」：{ name: 行動名稱, count: 需要點幾次才會換下一步 }
	// 例如：想要「自主訓練點兩次 -> 外出野餐點一次 -> 循環」
	//   sequence = [ { name: '自主訓練', count: 2 }, { name: '外出野餐', count: 1 } ]
	const defaultSequence = () =>
		ACTION_NAMES.map((n) => ({ name: n, count: 1 }));

	const defaultState = () => ({
		orderMode: false, // 只顯示當前輪到的行動（其餘隱藏）
		sequence: defaultSequence(), // 自訂循環順序（可重複、可設定連續次數）
		stepIndex: 0, // 目前在序列的第幾步
		stepProgress: 0, // 目前這一步已經點了幾次
		rewardOverlay: false, // 可領取時，覆蓋在行動按鈕上
	});

	function sanitizeSequence(seq) {
		if (!Array.isArray(seq) || seq.length === 0) return null;
		const cleaned = seq
			.filter((s) => s && ACTION_NAMES.includes(s.name))
			.map((s) => ({
				name: s.name,
				count: Math.max(1, Math.min(99, parseInt(s.count, 10) || 1)),
			}));
		return cleaned.length ? cleaned : null;
	}

	function loadState() {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) return defaultState();
			const parsed = JSON.parse(raw);
			const base = defaultState();
			const seq = sanitizeSequence(parsed.sequence);
			return {
				...base,
				...parsed,
				sequence: seq || defaultSequence(),
				stepIndex: Number.isInteger(parsed.stepIndex) ? parsed.stepIndex : 0,
				stepProgress: Number.isInteger(parsed.stepProgress)
					? parsed.stepProgress
					: 0,
			};
		} catch (e) {
			return defaultState();
		}
	}

	let state = loadState();
	function save() {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	}
	function currentStep() {
		if (!state.sequence.length) return null;
		state.stepIndex =
			((state.stepIndex % state.sequence.length) + state.sequence.length) %
			state.sequence.length;
		return state.sequence[state.stepIndex];
	}
	function resetProgress() {
		state.stepIndex = 0;
		state.stepProgress = 0;
	}

	// ---------------- 找遊戲原本的元素 ----------------
	function getAllButtons() {
		return Array.from(document.querySelectorAll("button"));
	}
	function getActionButtonMap() {
		const all = getAllButtons();
		const map = {};
		ACTION_NAMES.forEach((n) => {
			map[n] = all.find((b) => b.textContent.trim() === n) || null;
		});
		return map;
	}
	function getRewardButton() {
		return (
			getAllButtons().find((b) => b.textContent.trim() === REWARD_NAME) || null
		);
	}
	function getActionButtonsRow() {
		const map = getActionButtonMap();
		const first = ACTION_NAMES.map((n) => map[n]).find(Boolean);
		return first ? first.parentElement : null;
	}
	// 找出畫面上文字「完全等於」指定字串的最小節點（不含子元素），用來定位標題
	function findLeafByExactText(text) {
		const all = document.querySelectorAll("body *");
		for (const el of all) {
			if (el.children.length === 0 && el.textContent.trim() === text) return el;
		}
		return null;
	}
	function waitForLeafByExactText(
		text,
		{ timeout = 5000, interval = 150 } = {},
	) {
		return new Promise((resolve) => {
			const start = Date.now();
			(function tryFind() {
				const found = findLeafByExactText(text);
				if (found) return resolve(found);
				if (Date.now() - start >= timeout) return resolve(null);
				setTimeout(tryFind, interval);
			})();
		});
	}
	function getActionHeading() {
		return waitForLeafByExactText("行動");
	}
	function getRewardHeading() {
		return waitForLeafByExactText("樓層獎勵");
	}

	// ---------------- 行動記錄自動補上行動名稱 ----------------
	// 遊戲原本的「行動記錄」只會顯示「行動成功！獲得了 xx 點經驗值。」，沒有講是哪個行動。
	// 這裡用一個先進先出佇列記住「最近點了哪些行動」，一偵測到記錄區多了一筆新紀錄，
	// 就把最前面還沒被消耗的行動名稱接上去，變成「自主訓練成功！獲得了 xx 點經驗值。」
	const pendingActions = [];

	function tryAnnotateRecordNode(node) {
		if (!node || node.nodeType !== 1) return;
		if (node.dataset && node.dataset.saoAnnotated === "1") return;
		const text = node.textContent;
		if (typeof text !== "string" || !text.startsWith("行動")) return;
		const name = pendingActions.shift();
		if (!name) return; // 沒有對應得上的行動（例如頁面載入前就有的舊紀錄），保留原樣
		if (node.dataset) node.dataset.saoAnnotated = "1";
		const newText = name + text.slice("行動".length);
		// 優先找內層真正裝文字的元素改寫，找不到才整個節點的 textContent 一起覆蓋
		const inner = node.querySelector ? node.querySelector("*") : null;
		if (inner && inner.textContent === text && inner.children.length === 0) {
			inner.textContent = newText;
		} else {
			node.textContent = newText;
		}
	}

	function scanForRecordNodes(root) {
		if (!root || root.nodeType !== 1) return;
		if (root.tagName === "ARTICLE") {
			tryAnnotateRecordNode(root);
			return;
		}
		if (root.querySelectorAll) {
			root.querySelectorAll("article").forEach(tryAnnotateRecordNode);
		}
	}

	const recordObserver = new MutationObserver((mutations) => {
		for (const m of mutations) {
			m.addedNodes.forEach(scanForRecordNodes);
		}
	});
	recordObserver.observe(document.body, { childList: true, subtree: true });

	// 用事件代理監聽整個 document（capture），遊戲重新渲染按鈕節點也抓得到
	document.addEventListener(
		"click",
		(e) => {
			const btn = e.target.closest("button");
			if (!btn) return;
			if (btn.closest("[data-sao-helper]")) return; // 忽略我們自己加的控制項
			const text = btn.textContent.trim();
			if (!ACTION_NAMES.includes(text)) return;

			pendingActions.push(text);
			if (pendingActions.length > 20) pendingActions.shift();

			// 只有當這次點擊的是「目前輪到的行動」時才會推進序列
			if (state.orderMode) {
				const step = currentStep();
				if (step && text === step.name) {
					state.stepProgress += 1;
					if (state.stepProgress >= step.count) {
						state.stepProgress = 0;
						state.stepIndex = (state.stepIndex + 1) % state.sequence.length;
					}
					save();
					applyOrderVisibility();
					renderOrderUI();
				}
			}
		},
		true,
	);

	// ---------------- 行動順序 / 只顯示當前 ----------------
	function applyOrderVisibility() {
		const map = getActionButtonMap();
		if (!state.orderMode) {
			ACTION_NAMES.forEach((n) => {
				if (map[n]) map[n].style.removeProperty("display");
			});
			return;
		}
		const step = currentStep();
		const current = step ? step.name : null;
		ACTION_NAMES.forEach((n) => {
			if (!map[n]) return;
			map[n].style.display = n === current ? "" : "none";
		});
	}

	function moveSeqItem(index, dir) {
		const newIndex = index + dir;
		if (newIndex < 0 || newIndex >= state.sequence.length) return;
		const arr = state.sequence;
		[arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
		resetProgress();
		save();
		renderOrderUI();
		applyOrderVisibility();
	}
	function addSeqItem() {
		state.sequence.push({ name: ACTION_NAMES[0], count: 1 });
		save();
		renderOrderUI();
		applyOrderVisibility();
	}
	function removeSeqItem(index) {
		if (state.sequence.length <= 1) return; // 至少保留一步
		state.sequence.splice(index, 1);
		resetProgress();
		save();
		renderOrderUI();
		applyOrderVisibility();
	}

	// ---------------- 領取獎勵覆蓋 ----------------
	let overlayBtn = null;
	function ensureOverlayButton() {
		if (overlayBtn && document.body.contains(overlayBtn)) return overlayBtn;
		overlayBtn = document.createElement("button");
		overlayBtn.type = "button";
		overlayBtn.textContent = "領取獎勵";
		overlayBtn.setAttribute("data-sao-helper", "1");
		Object.assign(overlayBtn.style, {
			position: "absolute",
			inset: "0",
			width: "100%",
			height: "100%",
			zIndex: "9999",
			background: "rgba(22,163,74,0.94)",
			color: "#fff",
			fontSize: "16px",
			fontWeight: "700",
			letterSpacing: "1px",
			border: "2px solid rgba(255,255,255,0.7)",
			borderRadius: "6px",
			cursor: "pointer",
			boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
		});
		overlayBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			e.preventDefault();
			const real = getRewardButton();
			if (real && !real.disabled) real.click();
		});
		return overlayBtn;
	}

	function applyRewardOverlay() {
		const container = getActionButtonsRow();
		const real = getRewardButton();
		const btn = ensureOverlayButton();
		if (!container) {
			if (btn.parentElement) btn.parentElement.removeChild(btn);
			return;
		}
		const shouldShow = state.rewardOverlay && real && !real.disabled;
		if (shouldShow) {
			if (getComputedStyle(container).position === "static") {
				container.style.position = "relative";
			}
			if (btn.parentElement !== container) container.appendChild(btn);
		} else if (btn.parentElement) {
			btn.parentElement.removeChild(btn);
		}
	}

	// ---------------- 校正 ----------------
	// 主要邏輯已經在點擊/切換開關/編輯順序當下同步套用了；這裡保留低頻率輪詢純粹當保險。
	function reconcile() {
		applyOrderVisibility();
		applyRewardOverlay();
	}
	setInterval(reconcile, 1000);

	// ==================================================================
	// 把控制項直接嵌進遊戲畫面（不再用獨立的浮動面板）
	// ==================================================================
	function smallBtn(text, onClick) {
		const b = document.createElement("button");
		b.type = "button";
		b.textContent = text;
		b.setAttribute("data-sao-helper", "1");
		Object.assign(b.style, {
			background: "#e2e8f0",
			color: "#1e293b",
			border: "1px solid #cbd5e1",
			borderRadius: "5px",
			padding: "3px 8px",
			cursor: "pointer",
			fontSize: "12px",
		});
		b.addEventListener("mouseenter", () => (b.style.background = "#cbd5e1"));
		b.addEventListener("mouseleave", () => (b.style.background = "#e2e8f0"));
		b.addEventListener("click", onClick);
		return b;
	}

	function checkboxRow(labelText, checked, onChange) {
		const row = document.createElement("label");
		row.setAttribute("data-sao-helper", "1");
		Object.assign(row.style, {
			display: "inline-flex",
			alignItems: "center",
			gap: "6px",
			cursor: "pointer",
			fontSize: "13px",
		});
		const cb = document.createElement("input");
		cb.type = "checkbox";
		cb.checked = checked;
		cb.addEventListener("change", () => onChange(cb.checked));
		const span = document.createElement("span");
		span.textContent = labelText;
		row.appendChild(cb);
		row.appendChild(span);
		return { row, cb };
	}

	// ---- 樓層獎勵框：加上「領取獎勵覆蓋」開關 ----
	function mountRewardToggle() {
		try {
			const heading = getRewardHeading();
			const container = heading ? heading.parentElement : null;
			if (!container) {
				console.warn(
					"[SAO 輔助工具] 找不到「樓層獎勵」框，領取獎勵覆蓋開關未掛載。",
				);
				return;
			}
			const wrap = document.createElement("div");
			wrap.setAttribute("data-sao-helper", "1");
			Object.assign(wrap.style, {
				marginTop: "10px",
				paddingTop: "8px",
				borderTop: "1px dashed #cbd5e1",
				fontFamily:
					'system-ui, -apple-system, "Segoe UI", "Microsoft JhengHei", sans-serif',
			});
			const { row } = checkboxRow(
				"可領取時，覆蓋在行動按鈕上（方便快速點擊）",
				state.rewardOverlay,
				(checked) => {
					state.rewardOverlay = checked;
					save();
					applyRewardOverlay();
				},
			);
			wrap.appendChild(row);
			container.appendChild(wrap);
		} catch (err) {
			console.warn("[SAO 輔助工具] 掛載領取獎勵覆蓋開關失敗：", err);
		}
	}

	// ---- 行動框：加上循環行動順序編輯器 ----
	let seqListEl = null;
	let currentTurnEl = null;

	function mountOrderEditor() {
		try {
			const heading = getActionHeading();
			const buttonsRow = getActionButtonsRow();
			if (!heading || !buttonsRow) {
				console.warn("[SAO 輔助工具] 找不到「行動」框，行動順序功能未掛載。");
				return;
			}

			const wrap = document.createElement("div");
			wrap.setAttribute("data-sao-helper", "1");
			Object.assign(wrap.style, {
				margin: "8px 0 10px 0",
				padding: "8px 10px",
				background: "#f8fafc",
				border: "1px solid #e2e8f0",
				borderRadius: "6px",
				fontSize: "13px",
			});

			const titleRow = document.createElement("div");
			Object.assign(titleRow.style, {
				display: "flex",
				alignItems: "center",
				gap: "10px",
				flexWrap: "wrap",
			});
			const title = document.createElement("span");
			title.textContent = "循環行動順序：";
			title.style.fontWeight = "700";
			titleRow.appendChild(title);

			const { row: toggleRow } = checkboxRow(
				"啟用（只顯示當前輪到的行動，其餘隱藏）",
				state.orderMode,
				(checked) => {
					state.orderMode = checked;
					save();
					applyOrderVisibility();
					renderOrderUI();
				},
			);
			titleRow.appendChild(toggleRow);
			wrap.appendChild(titleRow);

			currentTurnEl = document.createElement("div");
			Object.assign(currentTurnEl.style, {
				margin: "6px 0",
				fontSize: "12.5px",
				color: "#16a34a",
				fontWeight: "600",
			});
			wrap.appendChild(currentTurnEl);

			seqListEl = document.createElement("div");
			Object.assign(seqListEl.style, {
				display: "flex",
				flexDirection: "column",
				gap: "4px",
				marginTop: "4px",
			});
			wrap.appendChild(seqListEl);

			const btnRow = document.createElement("div");
			Object.assign(btnRow.style, {
				display: "flex",
				gap: "6px",
				marginTop: "8px",
				flexWrap: "wrap",
			});
			btnRow.appendChild(smallBtn("+ 新增步驟", addSeqItem));
			btnRow.appendChild(
				smallBtn("重設進度", () => {
					resetProgress();
					save();
					applyOrderVisibility();
					renderOrderUI();
				}),
			);
			btnRow.appendChild(
				smallBtn("還原預設順序", () => {
					state.sequence = defaultSequence();
					resetProgress();
					save();
					applyOrderVisibility();
					renderOrderUI();
				}),
			);
			wrap.appendChild(btnRow);

			const hint = document.createElement("div");
			Object.assign(hint.style, {
				fontSize: "11px",
				color: "#64748b",
				marginTop: "6px",
			});
			hint.textContent =
				"例：自主訓練(2) → 外出野餐(1)，代表連點自主訓練兩次後才會換成外出野餐，跑完全部步驟後自動從頭循環。";
			wrap.appendChild(hint);

			// 插在「行動」標題之後、7 個行動按鈕之前
			heading.insertAdjacentElement("afterend", wrap);

			renderOrderUI();
		} catch (err) {
			console.warn("[SAO 輔助工具] 掛載行動順序編輯器失敗：", err);
		}
	}

	function renderOrderUI() {
		if (!seqListEl || !currentTurnEl) return;
		seqListEl.innerHTML = "";
		const step = currentStep();

		if (state.orderMode && step) {
			currentTurnEl.textContent = `目前輪到：${step.name}（已點 ${state.stepProgress}/${step.count} 次，步驟 ${state.stepIndex + 1}/${state.sequence.length}）`;
		} else {
			currentTurnEl.textContent = "（順序模式關閉，全部行動按鈕都會顯示）";
		}

		state.sequence.forEach((s, idx) => {
			const isCurrent = state.orderMode && idx === state.stepIndex;
			const item = document.createElement("div");
			item.setAttribute("data-sao-helper", "1");
			Object.assign(item.style, {
				display: "flex",
				alignItems: "center",
				gap: "5px",
				padding: "3px 6px",
				borderRadius: "4px",
				background: isCurrent ? "#dcfce7" : "#fff",
				border: isCurrent ? "1px solid #4ade80" : "1px solid #e2e8f0",
				flexWrap: "wrap",
			});

			const idxLabel = document.createElement("span");
			idxLabel.textContent = `${idx + 1}.`;
			idxLabel.style.color = "#64748b";
			item.appendChild(idxLabel);

			const select = document.createElement("select");
			select.setAttribute("data-sao-helper", "1");
			Object.assign(select.style, {
				background: "#fff",
				color: "#1e293b",
				border: "1px solid #cbd5e1",
				borderRadius: "4px",
				fontSize: "12.5px",
				padding: "2px 2px",
				flex: "1 1 auto",
				minWidth: "80px",
			});
			ACTION_NAMES.forEach((n) => {
				const opt = document.createElement("option");
				opt.value = n;
				opt.textContent = n;
				if (n === s.name) opt.selected = true;
				select.appendChild(opt);
			});
			select.addEventListener("change", () => {
				s.name = select.value;
				resetProgress();
				save();
				renderOrderUI();
				applyOrderVisibility();
			});
			item.appendChild(select);

			const countLabel = document.createElement("span");
			countLabel.textContent = "x";
			countLabel.style.color = "#64748b";
			item.appendChild(countLabel);

			const countInput = document.createElement("input");
			countInput.type = "number";
			countInput.min = "1";
			countInput.max = "99";
			countInput.value = String(s.count);
			countInput.setAttribute("data-sao-helper", "1");
			Object.assign(countInput.style, {
				width: "46px",
				background: "#fff",
				color: "#1e293b",
				border: "1px solid #cbd5e1",
				borderRadius: "4px",
				fontSize: "12.5px",
				padding: "2px 4px",
			});
			countInput.addEventListener("change", () => {
				const v = Math.max(
					1,
					Math.min(99, parseInt(countInput.value, 10) || 1),
				);
				s.count = v;
				countInput.value = String(v);
				resetProgress();
				save();
				renderOrderUI();
				applyOrderVisibility();
			});
			item.appendChild(countInput);

			const btnGroup = document.createElement("span");
			btnGroup.style.display = "flex";
			btnGroup.style.gap = "2px";
			const up = smallBtn("▲", () => moveSeqItem(idx, -1));
			const down = smallBtn("▼", () => moveSeqItem(idx, 1));
			const del = smallBtn("✕", () => removeSeqItem(idx));
			up.style.padding = "1px 6px";
			down.style.padding = "1px 6px";
			del.style.padding = "1px 6px";
			if (idx === 0) up.disabled = true;
			if (idx === state.sequence.length - 1) down.disabled = true;
			if (state.sequence.length <= 1) del.disabled = true;
			btnGroup.appendChild(up);
			btnGroup.appendChild(down);
			btnGroup.appendChild(del);
			item.appendChild(btnGroup);

			seqListEl.appendChild(item);
		});
	}

	// ---------------- 初始化 ----------------
	mountRewardToggle();
	mountOrderEditor();
	applyOrderVisibility();
	applyRewardOverlay();
})();
