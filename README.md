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

本儲存庫不包含本機測試報告、Excel 匯出、開發工具與環境快取。
