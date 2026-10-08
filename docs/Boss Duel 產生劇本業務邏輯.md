# Boss Duel 產生劇本業務邏輯

> 可執行程式：`server/boss-duel-story-generator.js`
>
> 程式版本：`boss-duel-story-generator-v3`
>
> 遊戲基準：`rules-v12`、`boss-plan-v13`、`arrange-v10`、`story-action-trace-v3-stage-assistance`
> 線上配籤：`full-class-uniform-score-ticket-win35-big3-v3`
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
- checkpoint 相容性、同星級重複 `star + seed`、分類與配額驗證。
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

因此 Bet 1、Bet 2,000 或日後新增的正數 Bet 使用同一個 `star + seed` 時，基準自然劇本的手牌、魔法、路徑、分類與 `returnX` 必須相同，只有自然實付與派彩等比例縮放。線上玩家的資產限制、操作偏離與各 Bet 桶水池歷史不同時，支援與最後骰補正可能不同；不得把基準 Bet 契約誤稱為所有實際玩家結果都同比不變。

個人劇本水池的三個 Bet 桶是**線上帳務分桶**，負責逐筆實付、預留、實際派彩、反向抑制支援額度與最後一顆星補正；它不能切分、複製或重新生成基準劇本。完整線上重播還需要同一有序操作、政策與帳務快照。

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
  releaseVersion: "boss-duel-story-20261008",
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
  --release boss-duel-story-20261008 \
  --workers 12
```

`--output` 與 `--release` 必填。正式入口不提供降低 10,000 配額或跳過全量重播的參數。

### 正式輸出

```text
<outputRoot>/
  current-release.json
  releases/
    boss-duel-story-20261008/
      data/story/
        boss-duel-story-preset-v17.js
        boss-duel-story-summary-preset-v11.js
        natural-story-diagnostics.json
      manifest.json
