# Boss Duel

手機版 Boss Duel 網頁 Demo。

GitHub Pages 開啟根網址後會自動進入遊戲；建議使用直向手機瀏覽器遊玩。

## 入口

- 遊戲：`遊戲Demo.html`
- 機率工具：`機率工具.html`
- 後端文件：`後端文件.html`
- 理牌試玩：`理牌試玩.html`

## 現行文件

- [故事池數學模型](Boss%20Duel%20故事池數學模型.md)
- [產生劇本業務邏輯](Boss%20Duel%20產生劇本業務邏輯.md)
- [專案交接](Boss%20Duel%20交接.md)

正式後端產生入口：`boss-duel-story-generator.js`。它直接使用現行遊戲核心，固定產生 240,000 筆 Bet 無關的 X 倍數劇本，並完成 checkpoint、全量重播、簽章及原子發布。

## 修改位置

| 要改的內容 | 主要位置 |
|---|---|
| 牌型、傷害、魔法卡與基礎規則 | `boss-duel-rules.js` |
| 自動理牌 | `boss-duel-poker-arrangement-lab-core.js` |
| 劇本規劃、重播與分類 | `boss-duel-story-planner.js`、`boss-duel-natural-story-core.js`、`boss-duel-story-generator.js` |
| 遊戲 | `遊戲Demo.html`、`boss-duel-demo.js`、`boss-duel-demo.css` |
| 機率工具 | `機率工具.html`、`boss-duel-action-tree-core.js`、`boss-duel-action-tree-lab.js` |
| 對外工程規格 | `後端文件.html`、`Boss Duel 產生劇本業務邏輯.md` |

`boss-duel-story-preset-v1.js` 與 `boss-duel-story-summary-preset-v1.js` 是正式產生器輸出的資料，不可手動修改。Excel 僅使用 `tools/build-story-workbook-streaming.js` 產生。

## 驗證

```powershell
node tools/run-tests.js
```

此指令會執行全部 10 組測試，包含 240,000 筆劇本數量、重播、三分類、跨 Bet、抑制、遊戲流程與公開頁面契約。改動規則、遊戲、機率工具或文件後，都應完整通過再發布。

本儲存庫不包含本機測試報告、Excel 匯出、開發工具與環境快取。
