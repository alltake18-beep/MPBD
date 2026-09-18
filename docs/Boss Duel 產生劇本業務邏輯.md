# Boss Duel 產生劇本業務邏輯

> 可執行程式：`server/boss-duel-story-generator.js`
>
> 程式版本：`boss-duel-story-generator-v1`
>
> 遊戲基準：`rules-v11`、`boss-plan-v12`、`arrange-v10`、`story-action-trace-v2`
> 正式產量：8 星 × 3 種結果分類 × 各 10,000 = **240,000 筆**

## 1. 工程師應直接使用程式，不要重寫規則

本文件只說明接法。下列邏輯已實作在 `server/boss-duel-story-generator.js`：

- 固定 seed 衍生與自然遊戲模擬。
- `story-player-policy-v1` 只依當下資訊建立互斥候選、固定排序並選定單一路線；不預看後續牌、Boss 手牌、骰面、分類或 RTP。
- 一般路線只保留共用理牌核心的 `coreCards`；暴擊／固傷綁定牌必須屬於效果路線核心，不得與不相容牌型核心混帶。
- 選中路線後鎖定確認牌；一般不得取消，只有完整六張形成皇家同花順、同花順或四條時強制改保留最高完成牌型。
- 起手等級決定固定換牌上限；停止後高牌 FOLD、一對以上 FIGHT，未擊殺且仍有回合就繼續，沒有 `STOP_LOSS`。
- `win`／`push`／`lose` 結果分類。
- 每星每種結果各 10,000 筆的配額收集。
- 多 worker 依 attempt 順序確定性入選。
- checkpoint 相容性、重複 seed、分類與配額驗證。
- 240,000 筆完整重播驗收。
- 與現行遊戲相容的 preset、summary、manifest 與原子發布。

工程端不可另寫第二套分類、AI 或換牌規則；必須直接呼叫這個模組及它所引用的現行核心。

## 2. 最重要的 Bet 原則

`win`、`push`、`lose` 是**結果分類**，不是 Bet 桶。

劇本不依 Bet 分池、不為不同 Bet 重複產生。每個 `star + seed` 只保存一份以 Bet 倍數 `X` 表示的劇本，通用任何正數 Bet：

```text
實際總花費 = story.spendX  × Bet
實際總派彩 = story.payoutX × Bet
實際淨值   = story.netX    × Bet
```

Bet 不得參與下列任何項目：

- seed 衍生
- BOSS、骰子、手牌、魔法卡或牌堆生成
- AI 保留牌與換牌決策
- `win`／`push`／`lose` 分類
- 240,000 筆配額

因此 Bet 1、Bet 2,000 或日後新增的 Bet 使用同一個 `star + seed` 時，手牌、魔法卡、換牌順序、戰鬥結果與 `returnX` 必須完全相同，只有實際點數按 Bet 等比例縮放。

個人劇本水池的三個 Bet 桶是**線上帳務分桶**，只負責把實際花費、派彩與補正記到對應帳；它不能切分、複製或重新生成劇本。

## 3. 程式引入

```js
const StoryGenerator = require("./server/boss-duel-story-generator.js");
```

模組會直接使用同一專案內的：

```text
src/core/boss-duel-random.js
src/core/boss-duel-rules.js
src/core/boss-duel-story-planner.js
src/core/boss-duel-natural-story-core.js
src/probability/boss-duel-action-tree-core.js
```

若版本不是正式基準，程式會以 `CORE_VERSION_MISMATCH` 失敗，不會混用舊規則繼續產生。

## 4. 產生正式 240,000 筆

### 程式呼叫

```js
const result = await StoryGenerator.buildRelease({
  outputRoot: "D:/boss-duel-story-output",
  releaseVersion: "boss-duel-story-20260831",
  workerCount: 12,
  onProgress(event) {
    logger.info(event);
  }
});
```

### 命令列

```bash
node server/boss-duel-story-generator.js \
  --output D:/boss-duel-story-output \
  --release boss-duel-story-20260831 \
  --workers 12
```

`--output` 與 `--release` 必填。正式入口不提供降低 10,000 配額或跳過全量重播的參數。

### 正式輸出

```text
<outputRoot>/
  current-release.json
  releases/
    boss-duel-story-20260831/
      data/story/
        boss-duel-story-preset-v1.js
        boss-duel-story-summary-preset-v1.js
        natural-story-diagnostics.json
      manifest.json
```

