// 在「樓層獎勵」框裡掛上「領取獎勵覆蓋」開關。

import { getRewardHeading } from "../game/dom.js";
import { setRewardOverlay } from "../features/reward.js";
import { state } from "../core/state.js";
import { checkboxRow } from "./components.js";

export async function mountRewardToggle() {
	try {
		const heading = await getRewardHeading();
		const container = heading ? heading.parentElement : null;
		if (!container) {
			console.warn(
				"[SAO 輔助工具] 找不到「樓層獎勵」框，領取獎勵覆蓋開關未掛載。",
			);
			return null;
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
			setRewardOverlay,
		);
		wrap.appendChild(row);
		container.appendChild(wrap);
		return wrap;
	} catch (err) {
		console.warn("[SAO 輔助工具] 掛載領取獎勵覆蓋開關失敗：", err);
		return null;
	}
}
