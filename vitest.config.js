import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// 大部分模組都要操作 DOM（查按鈕、改紀錄文字、掛控制項），所以預設就跑在 jsdom 上。
		environment: "jsdom",
		setupFiles: ["./tests/setup.js"],
		include: ["tests/**/*.test.js"],
		restoreMocks: true,
	},
});