- `boss-duel-story-preset-v1.js`：遊戲使用的 240,000 seed 索引。
- `boss-duel-story-summary-preset-v1.js`：機率工具與驗收使用的摘要。
- `manifest.json`：版本、配額、簽章、全量重播結果及檔案 SHA-256。
- `current-release.json`：原子切換後的目前正式版本指標。

任一星級或結果分類不足、重播不同、簽章不同時，程式只保留 staging/checkpoint，不會切換正式版本。

## 5. 單筆劇本與任意 Bet

```js
const config = StoryGenerator.currentConfig();

const story = StoryGenerator.generateStory(
  config,
  5,          // BOSS 星級
  123456789,  // uint32 seed
  { includePath: true }
);

const settlement = StoryGenerator.materializeStoryForBet(story, 2000);
```

`settlement` 只包含等比例換算後的點數：

```js
{
  storyId,
  star,
  seed,
  classKey,
  bet,
  spendX,
  payoutX,
  netX,
  totalSpendCredits,
  totalPayoutCredits,
  netCredits,
  originalBossRewardCredits
}
```

`materializeStoryForBet()` 直接委派給 `src/core/boss-duel-natural-story-core.js` 的唯一 `story-bet-scaling-v1` 實作，不修改原劇本，也不重新發牌。若呼叫端需要限制投注清單，可選擇傳入：

```js
StoryGenerator.materializeStoryForBet(story, bet, {
  allowedBets: [1, 2, 5, 10, 20, 50, 100, 200, 500, 800, 1000, 1200, 1500, 1800, 2000]
});
```

未傳 `allowedBets` 時，任何大於 0 的有限 Bet 都可以套用，不需要重產劇本。

## 6. 數量與分類

每個星級固定有三個結果分類：

| 機器鍵 | 顯示名稱 | 分類公式 | 每星數量 |
|---|---|---|---:|
| `win` | 贏多 | `payoutX / spendX >= 5` | 10,000 |
| `push` | 贏 | `1 <= payoutX / spendX < 5` | 10,000 |
| `lose` | 輸 | `payoutX / spendX < 1` | 10,000 |

正式產線採「先產生、後分類、再補缺額」：候選先依該星完整自然規則實跑，結束後才依 5／1 邊界分類，不可先指定結果再造牌。每輪檢查 24 格數量；哪個星級仍有缺額，後續離線批次就只產該星（等同該批 BOSS 星級出現率 100%），並只保存仍不足分類的完整摘要。批次大小依目前實際命中率與剩餘缺額自動放大或縮小，直到該星贏多／贏／輸都各 10,000，再移到下一個缺額星級。這只改離線產生效率，不改遊戲內 BOSS 出現率、牌局規則或結果。

這三個分類只用來確保候選覆蓋與線上抽取，不是三個 Bet 池，也不是個人水池的三個帳務桶。

正式總量：

```text
8 星 × 3 種結果 × 10,000 = 240,000
```

分類使用倍率，所以同一劇本套用任何 Bet 後分類不變：

```text
(payoutX × Bet) / (spendX × Bet) = payoutX / spendX
```

## 7. 線上遊戲接法

