# Project State

## Current Goal

讓 Boss Duel 收斂為單一現行實作、單一現行規格與清楚的檔案責任，使新 Session 不必重讀專案歷史也能正確接續。

## Current Status

- 現行遊戲：`frontend-v96`；機率工具：`action-tree-v36`；後端文件：`backend-doc-v9`。
- 現行規劃器：`boss-plan-v11`；理牌核心：`arrange-v10`；操作軌跡：`story-action-trace-v2`；抑制：`deviation-suppression-v4-configurable-tables`。
- 現行正式劇本：`natural-story-preset-v13`，共 240,000 筆，不分 Bet；24 格各 10,000 筆，已完成全量重播。
- Repository 專案工作規則在根目錄 `AGENTS.md`；完整產品規格維持於 `docs/Boss Duel 交接.md`。
- 本次版本已完成機率工具舊版操作／報表順序回復、新版數學欄位收斂、固定個人劇本水池與遊戲機制，以及跨頁版本同步。

## Active Decisions

- 每星各有贏多、贏少、輸 10,000 筆；這三類是結果分類，不是 Bet 水池。
- 每回合表演十種魔法卡候選，再揭示後端已鎖定的兩張結果；前端不得重新抽取。
- 前端表演調整不包含理牌、數學、劇本、抑制或水池邏輯修改。
- 個人劇本帳務使用三個持久 Bet 桶；劇本本身通用所有 Bet。
- REDRAW 後完整六張形成皇家同花順、同花順或四條時，強制改保留最高完成牌型；其他情況全部既有保留牌一律視為玩家確認，不得取消。
- 基礎核心四張且未帶暴擊／固傷時只補一張，優先同張暴擊＋固傷、暴擊、固傷；核心三張或兩張時最多補兩張缺少的暴擊／固傷牌。
- 免費換牌不扣款、不入池，但增加換牌次數、操作序號並推進費率階梯；第一換免費後，下一次付費收第二階 2x。
- 劇本無對應 REDRAW 時，合法換牌照常完成並保存 `plannedRecordMissing=true`；原劇本未擊殺才啟動抑制，已擊殺只記偏離。
- 產品接受隨機操作玩家 RTP 約 2.3%，也接受每日 240,000 筆發布目錄在營運時放回抽樣重用。
- 機率工具參數固定依玩家行為、模擬規格、退幣條件排列，故事產生置底；報表只保留新版數學模型可成立的欄位。
- 個人劇本水池與遊戲機制固定啟用；REROLL BOSS 固定收取當前 Bet × 1，並按目標 RTP 計入當下 Bet 桶。
- 詳細且具權威性的決策只維護在 `docs/Boss Duel 交接.md`，不在本文件重複。

## In Progress

- 無；本次版本已完成生成、驗證與發布準備。

## Next Steps

1. 以現行 Android 與 iOS 實體裝置驗證新發布版本。
2. 執行長期 RTP 與三桶水池模擬，包含各星補正能力及期末餘額。

## Important Files

- `docs/Boss Duel 交接.md`：現行產品規格與詳細驗證紀錄。
- `README.md`：檔案責任與驗證入口。
- `遊戲Demo.html`、`src/game/`：遊戲頁面與前端表演。
- `機率工具.html`、`src/probability/`：機率工具。
- `src/core/`：共用規則、理牌、規劃與劇本核心。
- `server/boss-duel-story-generator.js`：正式 240,000 筆劇本產生入口。
- `後端文件.html`：交付工程師的後端規格。

## Known Issues

- 尚未完成現行 Android 與 iOS 實體裝置流程驗證。
- 尚未驗證百萬局波動與長期三桶水池行為。
- 尚未整合版本化後端持久儲存、索引原子切換、回滾與失敗復原。
- 尚未壓測稀有分類每日產能與長期資源使用量。
- 尚未實作獨立的贏錢玩家提領模擬。
- 起手 17／18 不可達邊界已有固定與隨機回歸測試，但尚無窮舉證明。

## Validation Status

- `frontend-v96`／`action-tree-v36` 已執行 `node tests/run-tests.js`，全部 10 組通過，包含 `natural-story-preset-v13` 的 240,000 筆正式劇本全量重播；24 格各 10,000 筆。
- v13 發布簽章為 `4e1d19b9a655cb8f26c819d11ec949967e2d20e89226670beca85cd6bcc81e72`；preset SHA-256 為 `ae7fde63c0b6a4ddb2d176f4a3515ae2c180da8e3595adbf731e6a046c4c7ece`，summary SHA-256 為 `d15846f9029034abf20a24dbcabc4aab3b2d37a12b093f71d990f590603180cd`。
- 本機瀏覽器已驗證一般／Turbo 十選二魔法卡表演、公開／QA 資訊隔離、傷害與 HP 同步、360×640 無溢位，以及 1 星／8 星擊殺開獎流程；四個測試頁面主控台錯誤與警告皆為 0。
- 本機瀏覽器已驗證 `action-tree-v36` 的參數順序、8 個報表分頁、逐利玩家 1 人 × 1 隻 BOSS 三桶水池，以及非逐利玩家水池不適用提示；兩條路徑主控台錯誤與警告皆為 0。
- `arrange-v10` 的同花順／四條強制覆蓋、四張核心雙效果優先及兩張核心補暴擊／固傷定向測試已通過；`boss-plan-v11` 免費換牌階梯與 `suppression-v4` 缺少劇本操作定向測試已通過。
- Android 與 iOS 實體裝置驗證尚未完成。
