// 全專案共用的固定值。

// 遊戲首頁「行動」框裡的七顆按鈕，陣列順序同時也是預設的循環行動順序。
export const ACTION_NAMES = [
	"狩獵兔肉",
	"自主訓練",
	"外出野餐",
	"汁妹",
	"做善事",
	"坐下休息",
	"釣魚",
];

export const REWARD_NAME = "領取獎勵";

// 行動記錄原始文字的開頭兩個字（「行動成功！獲得了 xx 點經驗值。」）。
// 補行動名稱時就是把這兩個字換掉，後面的文字完全不動。
export const RAW_RECORD_PREFIX = "行動";

export const STORAGE_KEY = "saoDefragHelper_v3";

// actionId <-> 中文按鈕名稱的對照表存這裡。
// 這份對照是執行時自動學來的（見 action-api.js），跟使用者設定分開存，
// 才不會因為使用者按「還原預設順序」之類的操作被一起洗掉。
export const ACTION_ID_STORAGE_KEY = "saoDefragHelper_actionIds_v1";
