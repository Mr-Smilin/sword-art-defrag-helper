// ==UserScript==
// @name         Sword Art 經典服輔助工具
// @description  行動記錄 / 循環行動順序 / 樓層獎勵覆蓋
// @namespace    sword-art-defrag-helper
// @version      1.3.2
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
	// 剛載入網頁時，遊戲畫面可能還沒渲染出來，直接查會查不到。
	// 這裡改成輪詢：每 150ms 查一次，最多等 5 秒，找到就馬上回傳，逾時回傳 null。
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
	//
	// ★ 這一段被改寫過好幾次，因為遊戲的紀錄清單有兩個很容易踩雷的特性
	//   （下面兩點是實際在頁面上量測出來的，不是猜的）：
	//
	//   1. 清單是「最新的在最上面」，但 React 是用「位置」在對應節點，不是用內容。
	//      新增一筆紀錄時，它並不會在最上面插入一個新的 <article>，
	//      而是把「既有每個節點的文字」整批往下挪一格重寫，然後在「最後面」補一個新節點。
	//      => 最新的那筆紀錄是「改既有節點的文字」，不會觸發 childList 的新增節點事件；
	//         真正被新增的那個節點反而裝的是「最舊」的那筆內容。
	//         所以只監聽 addedNodes 永遠抓不到最新那筆，而且會標錯到最舊那筆上。
	//
	//   2. 每次重繪，React 都會用它自己資料裡的原始文字覆蓋回去，
	//      也就是我們改過的字會被整個蓋掉、變回「行動成功！...」。
	//      => 標註不能只做一次，必須在每次重繪後持續重新套用。
	//
	//   （這也是為什麼之前用 data-sao-annotated 標記「處理過了」會壞掉：
	//     節點會被重複使用，標記黏在節點上，內容換成新紀錄後就被永久跳過，
	//     於是「某一筆之後全部都不再替換」。）
	//
	// 所以改成：自己維護一份「第幾筆紀錄 = 哪個行動」的對照表（labels，索引 0 是最新一筆），
	// 有新紀錄進來就整個往下推一格，然後每次重繪後都依照這份對照表把名字重新補回去。
	// 實際改寫時一樣只動開頭「行動」兩個字，後面文字（含升級能力變化那種多行額外訊息）完全不碰。
	const pendingActions = []; // 點過但還沒對應到紀錄的行動名稱（先進先出）
	let labels = []; // labels[i] = 第 i 筆紀錄（0 = 最新）對應的行動名稱，沒有就是 null
	let lastCount = 0; // 上次看到的紀錄筆數
	let lastTopRaw = null; // 上次看到的「最新一筆」的原始文字（還沒被我們改過的）

	// 找出節點裡「文件順序上第一個非空白文字節點」，也就是真正裝訊息的那個文字節點
	function findLeadingTextNode(root) {
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		let n;
		while ((n = walker.nextNode())) {
			if (n.nodeValue && n.nodeValue.trim() !== "") return n;
		}
		return null;
	}

	function getRecordArticles() {
		return Array.from(document.querySelectorAll("article"));
	}

	function scanRecords() {
		const arts = getRecordArticles();
		const n = arts.length;
		if (!n) {
			lastCount = 0;
			lastTopRaw = null;
			return;
		}

		const topNode = findLeadingTextNode(arts[0]);
		const topText = topNode ? topNode.nodeValue : "";
		// 開頭還是「行動」＝這是遊戲剛寫上去的原始文字（我們還沒補名字，或剛被重繪蓋回去）
		const topIsRaw = topText.trimStart().startsWith("行動");

		// --- 判斷有沒有新紀錄進來 ---
		let newCount = 0;
		if (n > lastCount) {
			// 一般情況：清單還沒滿，筆數變多了
			newCount = n - lastCount;
		} else if (topIsRaw && lastTopRaw !== null && topText !== lastTopRaw) {
			// 清單已達上限、筆數不再變多，但最新一筆的內容換了 → 也是新的一筆
			newCount = 1;
		}

		for (let k = 0; k < newCount; k++) {
			// 有排隊中的行動就用它，沒有就補 null（例如頁面載入前就存在的舊紀錄）
			labels.unshift(pendingActions.length ? pendingActions.shift() : null);
		}
		labels.length = n; // 跟目前筆數對齊（清單捲掉的舊紀錄就一起丟掉）

		// --- 依照對照表把名字補回去 ---
		// React 每次重繪都會把我們改的字蓋回原文，所以這裡每次都要重新套用一遍。
		// 已經是我們改過的（開頭不是「行動」）就會自動跳過，重複執行不會有副作用。
		arts.forEach((a, i) => {
			const name = labels[i];
			if (!name) return;
			const tn = findLeadingTextNode(a);
			if (!tn) return;
			const raw = tn.nodeValue;
			const trimmed = raw.trimStart();
			if (!trimmed.startsWith("行動")) return; // 開頭不是「行動」→ 不處理
			const lead = raw.length - trimmed.length; // 開頭空白數，也就是「行動」的起始位置
			tn.nodeValue =
				raw.slice(0, lead) + name + raw.slice(lead + "行動".length);
		});

		lastCount = n;
		if (topIsRaw) lastTopRaw = topText; // 只記錄「原始文字」，別把自己改過的字記進去
	}

	// characterData 也要監聽：最新一筆是用「改既有節點的文字」的方式更新的，
	// 只聽 childList 會完全漏掉它。scanRecords 本身是冪等的（重複跑不會有副作用、
	// 也不會再產生新的變動），所以被自己的修改再觸發一次也會自然收斂，不會無限迴圈。
	const recordObserver = new MutationObserver(() => {
		scanRecords();
	});
	recordObserver.observe(document.body, {
		childList: true,
		subtree: true,
		characterData: true,
	});

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
	// 只剩一顆行動按鈕時，把它稍微放大一點，比較好點擊（不是縮小成一小格）。
	const ENLARGED_BUTTON_STYLE = {
		minWidth: "200px",
		minHeight: "60px",
		fontSize: "22px",
		padding: "16px 28px",
	};
	function clearEnlargedButton(btn) {
		btn.style.minWidth = "";
		btn.style.minHeight = "";
		btn.style.fontSize = "";
		btn.style.padding = "";
	}
	function applyOrderVisibility() {
		const map = getActionButtonMap();
		if (!state.orderMode) {
			ACTION_NAMES.forEach((n) => {
				if (!map[n]) return;
				map[n].style.removeProperty("display");
				clearEnlargedButton(map[n]);
			});
			return;
		}
		const step = currentStep();
		const current = step ? step.name : null;
		ACTION_NAMES.forEach((n) => {
			if (!map[n]) return;
			const btn = map[n];
			if (n === current) {
				btn.style.display = "";
				Object.assign(btn.style, ENLARGED_BUTTON_STYLE);
			} else {
				btn.style.display = "none";
				clearEnlargedButton(btn);
			}
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
		// 這顆是「蓋在行動按鈕上」的強調用按鈕，本來就要跟底下按鈕明顯不同、
		// 不管深色淺色都要一眼看到，所以維持固定的綠色實色，不跟著主題切換。
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
		scanRecords();
	}
	setInterval(reconcile, 1000);

	// ==================================================================
	// 把控制項直接嵌進遊戲畫面（不再用獨立的浮動面板）
	//
	// 顏色不再自己寫死 hex 色碼，改用網站本身既有的 Tailwind / shadcn 語意色
	// class（例如 bg-card、text-foreground、bg-primary...），這些 class 背後
	// 綁的是 CSS 變數，網站切換深色/淺色模式（<html class="dark">）時會自動
	// 連動改變，不需要我們自己判斷目前是什麼主題。
	// 這些 class 名稱是先在頁面上實際建立測試元素、用 getComputedStyle 確認
	// 網站的編譯後 CSS 裡真的有對應樣式才選用的（避免用到網站沒編譯出來、
	// 掛了也不會生效的 class，例如 opacity-80、hover:bg-secondary 這種）。
	//
	// 例外：網站自己的 bg-muted / bg-secondary 這兩個 token 實測起來偏藍
	// （oklch 色相 ~243，淺色模式下看起來像淺藍而不是中性灰），行動順序面板
	// 這塊我們自己想要的是「乾淨的淺灰／深灰」，所以改成手動指定中性灰階色碼，
	// 並且監聽 <html class="dark"> 的變化，主題切換時自己重新上色。
	// ==================================================================
	function isDarkMode() {
		return document.documentElement.classList.contains("dark");
	}
	const NEUTRAL_PALETTE = {
		light: {
			panelBg: "#f3f4f6",
			panelText: "#111827",
			panelBorder: "#d1d5db",
			mutedText: "#4b5563",
		},
		dark: {
			panelBg: "#27272a",
			panelText: "#f4f4f5",
			panelBorder: "#3f3f46",
			mutedText: "#a1a1aa",
		},
	};
	function neutralPalette() {
		return isDarkMode() ? NEUTRAL_PALETTE.dark : NEUTRAL_PALETTE.light;
	}

	function smallBtn(text, onClick, variant) {
		const b = document.createElement("button");
		b.type = "button";
		b.textContent = text;
		b.setAttribute("data-sao-helper", "1");
		b.className =
			variant === "danger"
				? "bg-destructive text-destructive-foreground"
				: "bg-secondary text-secondary-foreground";
		Object.assign(b.style, {
			borderWidth: "1px",
			borderStyle: "solid",
			borderRadius: "5px",
			padding: "4px 9px",
			cursor: "pointer",
			fontSize: "12px",
		});
		b.classList.add("border-border");
		// 用 opacity 做 hover 回饋（不依賴網站是否剛好有編譯出 hover: 開頭的 class）
		b.addEventListener("mouseenter", () => (b.style.opacity = "0.75"));
		b.addEventListener("mouseleave", () => (b.style.opacity = "1"));
		b.addEventListener("click", onClick);
		return b;
	}

	function checkboxRow(labelText, checked, onChange) {
		const row = document.createElement("label");
		row.setAttribute("data-sao-helper", "1");
		row.className = "text-foreground";
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
		cb.className = "accent-primary";
		cb.addEventListener("change", () => onChange(cb.checked));
		const span = document.createElement("span");
		span.textContent = labelText;
		row.appendChild(cb);
		row.appendChild(span);
		return { row, cb };
	}

	// ---- 樓層獎勵框：加上「領取獎勵覆蓋」開關 ----
	async function mountRewardToggle() {
		try {
			const heading = await getRewardHeading();
			const container = heading ? heading.parentElement : null;
			if (!container) {
				console.warn(
					"[SAO 輔助工具] 找不到「樓層獎勵」框，領取獎勵覆蓋開關未掛載。",
				);
				return;
			}
			const wrap = document.createElement("div");
			wrap.setAttribute("data-sao-helper", "1");
			wrap.className = "text-foreground border-border";
			Object.assign(wrap.style, {
				marginTop: "10px",
				paddingTop: "8px",
				borderTopWidth: "1px",
				borderTopStyle: "dashed",
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
	let orderWrapEl = null;
	let orderHintEl = null;

	function paintOrderPanel() {
		const p = neutralPalette();
		if (orderWrapEl) {
			orderWrapEl.style.backgroundColor = p.panelBg;
			orderWrapEl.style.color = p.panelText;
			orderWrapEl.style.borderColor = p.panelBorder;
		}
		if (orderHintEl) {
			orderHintEl.style.color = p.mutedText;
		}
	}

	async function mountOrderEditor() {
		try {
			const heading = await getActionHeading();
			const buttonsRow = getActionButtonsRow();
			if (!heading || !buttonsRow) {
				console.warn("[SAO 輔助工具] 找不到「行動」框，行動順序功能未掛載。");
				return;
			}

			const wrap = document.createElement("div");
			wrap.setAttribute("data-sao-helper", "1");
			orderWrapEl = wrap;
			Object.assign(wrap.style, {
				margin: "8px 0 10px 0",
				padding: "8px 10px",
				borderWidth: "1px",
				borderStyle: "solid",
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
			currentTurnEl.className = "text-primary";
			Object.assign(currentTurnEl.style, {
				margin: "6px 0",
				fontSize: "12.5px",
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
			const addBtn = smallBtn("+ 新增步驟", addSeqItem);
			const resetBtn = smallBtn("重設進度", () => {
				resetProgress();
				save();
				applyOrderVisibility();
				renderOrderUI();
			});
			const restoreBtn = smallBtn("還原預設順序", () => {
				state.sequence = defaultSequence();
				resetProgress();
				save();
				applyOrderVisibility();
				renderOrderUI();
			});
			// 這三顆是主要操作按鈕，比步驟列裡的 ▲▼✕ 小按鈕再大一點，方便點擊。
			[addBtn, resetBtn, restoreBtn].forEach((b) => {
				b.style.padding = "6px 14px";
				b.style.fontSize = "13px";
			});
			btnRow.appendChild(addBtn);
			btnRow.appendChild(resetBtn);
			btnRow.appendChild(restoreBtn);
			wrap.appendChild(btnRow);

			const hint = document.createElement("div");
			orderHintEl = hint;
			Object.assign(hint.style, {
				fontSize: "11px",
				marginTop: "6px",
			});
			hint.textContent =
				"例：自主訓練(2) → 外出野餐(1)，代表連點自主訓練兩次後才會換成外出野餐，跑完全部步驟後自動從頭循環。";
			wrap.appendChild(hint);

			// 插在「行動」標題之後、7 個行動按鈕之前
			heading.insertAdjacentElement("afterend", wrap);

			paintOrderPanel();
			renderOrderUI();

			// 網站切換深色/淺色模式時（<html class="dark"> 增減），重新上色。
			const themeObserver = new MutationObserver(() => {
				paintOrderPanel();
				renderOrderUI();
			});
			themeObserver.observe(document.documentElement, {
				attributes: true,
				attributeFilter: ["class"],
			});
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
			// 當前這一步：用網站的主色（跟「修行」按鈕同一組綠色 token）實色填滿凸顯出來。
			// 其餘步驟：跟卡片本身同色系，加一圈邊框做區隔。
			item.className = isCurrent
				? "bg-primary text-primary-foreground"
				: "bg-card text-card-foreground border-border";
			Object.assign(item.style, {
				display: "flex",
				alignItems: "center",
				gap: "5px",
				padding: "3px 6px",
				borderRadius: "4px",
				borderWidth: isCurrent ? "0" : "1px",
				borderStyle: "solid",
				flexWrap: "wrap",
			});

			const idxLabel = document.createElement("span");
			idxLabel.textContent = `${idx + 1}.`;
			if (!isCurrent) idxLabel.style.color = neutralPalette().mutedText;
			item.appendChild(idxLabel);

			const select = document.createElement("select");
			select.setAttribute("data-sao-helper", "1");
			select.className = "bg-background text-foreground border-input";
			Object.assign(select.style, {
				borderWidth: "1px",
				borderStyle: "solid",
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
			if (!isCurrent) countLabel.style.color = neutralPalette().mutedText;
			item.appendChild(countLabel);

			const countInput = document.createElement("input");
			countInput.type = "number";
			countInput.min = "1";
			countInput.max = "99";
			countInput.value = String(s.count);
			countInput.setAttribute("data-sao-helper", "1");
			countInput.className = "bg-background text-foreground border-input";
			Object.assign(countInput.style, {
				width: "46px",
				borderWidth: "1px",
				borderStyle: "solid",
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
			const del = smallBtn("✕", () => removeSeqItem(idx), "danger");
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
	// 先掃一次，把「腳本載入前就已經存在的舊紀錄」登記起來（此時 pendingActions 是空的，
	// 所以它們的對照名稱都會是 null），之後就不會去動到這些沒辦法對應行動的舊紀錄。
	scanRecords();
	mountRewardToggle();
	mountOrderEditor();
	applyOrderVisibility();
	applyRewardOverlay();
})();
