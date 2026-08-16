// 建置腳本：把 src/ 底下拆分的模組打包回單一檔案 sword-art-defrag-helper.js
//
// 為什麼要有這一層：
//   Tampermonkey / GreasyFork 實際載入的是「單一個 .js 檔」，不能用 ESM import。
//   但單檔 800 行對維護很不友善，所以開發時拆成 src/*.js（標準 ESM、可單元測試），
//   發布前用 esbuild 打包成 IIFE，再把 UserScript metadata block 接在最前面。
//
// 注意：metadata block 必須是輸出檔的第一行，管理器才認得，所以一定要用 banner 的方式
//       貼在 esbuild 產物之前，不能交給 esbuild 當成一般註解處理（會被移到別的位置）。
//
// @version 從 package.json 讀取，header.txt 裡寫 {{VERSION}} 佔位，避免兩邊版本號不同步。

import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = path.join(rootDir, "sword-art-defrag-helper.js");

async function main() {
	const pkg = JSON.parse(
		await readFile(path.join(rootDir, "package.json"), "utf8"),
	);

	const headerTemplate = await readFile(
		path.join(rootDir, "src", "header.txt"),
		"utf8",
	);
	const header = headerTemplate.replace("{{VERSION}}", pkg.version);

	if (headerTemplate === header) {
		throw new Error("src/header.txt 找不到 {{VERSION}} 佔位符，版本號不會被注入。");
	}

	const result = await build({
		entryPoints: [path.join(rootDir, "src", "main.js")],
		bundle: true,
		format: "iife", // 包成 (() => { ... })();，避免污染全域
		target: "es2020",
		charset: "utf8", // 保留中文，不要被轉成 \uXXXX
		legalComments: "none",
		minify: false, // 這是要公開發布給人看的腳本，保持可讀
		write: false,
	});

	const bundled = result.outputFiles[0].text;
	await writeFile(OUTPUT_FILE, `${header}\n${bundled}`, "utf8");

	const lines = bundled.split("\n").length;
	console.log(`已輸出 ${path.relative(rootDir, OUTPUT_FILE)}（${lines} 行，v${pkg.version}）`);
}

main().catch((err) => {
	console.error("建置失敗：", err);
	process.exitCode = 1;
});
