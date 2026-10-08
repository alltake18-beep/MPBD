# Boss Duel

手機版 Boss Duel 網頁 Demo。

GitHub Pages 開啟根網址後會自動進入遊戲；建議使用直向手機瀏覽器遊玩。

## 入口

- 遊戲：`遊戲Demo.html`
- 後端文件：`後端文件.html`
- 理牌試玩：`理牌試玩.html`

機率工具是本機內部 QA 工具，其頁面與操作介面不追蹤、不發布到 GitHub Pages。

## 本機啟動與移交

本機需要可執行 `node` 的 Node.js 環境。雙擊 `tools/開啟機率工具.cmd`，啟動器會在背景啟動只監聽本機的服務，並開啟機率工具。也可在專案根目錄執行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\start-probability-tool.ps1
```

- [機率工具](http://127.0.0.1:4173/機率工具.html?v=action-tree-v69)
- [遊戲 Demo](http://127.0.0.1:4173/遊戲Demo.html?v=frontend-v110)

服務根目錄由啟動器所在位置決定，不能直接以 `file://` 開啟工具。若 4173 已由另一個資料夾的預覽服務占用，先確認並關閉該舊服務，再從這份專案啟動；啟動器不會自動關閉其他服務。

移到新專案或新電腦時，複製整個本機資料夾並保留子目錄與隱藏檔。Git 不含內部機率工具、Excel 剪貼簿模組、工具專用測試及本機啟動器，單獨 `git clone` 無法取代完整本機交付。啟動與移交清單見 [Boss Duel 交接](docs/Boss%20Duel%20交接.md#2-本機啟動與移轉)。

## 現行文件

- [劇本池數學模型](docs/Boss%20Duel%20劇本池數學模型.md)
- [劇本玩家規則](docs/Boss%20Duel%20劇本玩家規則.md)
- [產生劇本業務邏輯](docs/Boss%20Duel%20產生劇本業務邏輯.md)
- [專案交接](docs/Boss%20Duel%20交接.md)

正式後端產生入口：`server/boss-duel-story-generator.js`。它直接使用現行遊戲核心，固定產生 240,000 筆 Bet 無關的 X 倍數劇本，並完成 checkpoint、全量重播、簽章及原子發布。

v110 新增水池足額時的換牌支援、依平均花費限制 Bet、START 前免費隨機換王、血量分段星星與部分獎勵。金幣卡乘最終得分（最高 ×5，×1 碎掉），三條與順子魔法改為 ×1～×5。完整契約與驗證狀態見交接文件。

## 修改位置

| 要改的內容 | 主要位置 |
|---|---|
| 牌型、傷害、魔法卡與基礎規則 | `src/core/boss-duel-rules.js` |
| 自動理牌 | `src/core/boss-duel-poker-arrangement-core.js` |
| 劇本規劃、重播與分類 | `src/core/boss-duel-story-planner.js`、`src/core/boss-duel-natural-story-core.js`、`server/boss-duel-story-generator.js` |
| 遊戲 | `遊戲Demo.html`、`src/game/` |
| 共用模擬核心 | `src/probability/boss-duel-action-tree-core.js`；供正式產生與本機 QA 共用 |
| 對外工程規格 | `後端文件.html`、`docs/Boss Duel 產生劇本業務邏輯.md` |

`data/story/` 只放正式產生器輸出的 240,000 筆劇本索引與摘要，不可手動修改。Excel 僅使用 `tools/build-story-workbook-streaming.js` 產生。

## 驗證

```powershell
node tests/run-tests.js
```

此指令會執行目前工作目錄內的全部測試，包含 240,000 筆劇本數量、重播、三分類、跨 Bet、抑制、遊戲流程與公開頁面契約；本機若保留內部機率工具，會額外執行其專用測試。規則、共用核心、劇本資料、遊戲流程或跨頁契約變更應完整通過再發布；單純文案或連結調整只需執行直接受影響的檢查。

本儲存庫不包含本機測試報告、Excel 匯出與環境快取；本機啟動器及內部機率工具依 `.gitignore` 保留在本機。
