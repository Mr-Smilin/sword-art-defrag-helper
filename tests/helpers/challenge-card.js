// 依照 /profile/ 頁面實際的 DOM 結構建出「挑戰」卡片。
//
// 只保留會影響定位邏輯的骨架（data-slot、h2 標題、每個選項一個 <article>
// 裝一顆按鈕加一段描述），Tailwind 的 class 一長串對測試沒有意義就省略了 ——
// 定位本來就是靠文字內容而不是靠 class。

const CHALLENGE_OPTIONS = [
	["友好切磋", "最安全的訓練方式，但仍有極低機率發生意外導致角色死亡。"],
	["認真對決", "能獲取較多的經驗值，但發生死亡意外的機率也較高。"],
	["決一死戰", "能取得非常多經驗值，但有高機率會造成其中一方死亡。"],
	[
		"我要殺死你",
		"完全以殺死對方為目的，能獲取大量經驗值，且有極高機率會有一方死亡。",
	],
];

export function renderChallengeCard(container = document.body) {
	const card = document.createElement("div");
	card.setAttribute("data-slot", "card");

	const header = document.createElement("div");
	header.setAttribute("data-slot", "card-header");
	const heading = document.createElement("h2");
	heading.textContent = "挑戰";
	header.appendChild(heading);
	card.appendChild(header);

	const content = document.createElement("div");
	content.setAttribute("data-slot", "card-content");

	// 喊話輸入框（實際頁面上有，用來確認我們不會誤動到它）
	const shoutLabel = document.createElement("label");
	shoutLabel.textContent = "喊話：你的對手可以在戰報中看到你的喊話（非必填）";
	const shoutInput = document.createElement("input");
	shoutInput.setAttribute("data-slot", "input");
	shoutLabel.appendChild(shoutInput);
	content.appendChild(shoutLabel);

	content.appendChild(document.createElement("div")); // 實際頁面上的空 div

	const list = document.createElement("div");
	CHALLENGE_OPTIONS.forEach(([name, description]) => {
		const article = document.createElement("article");
		// 實際頁面是「按鈕 9rem ｜ 描述」兩欄，而且是用 Tailwind class 設定的（不是 inline style）。
		// 這一點會影響測試預期：我們關閉安全模式時是把 inline 覆蓋移掉、讓網站的 class 接手，
		// 所以還原後 inline 的 gridTemplateColumns 應該是空字串。
		article.className = "grid items-center gap-3 py-4 sm:grid-cols-[9rem_1fr]";

		const button = document.createElement("button");
		button.type = "button";
		button.setAttribute("data-slot", "button");
		button.textContent = name;

		const p = document.createElement("p");
		p.textContent = description;

		article.appendChild(button);
		article.appendChild(p);
		list.appendChild(article);
	});
	content.appendChild(list);
	card.appendChild(content);

	container.appendChild(card);
	return { card, header, heading, list };
}

/** 模擬 React 重繪：把我們加上去的 inline style 與節點清掉，內容重建一次。 */
export function redrawChallengeCard(container = document.body) {
	container.innerHTML = "";
	return renderChallengeCard(container);
}

/** 目前實際看得到的挑戰選項名稱。 */
export function visibleChallengeNames() {
	return Array.from(document.querySelectorAll("article"))
		.filter((a) => a.style.display !== "none")
		.map((a) => a.querySelector("button")?.textContent.trim())
		.filter(Boolean);
}

/** 目前實際看得到的描述文字。 */
export function visibleChallengeDescriptions() {
	return Array.from(document.querySelectorAll("article"))
		.filter((a) => a.style.display !== "none")
		.map((a) => a.querySelector("p")?.textContent.trim())
		.filter(Boolean);
}