1. 由正式 preset 的指定星級三種結果分類各抽候選 seed。
2. 依平台目前 RTP 設定對候選做機率配籤；出廠 96%，可調範圍固定為 80%～99%，目標 RTP 不參與離線劇本生成。
3. 選中後，以 `releaseVersion + star + seed` 鎖定 BOSS 劇本，並同時鎖定建立當下的 RTP、規則版、規劃器版與抑制參數簽章；後續平台改值、換日或換版不得影響本隻。
4. 前端選擇 Bet 後，用 `materializeStoryForBet()` 換算實際點數。
5. 後端逐步比對玩家操作與 `story.path`；相同操作必須換出相同牌。
6. 玩家操作不同時，記錄第一個偏離序號，再由版本化抑制規則判斷。若同回合／同和局序號／同換牌序號沒有劇本 REDRAW 紀錄，成功換牌保存 `plannedRecordMissing=true` 並直接算偏離；只有抽中「輸」分類劇本且成功 REDRAW 偏離時才啟動抑制，抽中贏多或贏劇本時只記偏離。劇本已結束後的合法換牌與和局重發仍照常執行。抑制是線上執行期契約，不參與 240,000 劇本生成或分類。
7. 第一次 START 成功時，把有號的劇本首次調整 `(payoutX × Bet) − (spendX × Bet × 鎖定 RTP)` 加入該 Bet 桶，並在同一原子交易把這次入場實付 × 鎖定 RTP 入桶。後續 CONTINUE 與付費換牌每次成功扣款都立即把本次實付 × 鎖定 RTP 入桶；免費與失敗扣款為 0，結算不得再補記押注差額。BOSS 更換費位於劇本之外，成功扣款時同樣按鎖定 RTP 另行入桶。
8. 第一次 START 時以 `encounterId` 在對應 Bet 桶預留本隻「原骰總倍數 × 鎖定 Bet」。暫停不結算、不補正、不釋放；切到其他 Boss 後仍可還原完整結果。
9. 擊殺 BOSS 時先釋放本隻預留，保留 Coin Bonus 等玩家已知的固定派彩，再扣除同桶其他進行中 Boss 的預留；只用剩餘可用水池決定最終 BOSS 骰獎。原 seed、原骰型、原骰數與劇本不得覆寫。
10. 最終 Boss 獎限制為原獎的 10%～1,000%（0.1～10 倍）；例如原獎 20x，只可在 2x～200x 且真實骰得出的結果中，選不超過可用額度的最大值。若連最小合法結果都付不起，仍派最小合法結果並讓負值留桶。
11. 免費換牌不扣款、不入個人劇本水池，但仍增加成功換牌次數與操作序號並推進費率階梯；若第一換免費，下一次付費換牌收第二階 2x。
12. 同一每日 240,000 筆發布目錄採放回抽樣；新 Boss 獨立抽候選，抽中的 seed 不移除，可被不同玩家或 Boss 重複抽中。目錄內 seed 仍必須唯一。

目前執行期抑制為 `deviation-suppression-v5-lose-story-only`：開卡時只有金幣卡公開數值，其餘傷害卡只公開種類；比牌時若沒有抑制就使用正常表後端隱藏值，若有抑制則完全不參照原值，暴擊、固傷與共用牌型傷害倍率各自改抽專用表。預設為暴擊 x1／x2／x3／x4／x5＝69%／25%／3%／2%／1%；固傷 +3／+4／+5／+6＝70%／25%／3%／2%；牌型傷害 x1／x2／x3＝80%／19%／1%。三表固定啟用，完整結果、百分比與簽章必須隨 Boss 鎖定並可重播。

產品已接受工程端可重跑測試中隨機操作玩家 RTP 約 2.3%。此數值不改變出廠 96% 與平台 80%～99% 的劇本配籤設定，也不代表任意偏離操作都會被個人劇本水池拉回目標 RTP。

### 7.1 個人三桶與多隻進行中 Boss

- 每位實際玩家持久保存 B1（Bet 1–10）、B2（20–200）、B3（500–2000）三桶；登出、換裝置、伺服器重啟不得重置。
- 帳面餘額與預留額分開保存；`Boss 骰獎可用額度 = 帳面餘額 − 固定派彩 − 同桶其他進行中預留總額`。
- `PAUSE` 只保存房間，不派彩、不補正、不釋放。`ABANDON`、回合用盡或擊殺才是終止；終止時才在交易內釋放預留。
- 第一次 START 的劇本首次調整與入場實付入池必須同一原子交易提交；其後每筆實付入池、劇本外 BOSS 更換費入池、派彩、預留、釋放、骰獎補正與桶餘額都必須隨各自事件原子提交。每個請求以冪等鍵去重。
- 最小貨幣單位為 0.0001 credit，持久層使用有號 64 位整數；每個事件只在落帳邊界四捨五入一次，0.5 遠離 0。
- 玩家永久流失時仍保留期末正負餘額於長期 RTP／流失模擬，不得因帳號不活躍而歸零。

### 7.2 換日、換版與滾動部署

- 新 Boss 只讀 `current-release` 指向的新版本；進行中 Boss 永遠按房間鎖定的舊 `releaseVersion`、RTP、抑制簽章與完整狀態續玩。
- 回滾後舊 Boss 仍必須可讀、可重播；服務節點必須依房間版本路由，不得拿目前程式版本交叉還原。
- Redis 只可作快取及版本指標。正式 seed、摘要、房間、操作紀錄、三桶帳本、預留與簽章必須放在版本化持久儲存；Redis 清空不得遺失資料。

