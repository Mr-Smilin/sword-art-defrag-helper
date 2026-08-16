// 配色。
//
// 控制項的顏色盡量用網站本身既有的 Tailwind / shadcn 語意色 class（bg-card、text-foreground、
// bg-primary...），這些 class 背後綁的是 CSS 變數，網站切換深色/淺色模式（<html class="dark">）
// 時會自動連動，不需要我們自己判斷目前是什麼主題。
// 這些 class 名稱是先在頁面上實際建立測試元素、用 getComputedStyle 確認網站的編譯後 CSS 裡
// 真的有對應樣式才選用的（避免用到網站沒編譯出來、掛了也不會生效的 class，
// 例如 opacity-80、hover:bg-secondary 這種）。
//
// 例外：網站自己的 bg-muted / bg-secondary 這兩個 token 實測起來偏藍（oklch 色相 ~243，
// 淺色模式下看起來像淺藍而不是中性灰），行動順序面板這塊我們自己想要的是「乾淨的淺灰／深灰」，
// 所以改成手動指定中性灰階色碼，並且監聽 <html class="dark"> 的變化，主題切換時自己重新上色。

export function isDarkMode() {
	return document.documentElement.classList.contains("dark");
}

export const NEUTRAL_PALETTE = {
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

export function neutralPalette() {
	return isDarkMode() ? NEUTRAL_PALETTE.dark : NEUTRAL_PALETTE.light;
}

/** 監聽網站切換深色/淺色模式（<html class="dark"> 增減）。 */
export function observeTheme(onChange) {
	const observer = new MutationObserver(onChange);
	observer.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["class"],
	});
	return observer;
}
