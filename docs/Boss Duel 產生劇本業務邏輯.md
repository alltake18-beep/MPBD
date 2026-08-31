# Boss Duel 產生劇本業務邏輯

> 可執行程式：`server/boss-duel-story-generator.js`
>
> 程式版本：`boss-duel-story-generator-v1`
>
> 遊戲基準：`rules-v10`、`boss-plan-v10`、`arrange-v9`、`story-action-trace-v1`
> 正式產量：8 星 × 3 種結果分類 × 各 10,000 = **240,000 筆**

## 1. 工程師應直接使用程式，不要重寫規則

本文件只說明接法。下列邏輯已實作在 `server/boss-duel-story-generator.js`：

- 固定 seed 衍生與自然遊戲模擬。
- 現行 AI 理牌、換牌、FIGHT／FOLD、止損與整隻 BOSS 路徑選擇。
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
| `win` | 贏多 | `payoutX / spendX >= 3` | 10,000 |
| `push` | 贏少 | `1 <= payoutX / spendX < 3` | 10,000 |
| `lose` | 輸 | `payoutX / spendX < 1` | 10,000 |

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
2. 依目前遊戲 RTP 設定對候選做機率配籤；目標 RTP 不參與離線劇本生成。
3. 選中後，以 `releaseVersion + star + seed` 鎖定 BOSS 劇本。
4. 前端選擇 Bet 後，用 `materializeStoryForBet()` 換算實際點數。
5. 後端逐步比對玩家操作與 `story.path`；相同操作必須換出相同牌。
6. 玩家操作不同時，記錄第一個偏離序號，再由版本化抑制規則判斷。抑制是線上執行期契約，不參與 240,000 劇本生成或分類。
7. 入場 Bet、換牌費、BOSS 更換費與劇本結果，按玩家該筆實際 Bet 對應到個人水池帳務桶。
8. 擊殺 BOSS 時才由個人水池與合法骰獎補正規則處理最終 BOSS 獎項；原 seed、原骰獎與原劇本不得覆寫。

目前執行期抑制為 `deviation-suppression-v2-separate-tables`：開卡時只有金幣卡公開數值，其餘傷害卡只公開種類；比牌時若沒有抑制就使用正常表後端隱藏值，若有抑制則暴擊、固傷與共用牌型傷害倍率各自改抽專用表。完整抑制參數與簽章必須隨 Boss 鎖定並可重播。

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
