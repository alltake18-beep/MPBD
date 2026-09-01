# Boss Duel Repository 工作規則

永遠遵循適用的個人全域 `AGENTS.md`。本文件只補充 Boss Duel 專案規則，不得弱化個人全域規則。

## 開始工作

- 實質任務開始時，先讀取 `.agents/state/PROJECT_STATE.md` 與 `docs/Boss Duel 交接.md`。
- Repository 是 Source of Truth。若 Project State 或文件與程式、測試衝突，先確認實作，再於授權範圍內修正過期狀態或文件。
- 修改前先由 `README.md` 找出負責該功能的檔案。

## 修改邊界

- 前端表演工作不得改動理牌、數學、劇本規劃、抑制、個人劇本水池或正式劇本資料，除非使用者明確要求相應行為改變。
- 理牌必須複用 `src/core/boss-duel-poker-arrangement-core.js`，不得在遊戲或工具建立第二套理牌實作。
- 劇本產生必須複用現行共用核心與 `server/boss-duel-story-generator.js`，不得建立第二套產生器、分類器、Bet 換算或配額邏輯。
- `data/story/` 是產生後的正式發布資料，不得手動修改。
- Repository 不保留本機 QA 報告、Excel 匯出、快取或暫存產物。

## 現行契約

- 正式劇本不分 Bet：8 星 × 3 結果分類 × 每類 10,000 筆，共 240,000 筆。
- Bet 只能縮放 `spendX` 與 `payoutX`；不得改變 seed、牌、魔法卡、AI 路徑、結果分類或劇本配額。
- 契約變更必須檢查直接受影響的遊戲、機率工具、後端文件、共用核心、測試與版本字串是否一致。
- 完整現行產品規格只維護在 `docs/Boss Duel 交接.md`，不要在本文件重複。

## 驗證

- 單純文案、連結或文件調整，執行直接受影響的最小充分檢查。
- 共用契約、遊戲流程、機率行為、核心規則、正式劇本資料或跨頁變更，執行 `node tests/run-tests.js`。
- 未在相關實體裝置完成驗證，不得宣稱已通過手機驗證。
