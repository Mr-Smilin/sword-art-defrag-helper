// 樓層獎勵可領取時，蓋一顆大按鈕在行動按鈕列上，方便直接點。

import { STATE_CHANGED, emit } from "./bus.js";
import { getActionButtonsRow, getRewardButton } from "./dom.js";
import { save, state } from "./state.js";

let overlayBtn = null;

export function ensureOverlayButton() {
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

export function applyRewardOverlay() {
	const container = getActionButtonsRow();
	const real = getRewardButton();
	const btn = ensureOverlayButton();
	if (!container) {
		if (btn.parentElement) btn.parentElement.removeChild(btn);
		return;
	}
	const shouldShow = state.rewardOverlay && real && !real.disabled;
	if (shouldShow) {
		// 覆蓋按鈕是 position:absolute + inset:0，容器必須是定位元素才蓋得準。
		// 空字串也要算 static：部分環境（例如 jsdom）對未指定的元素會回傳 ""。
		const position = getComputedStyle(container).position;
		if (!position || position === "static") {
			container.style.position = "relative";
		}
		if (btn.parentElement !== container) container.appendChild(btn);
	} else if (btn.parentElement) {
		btn.parentElement.removeChild(btn);
	}
}

export function setRewardOverlay(enabled) {
	state.rewardOverlay = !!enabled;
	save();
	emit(STATE_CHANGED);
}

/** 測試用。 */
export function resetRewardOverlay() {
	if (overlayBtn?.parentElement) overlayBtn.parentElement.removeChild(overlayBtn);
	overlayBtn = null;
}
