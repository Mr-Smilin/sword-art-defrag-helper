# 我桐經典服輔助工具

(sword-art-defrag-helper)

作用範圍： 經典服首頁
發布日期： 2026/08/15  
最後修改日期： 2026/08/17  
作者： smilin （微笑）

[油猴](https://greasyfork.org/zh-TW/scripts/591435-sword-art-%E7%B6%93%E5%85%B8%E6%9C%8D%E8%BC%94%E5%8A%A9%E5%B7%A5%E5%85%B7)  
[Github](https://github.com/Mr-Smilin/sword-art-defrag-helper)

當前版本： 1.4.0
更新說明： 改用行動 API 的回應判斷成敗，修復行動記錄標錯與失敗行動仍會推進順序的問題

<details> <summary>版本紀錄</summary>  
  <br>  
  
- 1.0.0： 初版上傳  
- 1.1.0： 修復初始化不載入的問題  
- 1.2.0： 修復css沒有跟隨主題調整的問題
- 1.3.0： 修復戰鬥紀錄會把多餘資訊吃掉的問題
- 1.4.0： 改用行動 API 的回應判斷成敗，修復行動記錄標錯與失敗行動仍會推進順序的問題
  
</details>
  
<br>

目前實現

- [x] 行動記錄
- [x] 行動順序
- [x] 樓層獎勵可用時覆蓋行動

<br>

---

## 開發

實際發布使用的是根目錄的單一檔案 `sword-art-defrag-helper.js`（油猴 / GreasyFork 只吃單檔）。

### 專案結構

```
src/
  header.txt          UserScript metadata（@version 會由建置腳本從 package.json 注入）
  main.js             進入點，把各模組接起來
  constants.js        行動名稱、localStorage key 等固定值
  bus.js              極簡事件匯流排（解開狀態模組與 UI 模組的循環相依）
  state.js            使用者設定與循環進度，含 localStorage 持久化
  dom.js              定位遊戲原本的按鈕與標題節點
  action-api.js       行動 API 的知識（網址、成功/失敗判定、actionId 對照）
  network.js          攔截 fetch / XMLHttpRequest，把行動成敗變成事件
  action-tracker.js   把「點了哪顆按鈕」跟「API 說成功沒」配對起來
  records.js          行動記錄的對照表維護與名稱標註
  order.js            循環行動順序的狀態與按鈕顯示控制
  reward.js           樓層獎勵覆蓋按鈕
  theme.js            深色/淺色配色
  ui/
    components.js     共用小元件
    order-panel.js    行動順序編輯面板
    reward-toggle.js  領取獎勵覆蓋開關
tests/                對應 src/ 各模組的測試（含端對端整合測試）
build.mjs             用 esbuild 把 src/ 打包成單檔
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