### 7.3 跨語言重寫不得省略的精確契約

最安全的接法是直接呼叫本專案 JavaScript 核心。若工程環境必須重寫，以下全部是相容性條件，不是建議：

1. `hash32`、`mulberry32` 全程使用 uint32；乘法取低 32 位、右移為無號右移。`mulberry32` 每次先加 `0x6D2B79F5`，再依 `src/core/boss-duel-random.js` 的位元式運算，最後除以 `4294967296`。
2. 洗牌固定 Fisher–Yates，由尾到頭，每一步只取一次 PRNG；交換位置固定為 `floor(random × (index+1))`。發牌、魔法、效果綁定位、起手重抽、和局與骰獎的呼叫順序完全照現行核心。
3. 牌型排序先比 `rank`，再逐項比 `tiebreak`；骰獎依 `total → normalSum → multiplierSum`。完全相同保留先產生者，所有排序必須穩定。
4. 中性連續解：列出 `Σp=1、Σ(p×score)=0、p≥0` 與單純形邊界的全部端點，找最遠端點對，再把 `(1/3,1/3,1/3)` 正交投影到該線段；相同距離保持端點產生順序。
5. 1,000,000 整數籤：第一候選固定掃描連續解四捨五入值的 `-96..+96`；第二候選由分數方程求中心，再掃描 `-3..+3`；第三候選取餘數。先比較 RTP 絕對誤差，再比較與連續解的平方距離；仍相同保留先掃到者。任一候選 `<=0` 整組重抽。
6. 固定向量：`hash32(20260824,12345,7098)=553687176`；`mulberry32(0x12345678)` 前五個 uint32 為 `455919406,4042750857,4036713555,1004527575,3885174651`；7 星固定骰例必須為普通骰 `[1,3,4,5]`、倍數骰 `[2,2,5]`、總獎 `117`；三候選範例必須是 `95106／403725／501169` 籤。
7. 跨語言版本先通過固定向量，再對同一版本 240,000 筆全量對拍 seed、分類、摘要、操作路徑與跨檔 SHA-256；任何一筆不同，整版不得發布。

## 8. 可直接使用的主要方法

```js
StoryGenerator.currentConfig(overrides?)
StoryGenerator.createBuildProfile(config?, options?)
StoryGenerator.deriveSeed(config, star, attempt)
StoryGenerator.generateStory(config, star, seed, options?)
StoryGenerator.materializeStoryForBet(story, bet, options?)
StoryGenerator.buildStarClassCatalog(profile, star, options?)
StoryGenerator.buildPreset(profile, states, generatedAt?)
StoryGenerator.validatePreset(profile, preset, summaryPreset)
StoryGenerator.validateReplayBatch(config, entries)
StoryGenerator.validateAllReplays(profile, preset, summaryPreset, options?)
StoryGenerator.buildRelease(options)
```

正式發布應只呼叫 `buildRelease()`；它會自動完成 1～8 星、三種結果各 10,000、全量重播、檔案簽章與原子發布。

## 9. 固定失敗代碼

```text
CORE_VERSION_MISMATCH
INVALID_CONFIG
INVALID_FORMAL_QUOTA
INVALID_STAR
INVALID_ATTEMPT
INVALID_BET
INVALID_STORY_RESULT
INVALID_STORY_SUMMARY
INVALID_SCAN_RESULT
CHECKPOINT_INCOMPATIBLE
DUPLICATE_SEED_IN_STAR
QUOTA_NOT_MET
SIGNATURE_MISMATCH
REPLAY_MISMATCH
RELEASE_ALREADY_EXISTS
UNSAFE_OUTPUT_PATH
WORKER_FAILED
```

工程端應把這些錯誤視為建置失敗並告警，不可 catch 後改用小池、舊池或重複 seed 繼續發布。

## 10. 驗收

執行：

```bash
node tests/test-story-generator-service.js
```

測試已鎖定：

- 正式數量必須是 10,000／30,000／240,000。
- 現行三種結果分類與邊界。
- seed 衍生與現行完整重播摘要一致。
- 小型目錄由多 worker 正確收滿三種結果。
- 同一劇本套用不同 Bet 時，seed、分類與完整路徑不變。
- 日後新增正數 Bet 時，不需要重新產生劇本。

正式資料發布時，`buildRelease()` 還會對完整 240,000 筆逐筆重播，只有全部一致才會建立 `current-release.json`。