```

- `boss-duel-story-preset-v17.js`：遊戲使用的 240,000 seed 索引，檔名對應 `natural-story-preset-v17`。
- `boss-duel-story-summary-preset-v11.js`：機率工具與驗收使用的摘要，檔名對應 `natural-story-summary-preset-v11`。
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

1. 先隨機預覽Boss。第一次START前可免費REROLL，不扣款、不入池、不記首次調整或預留；仍是隨機抽王，不提供直接選擇。預覽更換另計 `previewRerolls`，不算正式Boss、分類或擊殺率分母。
2. 根據共用 `betLimitForAssets(credits,star)` 檢查新挑戰Bet：官方Bet×該星平均實付倍數不得超過可用資產，沒有可用Bet回0。成本表由新版目錄96%可行配籤加權量測，包含入場、續局及付費換牌，不參與產生器內容簽章；後續每筆費用仍須檢查餘額。
3. 該星贏多、贏、輸三個完整分類各均勻抽候選，按鎖定目標RTP分數配籤。目標預設96%、範圍80%～99%；遊戲1,000,000籤，贏多至少30,000、贏至少350,000、輸至少1。先裁切最低占比，再投影中性點；不可配時整組三筆重抽。
4. 以 `releaseVersion + star + seed` 鎖定基準劇本、Bet、RTP、規則／規劃／操作版本及完整支援抑制政策；後續換版不能改進行中Boss。可在預覽預先準備候選，但正式計數和帳務以成功START為界。
5. 第一次START在同一交易扣款、記 `A=(payoutX×Bet)−(spendX×Bet×q)` 及本次實付×q，q為鎖定RTP/100。CONTINUE／付費REDRAW每次成功後立即入池；免費及失敗扣款為0。結算不得補記押注差額。
6. 每Boss用encounterId預留 `Bet×當前M×(完整原骰獎+已取得牌型基礎獎)`，金幣或牌型獎增加時更新同一筆。額度判斷扣其他房間預留，當前完整義務只比較一次，不能重複加入A或重複扣當前預留。
7. 同一有序玩家操作照劇本原補牌。成功REDRAW保留集合偏離，或沒有對應換牌紀錄（`plannedRecordMissing=true`），才評估支援。資金足夠覆蓋完整當前義務時反向抑制：升級100%接受，同級／下降使用原抑制升級接受率；支援預設3組、至少2組、末組必收。候選沿用現行演算法，不能另造牌。
8. 水池不足時沿用輸劇本偏離抑制；贏多與贏不負向抑制。一般抑制升級預設50%、同級／下降100%、最多30組，工具可使用鎖定參數。支援不限原分類；本回合曾支援就不再負向抑制傷害，新回合清除標記。
9. s星Boss分s個等距HP門檻，`k=floor((初始HP−剩餘HP)×s/初始HP)`，限定0…s。按原骰前綴解鎖一般星再倍率星。使用共用 `Rules.bossStageProgress`、`Rules.rewardForUnlockedStars`，不得另寫階段或骰獎公式。
10. 金幣正常值為均勻1～5，當前全局倍率由 `Rules.combineCoinMultiplier(M,cardValue)` 取最高、最大5。×1無效果並碎掉；不連乘。三條、順子正常傷害倍率改為均勻1～5；其他牌型仍1～3。
11. 自然派彩 `Bet×(已解鎖Boss基礎獎+累積牌型基礎獎)×M`。未擊殺仍支付已解鎖部分；只在終止時派一次，不在每次解鎖重複加錢。PAUSE保存、不結算。
12. 擊殺時只能改最後一顆星骰面1～6，之前全部骰面保留；仍須在原完整骰獎0.1～10倍內。從扣除倍率後牌型獎及其他預留的額度中，選可負擔最大合法最後骰面。無可負擔結果時派最小合法獎，負值留桶。未擊殺前綴獎不補正。
13. 正式目錄採放回抽樣，新Boss抽中seed不移除；同星內seed唯一，raw seed可跨星重複。分類占比與成本平均必須用本版重新量測，不能把v16的配籤比例或舊隨機操作RTP當新版結論。

操作政策為 `deviation-suppression-v6-pool-assistance`。暴擊、固傷與牌型魔法正常值到傷害時揭露，金幣即時公開。負向傷害表保持：暴擊1～5權重69/25/3/2/1；固傷3～6權重70/25/3/2；所有牌型共用1～3權重80/19/1。支援回合使用正常值。保存政策快照、候選、資金門檻、接受亂數與傷害表結果，單靠seed不足以重播線上偏離。

摘要新增 `globalMultiplier`、`unlockedStars`、`unlockedBossRewardX`、`baseHandPayoutX`。`originalDice.total`仍是完整原骰獎，`originalBossRewardX`改為已取得的基礎前綴獎。報表拆分 `boss=B`、`hand=H`、`coin=(B+H)×(M−1)`，三欄相加為payoutX；不能先乘M再加coin一次。

### 7.1 三桶、房間與原子帳務

- 玩家持久保存B1（Bet1～10）、B2（20～200）、B3（500～2000），互不流用；登出、重啟、永久流失都不清掉正負尾額。
- `期末桶=期初桶+A+Σ逐筆實付入池−實際派彩`，免費REROLL費與入池永遠0。每筆事件落帳後的四捨五入值相加，不能以總實付一次捨入替代。
- 共用API：`commitStoryToBuckets`、`postStorySpendToBuckets`、`updateBossRewardReservation`、`assistanceBudgetForBoss`、`executeRuntimeRedraw`、`resolveRuntimeMagic`、`settleStartedStory`。
- `settleStartedStory`必須傳實際 `actualBossRewardX`（未乘M的前綴獎）、`actualGlobalMultiplier`、`actualUnlockedStars`、`actualDice`、`organicPayoutCredits`；另傳 `actualSpendTargetAccrualCredits` 為逐事件已入池合計，避免合算捨入造成報表差異。
- REROLL只允許未START，已START回 `BOSS_ALREADY_STARTED`。正式終止只有KILLED、BOSS_ESCAPED、USER_EXIT；預覽重抽不列其中。PAUSE保留版本、Bet、HP、牌堆與預留，不派彩；USER_EXIT支付已解鎖部分。Demo尚無完整多房間恢復，不可把其切Bet當正式PAUSE。
- 金額以0.0001 credit有號64位整數保存，事件邊界只捨入一次、0.5遠離0。扣款、首次調整、實付入池、預留更新、派彩、釋放均需原子化與冪等，不能重複派彩。
### 7.2 換日、換版與滾動部署

- 新 Boss 只讀 `current-release` 指向的新版本；進行中 Boss 永遠按房間鎖定的舊 `releaseVersion`、RTP、抑制簽章與完整狀態續玩。
- 回滾後舊 Boss 仍必須可讀、可重播；服務節點必須依房間版本路由，不得拿目前程式版本交叉還原。
- Redis 只可作快取及版本指標。正式 seed、摘要、房間、操作紀錄、三桶帳本、預留與簽章必須放在版本化持久儲存；Redis 清空不得遺失資料。

### 7.3 跨語言重寫不得省略的精確契約

最安全的接法是直接呼叫本專案 JavaScript 核心。若工程環境必須重寫，以下全部是相容性條件，不是建議：

1. `hash32`、`mulberry32` 全程使用 uint32；乘法取低 32 位、右移為無號右移。`mulberry32` 每次先加 `0x6D2B79F5`，再依 `src/core/boss-duel-random.js` 的位元式運算，最後除以 `4294967296`。
2. 洗牌固定 Fisher–Yates，由尾到頭，每一步只取一次 PRNG；交換位置固定為 `floor(random × (index+1))`。發牌、魔法、效果綁定位、起手重抽、和局與骰獎的呼叫順序完全照現行核心。
3. 牌型排序先比 `rank`，再逐項比 `tiebreak`；原骰分布依 `total → normalSum → multiplierSum`；線上補正只列舉最後骰面1～6並依total排序，已取得前綴不得變動。完全相同保留先產生者，所有排序必須穩定。
4. 下限連續解：列出 `Σp=1、Σ(p×score)=0、p≥0` 與單純形邊界的全部端點，找最遠端點對，再用 `p(win)≥0.03、p(push)≥0.35、p(lose)>0` 裁切線段。裁切後為空時，贏多／贏／輸三筆整組重抽；不得只替換其中一類。
5. 中性投影：把 `(1/3,1/3,1/3)` 正交投影到裁切後線段；相同距離保持端點產生順序。3% 與 35% 是最低占比，不是固定分類比例；輸沒有固定占比或上限。
6. 1,000,000 整數籤：第一候選固定掃描連續解四捨五入值的 `-96..+96`；第二候選由分數方程求中心，再掃描 `-3..+3`；第三候選取餘數。先比較 RTP 絕對誤差，再比較與連續解的平方距離；仍相同保留先掃到者。最終贏多不得少於 30,000、贏不得少於 350,000、輸不得少於 1，否則整組重抽。
7. 固定向量：`hash32(20260824,12345,7098)=553687176`；`mulberry32(0x12345678)` 前五個 uint32 為 `455919406,4042750857,4036713555,1004527575,3885174651`；7 星固定骰例必須為普通骰 `[1,3,4,5]`、倍數骰 `[2,2,5]`、總獎 `117`；三候選範例必須是 `95106／403725／501169` 籤。此例原中性解已符合兩個下限，所以籤數不變。
8. 跨語言版本先通過固定向量，再對同一版本 240,000 筆全量對拍 seed、分類、摘要、操作路徑與跨檔 SHA-256；任何一筆不同，整版不得發布。

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

工程端應把這些錯誤視為建置失敗並告警，不可 catch 後改用小池、舊池或同星級重複的 `star + seed` 繼續發布。

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
