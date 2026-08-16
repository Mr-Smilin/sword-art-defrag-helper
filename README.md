# 我桐經典服輔助工具

(sword-art-defrag-helper)

作用範圍： 經典服首頁、個人檔案頁（/profile/）
發布日期： 2026/08/15  
最後修改日期： 2026/08/17  
作者： smilin （微笑）

[油猴](https://greasyfork.org/zh-TW/scripts/591435-sword-art-%E7%B6%93%E5%85%B8%E6%9C%8D%E8%BC%94%E5%8A%A9%E5%B7%A5%E5%85%B7)  
[Github](https://github.com/Mr-Smilin/sword-art-defrag-helper)

當前版本： 1.5.0
更新說明： 新增挑戰安全模式（預設只顯示友好切磋）；修復經驗值相同時行動紀錄標註會錯亂的問題

<details> <summary>版本紀錄</summary>  
  <br>  
  
- 1.0.0： 初版上傳  
- 1.1.0： 修復初始化不載入的問題  
- 1.2.0： 修復css沒有跟隨主題調整的問題
- 1.3.0： 修復戰鬥紀錄會把多餘資訊吃掉的問題
- 1.4.0： 改用行動 API 的回應判斷成敗，修復行動記錄標錯與失敗行動仍會推進順序的問題
- 1.5.0： 新增挑戰安全模式（預設只顯示友好切磋）；修復經驗值相同時行動紀錄標註會錯亂的問題
  
</details>
  
<br>

目前實現

- [x] 行動記錄
- [x] 行動順序
- [x] 樓層獎勵可用時覆蓋行動
- [x] 挑戰安全模式（只顯示友好切磋）

<br>

## 功能說明

### 行動記錄

遊戲原本只顯示「行動成功！獲得了 xx 點經驗值。」，看不出是哪個行動。
腳本會把開頭的「行動」兩個字換成實際的行動名稱。

### 行動順序

可以自訂一個循環序列（例如「自主訓練 x2 → 外出野餐 x1」），啟用後只會顯示當前輪到的
那一顆按鈕並放大，點完設定的次數才換下一個，跑完整輪自動從頭循環。
**只有行動真的成功才會推進進度**，冷卻中被拒絕會停在原地。

### 樓層獎勵覆蓋

樓層獎勵可以領取時，在行動按鈕列上蓋一顆綠色大按鈕，不用移動滑鼠就能領。

### 挑戰安全模式

在 `/profile/` 頁面的「挑戰」卡片標題旁會多一個開關，**預設開啟**。
開啟時只留下「友好切磋」並把按鈕放大，其餘三個選項（認真對決 / 決一死戰 / 我要殺死你）
連同說明文字一起隱藏，避免誤點造成角色死亡。關掉開關就會全部顯示回來。

<br>

---

## 開發

實際發布使用的是根目錄的單一檔案 `sword-art-defrag-helper.js`（油猴 / GreasyFork 只吃單檔），
由 `src/` 底下的模組建置產生。

> UserScript 的 metadata（`@version`、`@match`⋯）來源是 `src/header.txt`，
> 改在建置產物上會被下一次建置覆蓋掉。`@version` 由建置腳本從 `package.json` 注入。

### 專案結構

依職責分層，相依方向由上往下（`core` 不依賴任何人，`ui` 依賴其他層）：

```
src/
  header.txt            UserScript metadata
  main.js               進入點，把各模組接起來

  core/                 基礎建設，完全不碰畫面
    bus.js              事件匯流排（解開狀態模組與 UI 模組的循環相依）
    constants.js        行動名稱、挑戰選項、localStorage key
    state.js            使用者設定與循環進度，含持久化

  game/                 與遊戲本身互動
    dom.js              定位遊戲原本的按鈕、標題、紀錄節點
    action-api.js       行動 API 的知識（網址、成功/失敗判定、actionId 對照）
    network.js          攔截 fetch / XMLHttpRequest，把行動成敗變成事件
    action-tracker.js   把「點了哪顆按鈕」跟「API 說成功沒」配對起來

  features/             各功能的邏輯
    records.js          行動記錄的對照表維護與名稱標註
    order.js            循環行動順序
    reward.js           樓層獎勵覆蓋按鈕
    challenge.js        挑戰安全模式

  ui/                   我們注入畫面的控制項
    theme.js            深色/淺色配色
    components.js       共用小元件
    order-panel.js      行動順序編輯面板
    reward-toggle.js    領取獎勵覆蓋開關
    challenge-toggle.js 挑戰安全模式開關

tests/                  結構對應 src/，另有整合測試與建置產物煙霧測試
build.mjs               用 esbuild 把 src/ 打包成單檔
```

### 常用指令

安裝相依套件：

```bash
npm install
```

跑測試：

```bash
npm test
```

建置（產出 `sword-art-defrag-helper.js`）：

```bash
npm run build
```

發布前一次跑完測試與建置：

```bash
npm run prepare-release
```

### 運作方式

行動成敗以遊戲自己的 API 回應為準，而不是靠畫面文字去猜：

```
點行動按鈕 ─┐
            ├─> action-tracker ─(成功)─> records  ─> 補上行動名稱
API 回應 ───┘                   └─(成功)─> state   ─> 推進循環順序
                                └─(失敗)─> 什麼都不做，順序停在原地
```

`actionId` 與中文按鈕名稱的對照會在第一次點到該行動時自動學起來並存進 localStorage，
所以不需要事先把七個行動的 id 都列出來。
