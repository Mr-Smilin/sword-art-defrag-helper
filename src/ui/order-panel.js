// 在「行動」框裡（標題之後、七顆行動按鈕之前）掛上循環行動順序編輯器。

import { ACTION_NAMES } from "../constants.js";
import { getActionButtonsRow, getActionHeading } from "../dom.js";
import {
	addSeqItem,
	moveSeqItem,
	removeSeqItem,
	resetSequenceProgress,
	restoreDefaultSequence,
	setOrderMode,
	setSeqItemCount,
	setSeqItemName,
} from "../order.js";
import { currentStep, state } from "../state.js";
import { neutralPalette, observeTheme } from "../theme.js";
import { checkboxRow, smallBtn } from "./components.js";

let seqListEl = null;
let currentTurnEl = null;
let orderWrapEl = null;
let orderHintEl = null;

export function paintOrderPanel() {
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

export async function mountOrderEditor() {
	try {
		const heading = await getActionHeading();
		const buttonsRow = getActionButtonsRow();
		if (!heading || !buttonsRow) {
			console.warn("[SAO 輔助工具] 找不到「行動」框，行動順序功能未掛載。");
			return null;
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
			setOrderMode,
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
		const resetBtn = smallBtn("重設進度", resetSequenceProgress);
		const restoreBtn = smallBtn("還原預設順序", restoreDefaultSequence);
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

		observeTheme(() => {
			paintOrderPanel();
			renderOrderUI();
		});

		return wrap;
	} catch (err) {
		console.warn("[SAO 輔助工具] 掛載行動順序編輯器失敗：", err);
		return null;
	}
}

export function renderOrderUI() {
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
		select.addEventListener("change", () => setSeqItemName(idx, select.value));
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
			const applied = setSeqItemCount(idx, countInput.value);
			if (applied != null) countInput.value = String(applied);
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

/** 測試用：解除面板參照。 */
export function resetOrderPanel() {
	seqListEl = null;
	currentTurnEl = null;
	orderWrapEl = null;
	orderHintEl = null;
}
