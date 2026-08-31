# Boss Duel

手機版 Boss Duel 網頁 Demo。

GitHub Pages 開啟根網址後會自動進入遊戲；建議使用直向手機瀏覽器遊玩。

## 入口

- 遊戲：`遊戲Demo.html`
- 機率工具：`機率工具.html`
- 後端文件：`後端文件.html`
- 理牌試玩：`理牌試玩.html`

## 現行文件

- [故事池數學模型](docs/Boss%20Duel%20故事池數學模型.md)
- [產生劇本業務邏輯](docs/Boss%20Duel%20產生劇本業務邏輯.md)
- [專案交接](docs/Boss%20Duel%20交接.md)

正式後端產生入口：`server/boss-duel-story-generator.js`。它直接使用現行遊戲核心，固定產生 240,000 筆 Bet 無關的 X 倍數劇本，並完成 checkpoint、全量重播、簽章及原子發布。

## 修改位置

| 要改的內容 | 主要位置 |
|---|---|
| 牌型、傷害、魔法卡與基礎規則 | `src/core/boss-duel-rules.js` |
| 自動理牌 | `src/core/boss-duel-poker-arrangement-core.js` |
| 劇本規劃、重播與分類 | `src/core/boss-duel-story-planner.js`、`src/core/boss-duel-natural-story-core.js`、`server/boss-duel-story-generator.js` |
| 遊戲 | `遊戲Demo.html`、`src/game/` |
| 機率工具 | `機率工具.html`、`src/probability/` |
| 對外工程規格 | `後端文件.html`、`docs/Boss Duel 產生劇本業務邏輯.md` |

`data/story/` 只放正式產生器輸出的 240,000 筆劇本索引與摘要，不可手動修改。Excel 僅使用 `tools/build-story-workbook-streaming.js` 產生。

## 驗證

```powershell
node tests/run-tests.js
```

此指令會執行全部 10 組測試，包含 240,000 筆劇本數量、重播、三分類、跨 Bet、抑制、遊戲流程與公開頁面契約。改動規則、遊戲、機率工具或文件後，都應完整通過再發布。

本儲存庫不包含本機測試報告、Excel 匯出、開發工具與環境快取。
