# Project State

更新日期：2026-10-08

## Current Goal

完成使用者核准的七項規則調整、重產正式資料與驗證，提交並推送 Git 後建立新聊天室交接。新 Session 從 README 與交接文件接續，不依賴對話歷史。

## Source of Truth

- `docs/Boss Duel 交接.md`：完整現行產品規格、版本、啟動移轉方式與驗證狀態。
- `README.md`：入口、檔案責任與執行指令。
- `AGENTS.md`：Repository 工作規則。
- 程式與測試是實作依據；本檔只保存接續工作所需狀態，不重複產品規格。

## Current Status

- 遊戲 `frontend-v110`；本機機率工具 `action-tree-v69`，UI 快取字串為 `action-tree-v69-excel1`；後端文件 `backend-doc-v23`。
- 劇本規劃器 `boss-plan-v13`／`story-player-policy-v1`；理牌 `arrange-v10`；抑制與支援 `deviation-suppression-v6-pool-assistance`。
- 正式資料已由 `buildRelease()` 完成並換入 Repository：`data/story/boss-duel-story-preset-v17.js` 與 `data/story/boss-duel-story-summary-preset-v11.js`，共 240,000 筆，8 星 × 3 分類 × 各 10,000；不分 Bet。發布識別為 `20261008-stage-multiplier-v17`。
- 七項調整已接上遊戲、共用核心與本機工具；正式全量重播及全部 13 組測試通過。規格以交接文件第 3～8 節為準。
- Bet 門檻已使用新版正式摘要每星 15,000 組、96% 配籤權重平均實付校準，八星資料均與正式摘要一致；數值及方法見交接第 8 節。
- 金幣多次取得暫採本隻最高倍率、上限 ×5；×1 碎掉但不覆蓋既有倍率。這是已告知的實作假設，使用者未另行選擇疊加規則。
- 內部機率工具、Excel 剪貼簿模組、專用測試與本機啟動器由 `.gitignore` 排除，移轉時仍必須隨完整本機資料夾保留。不能只以 Git clone 取代整份交付。
- 正式產生入口僅使用 `server/boss-duel-story-generator.js`；`data/story/` 不得手動修改。
- 專案內不保留復原 ZIP、QA 報告、Excel 匯出、快取或暫存。備份另存專案外。

## Local Entry Points

- 本機需可執行 `node` 的 Node.js，啟動與測試不需安裝 npm 套件。
- 雙擊 `tools/開啟機率工具.cmd`，或從根目錄執行 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\start-probability-tool.ps1`。
- 本機服務只監聽 `127.0.0.1:4173`，根目錄由啟動器所在位置決定；移轉後須確認健康端點回傳新資料夾。
- 遊戲入口 `遊戲Demo.html`；工具入口 `機率工具.html`；後端規格 `後端文件.html`。
- GitHub Pages 只發布遊戲與交付文件，不發布內部機率工具。Git 提交／推送僅在使用者要求時執行。

## Validation Status

2026-10-08 已完成：

- 正式產生時間 `2026-10-08T09:35:13.044Z`（台北 17:35:13），240,000 筆全量重播通過；索引、摘要及操作軌跡 SHA-256 見交接第 12 節。
- `node tests/run-tests.js` 全部 13 組通過，包含新版正式資料、階段獎與倍率、反向抑制、預留、免費預覽、Bet 門檻、逐筆帳務及派彩冪等。
- 桌面瀏覽器完成 4 星全擊殺派彩 8 credits；seed 3 未擊殺取得 1 星、派彩 2；seed 39 未擊殺取得 1 星且全局 ×4、派彩 12；已觀察 ×1 的 BROKEN 碎裂表演。
- 正常動態模式載入正式 v17；免費 REROLL 確認後由 8 星換成 4 星，玩家餘額仍為 10,000、BossTotalBet 為 0。本機工具完成劇本玩家 100 Boss 功能檢查，主控台錯誤 0，部分獎 54 次、平均解鎖 3.15 星；此短樣本不用作 RTP 結論。
- EXIT 結算已通過 VM 回歸，尚未做對應瀏覽器驗證。未做 Android／iOS 實體裝置驗證。
- Git 提交／推送及新聊天室交接由本輪主線收尾，應以實際 Git remote 與聊天室連結確認，不在此預填提交 SHA。

詳細狀態見交接文件第 12 節。

## Known Issues and Next Steps

1. Android 與 iOS 實體裝置驗證尚未完成；不得以桌面瀏覽器測試宣稱手機通過。
2. 百萬局 RTP、三桶水池尾額與各星補正容量仍待長期驗證。
3. 正式後端的版本化持久儲存、原子切換、回滾與失敗復原仍待整合。
4. 每日稀少分類產能與長期資源壓測仍待完成。
5. 起始牌堆 17／18 邊界已有案例與隨機回歸，尚無全組合窮舉證明。

靜態 Demo 尚未實作多 Boss／跨 Bet 可恢復房間；新挑戰前可調 Bet，START 後鎖定。正式後端 `PAUSE` 保存權利、不結算，不能以預覽換王取代；工程邊界以交接文件為準。
