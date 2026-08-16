// 共用的小元件。所有我們自己加的元素都會帶 data-sao-helper 屬性，
// 這樣點擊代理才分得出哪些是遊戲原本的按鈕、哪些是我們的控制項。

export function smallBtn(text, onClick, variant) {
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

export function checkboxRow(labelText, checked, onChange) {
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
