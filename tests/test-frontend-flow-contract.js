"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "遊戲Demo.html"), "utf8");
const css = fs.readFileSync(path.join(root, "src", "game", "boss-duel-demo.css"), "utf8");
const js = fs.readFileSync(path.join(root, "src", "game", "boss-duel-demo.js"), "utf8");
const toolHtml = fs.readFileSync(path.join(root, "機率工具.html"), "utf8");
const DiceCore = require(path.join(root, "src", "core", "boss-duel-random.js"));
const Rules = require(path.join(root, "src", "core", "boss-duel-rules.js"));
const cssForBalance = css.replace(/\/\*[\s\S]*?\*\//g, "");
let cssBraceDepth = 0;
let cssMinimumDepth = 0;
for (const character of cssForBalance) {
  if (character === "{") cssBraceDepth += 1;
  if (character === "}") cssBraceDepth -= 1;
  cssMinimumDepth = Math.min(cssMinimumDepth, cssBraceDepth);
}
assert.equal(cssBraceDepth, 0, "Demo CSS has an unmatched block brace");
assert.equal(cssMinimumDepth, 0, "Demo CSS closes a block before it is opened");
assert(!html.includes("boss-duel-five-route.js") && !js.includes("BossDuelFiveRoute") && !js.includes("RouteCore"), "formal game must not load or fall back to the removed five-route model");
assert(js.includes('if (!NaturalCore || !StoryPreset?.natural) throw new Error("正式故事池載入失敗")'), "missing formal story data must fail closed instead of switching models");
const shellRule = css.match(/\.game-shell\s*\{([^}]*)\}/)?.[1] || "";
const shellWidth = Number(shellRule.match(/width:\s*(\d+)px/)?.[1]);
const shellHeight = Number(shellRule.match(/height:\s*(\d+)px/)?.[1]);
assert(Math.abs(shellWidth / shellHeight - 1080 / 1920) < 0.002, "Demo viewport must preserve the original 1080x1920 portrait ratio");
assert(js.includes(`usableWidth / ${shellWidth}`) && js.includes(`usableHeight / ${shellHeight}`), "viewport fitting must use the safe visual viewport and the same portrait dimensions as the game shell");
assert(html.includes("minimum-scale=1") && html.includes("maximum-scale=1") && html.includes("user-scalable=no") && html.includes("viewport-fit=cover"), "mobile viewport must prevent browser zoom while supporting iPhone safe areas");
assert(css.includes("touch-action: none") && css.includes("overscroll-behavior: none") && css.includes("-webkit-touch-callout: none"), "fixed game surface must disable double-tap/pinch page gestures and iOS callouts");
assert(js.includes("window.visualViewport") && js.includes("--safe-area-top") && js.includes("--safe-area-bottom") && js.includes('visualViewport?.addEventListener("resize"'), "mobile fitting must follow Safari visual viewport and safe-area changes");

const requiredIds = [
  "bossStars",
  "compareFx",
  "comparePlayerHand",
  "compareBossHand",
  "comparePlayerCards",
  "compareBossCards",
  "bossHandSpineStage",
  "magicPreview",
  "magicPreviewCard",
  "magicDrawFan",
  "bossSpeech",
  "roundWarningFx",
  "combatFx",
  "combatFxCards",
  "combatImpactLabel",
  "bossDefeatFx",
  "rewardPanel",
  "rewardDice",
  "rewardEquation",
  "rewardContinue"
];

for (const id of requiredIds) {
  assert(html.includes(`id="${id}"`), `missing frontend flow node #${id}`);
}

for (const id of ["magicReveal", "magicPreview", "compareFx", "combatFx", "bossDefeatFx", "roundStartFx", "roundWarningFx", "bossSpeech", "rerollConfirm", "tutorialOverlay", "settingsSheet", "rewardPanel"]) {
  assert(new RegExp(`id="${id}"[^>]*\\shidden(?:\\s|>)`).test(html), `first paint must keep #${id} hidden`);
}

for (const functionName of [
  "beginEntryStarReveal",
  "settleFight",
  "showCombatResolution",
  "runCombatRandomNumbers",
  "beginAttackPlayback",
  "beginBossDefeat",
  "beginPrizeReveal",
  "revealPrizeDie",
  "finishPrizeTotal",
  "settlePrizePayout"
]) {
  assert(js.includes(`function ${functionName}(`) || js.includes(`async function ${functionName}(`), `missing flow function ${functionName}`);
}

for (const phase of ["entry-promise", "compare-reveal", "compare-result", "tie-result", "effect-charge", "attack-exit", "attack", "damage", "post-hit", "boss-defeat", "prize-reveal", "resolved-win"]) {
  assert(js.includes(`"${phase}"`), `missing flow phase ${phase}`);
}

for (const animation of ["13_showdown", "17_damage", "31_lose_begin", "32_lose_loop", "41_draw_begin", "42_draw_loop", "16_end"]) {
  assert(js.includes(`"${animation}"`), `missing Boss animation ${animation}`);
}

const finishRoundBody = js.match(/function finishRound\([^]*?\n  }\n\n  function beginBossVictoryDialogue/)?.[0] || "";
assert(finishRoundBody, "cannot locate finishRound body");
assert(!finishRoundBody.includes("presentation = null"), "result page must retain the resolved hand");
assert(!finishRoundBody.includes("bossRevealed = false"), "result page must retain revealed Boss cards");
assert(!finishRoundBody.includes("totalBetX = 0"), "round completion must preserve the encounter Total Bet");
const dealRoundBody = js.match(/function dealRound\(\)[^]*?\n  }\n\n  function beginEntryStarReveal/)?.[0] || "";
const continueRoundBody = js.match(/function continueRound\(\)[^]*?\n  }\n\n  function beginBossDefeat/)?.[0] || "";
assert(dealRoundBody.includes("totalBetX += runtimeConfig.entryCostX"), "first round entry fee must enter the Boss encounter Total Bet");
assert(continueRoundBody.includes("totalBetX += runtimeConfig.entryCostX") && !continueRoundBody.includes("totalBetX = runtimeConfig.entryCostX"), "CONTINUE must accumulate the next round entry fee on the same Boss encounter");
assert(!js.includes('const displayedTotalBet = encounter.phase === "round-result" ? 0 : totalBet') && js.includes("els.betValue.textContent = totalBet"), "every phase must display the same-Boss accumulated TOTAL BET without a round-result reset");
assert(html.includes('id="coinBonusPanel"') && html.includes('id="coinBonusValue"') && css.includes(".coin-bonus-panel") && js.includes("revealedCoinBonusX") && js.includes('if (card.key === "coin") encounter.revealedCoinBonusX +=') && js.includes("encounter.revealedCoinBonusX = bankedCoinBonusX"), "drawn coin cards must reveal and retain a cumulative same-Boss bonus panel without replacing the next round magic slots");

const payoutWrites = [...js.matchAll(/session\.credits \+=/g)];
assert.strictEqual(payoutWrites.length, 1, "credits may only be awarded once in the frontend flow");
const payoutFunctionIndex = js.indexOf("function settlePrizePayout(");
assert(payoutFunctionIndex >= 0 && payoutWrites[0].index > payoutFunctionIndex, "credits must be awarded by settlePrizePayout");
assert(js.includes("if (!encounter || encounter.payoutSettled) return;"), "payout requires a duplicate-settlement guard");
assert(js.includes('!["resolved-win", "resolved-loss"].includes(encounter.phase)'), "NEXT BOSS requires a resolved-state guard");
assert(js.includes("|| els.rerollConfirm.hidden) return;"), "REROLL confirmation requires a duplicate-click guard");
assert((js.match(/encounter\.phase !== "hand" \|\| encounter\.handEntering/g) || []).length >= 3, "deal-in animation must lock draw, compare, and card selection");

for (const selector of [".compare-fx", ".combat-projectile", ".combat-impact", ".combat-fx.attack-finisher", ".boss-defeat-fx", ".die.rolling", ".die.revealed", ".reward-dice.stage-all", ".compare-card-shard"]) {
  assert(css.includes(selector), `missing presentation selector ${selector}`);
}

assert(css.includes("assets/mobile/original-card-open-2.png"), "magic reveal must use the original card frame");
assert(js.includes("magic-bind-copy"), "bound magic must identify its target hand card");
assert(js.includes('coinBanked ? "BANKED"') && js.includes('freeUsed ? "USED"'), "coin and free-redraw magic require explicit status semantics");
assert(js.includes("normal-dice-group") && js.includes("multiplier-dice-group"), "normal and multiplier dice must be separate visual groups");
assert(css.includes("assets/mobile/treasure-static/chest-1-2.png") && css.includes("assets/mobile/treasure-static/chest-7-8.png"), "treasure fallback must use the supplied open-chest art for every star tier");
assert(js.includes("activeTreasureSpine.scale.set(0.65)"), "treasure Spine must retain the full HUD-scale chest size");
assert(js.includes("activeTreasureEncounterId === encounterId") && js.includes("showTreasureSkin(bossSpineEncounterId, packet.star, treasureMaximum, encounter.treasureMaximumRevealed)"), "treasure state must reset for every Boss and receive the currently public maximum");
assert(js.includes("function treasureSkinForStar(star)") && js.includes("normalizedStar <= 3") && js.includes("normalizedStar <= 5") && js.includes("normalizedStar <= 7"), "treasure skins must match the original 1–3 / 4–5 / 6–7 / 8 star table");
assert(js.includes("function treasureSkinForMaximum(maximum)") && js.includes("Math.max(baseSkinNumber, treasureSkinForMaximum(maximum))"), "revealed maximum must upgrade the treasure skin without dropping below the Boss base tier");
assert(js.includes("function maximumRewardForDice(dice)") && js.includes("normalDice * 6 * (multiplierDice > 0 ? multiplierDice * 6 : 1)"), "WIN UP TO must use the locked normal-sum × multiplier-sum maximum formula");
assert(css.includes(".treasure-plaque-value") && js.includes("WIN_GLYPH_PATHS[character]") && js.includes("TREASURE_TITLE_PATH"), "WIN UP TO must retain supplied title and number glyph art while allowing its locked maximum to change");
assert(js.includes('findSlot("cloth")') && js.includes("embeddedMaximumCloth.attachment = null") && js.includes("embeddedMaximumCloth.color.a = 0"), "the Spine-embedded treasure maximum must stay hidden beneath the dedicated Boss plaque");
assert(css.includes('.chest[data-tier="1"] { background-image: url("../../assets/mobile/treasure-static/chest-1-2.png")') && css.includes('.chest[data-tier="4"] { background-image: url("../../assets/mobile/treasure-static/chest-7-8.png")') && !css.includes(".chest.spine-ready { background: none; }"), "the supplied static chest must remain visible when the optional Spine layer is ready");
assert(/\.hp-track\s*\{[^}]*top:\s*25px;[^}]*left:\s*0;[^}]*right:\s*0;[^}]*width:\s*200px;[^}]*height:\s*19px;/.test(css) && /\.boss-star-slot\s*\{[^}]*width:\s*24px;[^}]*height:\s*23px;/.test(css) && css.includes(".hp-readout span { display: none; }"), "Boss HP frame must be exactly 200x19 and eight-star HUD proportions must remain centered");
assert(/\.help-button,\.turbo-button\s*\{[^}]*width:\s*43px;[^}]*height:\s*43px;/.test(css) && /\.help-button\s*\{[^}]*transform:\s*none;/.test(css) && /\.turbo-button\s*\{[^}]*top:\s*213px;[^}]*transform:\s*rotate\(-90deg\)/.test(css), "left tutorial and turbo side tabs must respect their different atlas rotation metadata");
assert(css.includes(".phase-boss-defeat .chest") && css.includes("treasure-defeat-burst") && css.includes(".phase-prize-reveal .chest") && css.includes("treasure-reward-idle"), "the supplied static chest needs visible defeat and reward presentation after the unreliable Spine overlay is suppressed");
assert(!html.includes('class="win-up-to-art"') && html.includes('id="winUpTo" class="sr-only"') && js.includes('class="treasure-plaque-art"') && js.includes('els.winUpTo.textContent = `${treasureMaximum}X`') && !js.includes('"?X"') && !css.includes("maximum-unknown"), "treasure must always show a numeric supplied-art plaque and never expose ?X");
const preBetTreasureMaximums = [6, 12, 18, 24, 30, 36, 216, 432];
assert.deepEqual(preBetTreasureMaximums, [6, 12, 18, 24, 30, 36, 216, 432], "pre-Bet WIN UP TO must match original TreasureMaxMulMap[level][0], including guaranteed multiplier tiers 7 and 8");
assert(js.includes("TREASURE_PRESENTATION_BY_STAR") && js.includes("function treasurePresentationForStar(star)") && js.includes("treasureMaximumRevealed"), "pre-Bet Boss baselines and the post-conversion locked maximum need separate explicit states");
assert(js.includes("els.tutorialWinUpTo.textContent = `WIN UP TO ${treasureMaximum}X`") && js.includes("els.tutorialBossName.textContent = bossSkin.name"), "tutorial preview must not retain a stale Boss or maximum");
assert(js.includes("syncBossSpineToEncounter(encounterId)") && js.includes("syncTreasureSpineToEncounter(encounterId)"), "late-loading Boss and treasure Spine assets must catch up to the active presentation phase");
assert(js.includes('encounter.phase === "entry-promise"') && js.includes('playBossSequence("15_begin", "14_idle_nocard")') && js.includes('encounter.phase === "ready"'), "Boss entry must use 15_begin while the untouched first frame stays in no-card idle");
assert(!html.includes("BOSS BOUNTY LOCKED") && !css.includes(".entry-dice-board"), "entry conversion must not use the invented purple information card");
assert(js.includes('assets/mobile/ui-supplied/star.png') && js.includes('assets/mobile/ui-supplied/star-rainbow.png'), "entry conversion must use the supplied normal and premium star art");
assert(js.includes('class="boss-star-slot') && css.includes("boss-star-rainbow-in") && css.includes("boss-star-yellow-out"), "entry conversion must transform stars directly under the Boss HP bar");
assert(js.includes("GUARANTEED_PREMIUM_DICE") && js.includes("const guaranteedPremiumDice = guaranteedPremiumDiceForStar(packet.star)") && js.includes('" guaranteed-premium"') && js.includes('" revealed-premium"'), "seven/eight-star Bosses must show one/two guaranteed multiplier stars before Bet and animate only extra multiplier stars after Bet");
assert(css.includes(".boss-star-slot.revealed-premium .yellow-star") && !css.includes(".boss-star-slot.premium .yellow-star { animation"), "guaranteed multiplier stars must not replay the paid extra-premium conversion animation");
const entryStarSource = /function beginEntryStarReveal\(\) \{([\s\S]*?)\n  \}/.exec(js)?.[1] || "";
assert(entryStarSource.includes("const dice = encounter.packet.dice") && entryStarSource.includes("dice.multiplierDice"), "entry star reveal must use only the locked dice composition and never rolled faces");
assert(!entryStarSource.includes("normalFaces") && !entryStarSource.includes("multiplierFaces"), "START must never read or reveal locked dice faces before the Boss dies");
assert(entryStarSource.includes("entryStarsAnimating = firstReveal") && entryStarSource.includes("entryCompositionShown = true"), "the Boss HUD star conversion may play only once per Boss encounter");
assert(entryStarSource.includes("entryMaximumTimer") && entryStarSource.includes("presentation.maximumRevealAt") && entryStarSource.includes("treasureMaximumRevealed = true"), "WIN UP TO may switch to the locked maximum only when the HUD star conversion has completed");
assert(!html.includes('id="entryDiceFx"') && !css.includes(".entry-dice-fx") && !js.includes("playEntryDiceSpines"), "START must not create a D6 overlay; dice belong only to the kill-reward flow");
assert(js.includes("function renderReward()") && js.includes('class="die covered"') && js.indexOf("function renderReward()") < js.indexOf('class="die covered"'), "D6 buttons must be created only by the kill-reward renderer");
const dealRoundSource = /function dealRound\(\) \{([\s\S]*?)\n  \}/.exec(js)?.[1] || "";
assert(dealRoundSource.indexOf("spend(runtimeConfig.entryCostX)") < dealRoundSource.indexOf("beginEntryStarReveal()"), "multiplier stars may be revealed only after entry spend");
assert(finishRoundBody.includes('if (!encounter.cardsCleared) playBossSequence("11_idle", "11_idle")') && js.includes('playBossSequence("13_showdown", "11_idle")'), "Boss cards must keep their foreground holding hands until the player attack clears the cards");
assert(js.includes('document.documentElement.dataset.rewardDiceError = ""') && js.includes("void mountRewardDiceSpines()") && js.includes("REWARD_DIE_FLIP_SECONDS = 1.7333") && css.includes(".die.rolling"), "reward dice must mount the repaired Spine atlas and visibly finish the real flip before revealing each locked face");
assert(js.includes('loadSpineResource("attack")') && js.includes('"animation4"') && js.includes('"animation3"') && js.includes('"animation2"'), "attack must use the original four-tier full-screen Spine language");
assert(js.includes('classList.add("attack-fallback")') && css.includes(".combat-fx.attack-fallback .combat-projectile"), "attack must retain a visible fallback if the original Spine cannot load");
assert(js.includes("renderCompareCards(state)") && html.includes('id="comparePlayerCards"') && html.includes('id="compareBossCards"') && css.includes("compare-boss-cards-present") && css.includes("compare-player-cards-present"), "compare must first present both exact best-five hands in the original top/VS/bottom layout");
assert(js.includes('els.compareVerdict.textContent = "VS"') && js.includes("isTurbo() ? 520 : 1480") && js.indexOf('els.compareVerdict.textContent = "VS"') < js.indexOf("settleFight(state)"), "the opponent hand must finish revealing and hold for one full second before normal-speed collision; Turbo may shorten only the hold");
assert(css.includes("@keyframes compare-boss-cards-present") && css.includes("to { opacity: 1; transform: translate(-50%,0)") && css.includes("@keyframes compare-boss-cards-clash") && css.includes("@keyframes compare-player-cards-clash"), "hand reveal and hand collision must be two separate animation beats");
assert(css.includes("filter: brightness(.42) grayscale(.45)") && css.includes("@keyframes compare-card-shatter") && !js.includes('els.compareVerdict.textContent = "IMPACT"'), "after collision only the losing hand may shatter; no premature IMPACT label may interrupt it");
assert(js.includes('isTurbo() ? " turbo" : ""') && js.includes('els.magicReveal.className = `magic-reveal') && js.includes('els.roundStartFx.className = `round-start-fx'), "Turbo state must reach the shell, magic reveal, and START presentation layers");
assert(html.includes('id="magicDrawFan"') && js.includes("function showMagicDrawFan(cards)") && css.includes('.magic-reveal[data-stage="draw"]') && css.includes("@keyframes magic-draw-deal"), "magic reveal must include the official-style card-back draw beat before showing each actual card");
assert(js.includes("function assetUrl(path)") && js.includes("assetUrl(art)") && js.includes("assetUrl(label)") && js.includes("assetUrl(playerHandArt.base)") && js.includes("assetUrl(art.word)"), "dynamic magic and hand-type CSS variables must use page-absolute URLs instead of resolving under src/game");
assert(js.includes('showRoundActionFx("FIGHT")') && css.includes('.round-start-fx[data-action="fight"]') && js.indexOf('showRoundActionFx("FIGHT")') < js.indexOf("function beginFightReveal(state)"), "FIGHT must show its own action banner before the Boss hand reveal");
assert(html.includes('id="roundWarningFx"') && js.includes("function showLastRoundWarning()") && js.includes("encounter.round === encounter.packet.roundLimit - 1"), "the player must receive a visible one-round-left warning before the final playable round");
assert(html.includes('id="bossSpeech"') && js.includes('showBossSpeech("I WIN THIS TIME!")') && js.includes('showBossSpeech("COME BACK AND CHALLENGE ME!", "hurt")') && css.includes(".boss-speech"), "Boss reactions must stay in the Boss stage and remain non-blocking");
for (const turboSelector of [".game-shell.turbo.hand-entering #playerCards .playing-card", ".game-shell.turbo .playing-card.redraw-out", ".game-shell.turbo.phase-compare-reveal .boss-cards", ".game-shell.turbo.phase-damage .boss-spine-stage", ".game-shell.turbo.phase-damage .boss-hand-spine-stage", ".game-shell.turbo .die.rolling", ".game-shell.turbo .die.revealed"]) {
  assert(css.includes(turboSelector), `Turbo presentation timing is missing for ${turboSelector}`);
}
assert(!js.includes("els.bossDefeatFx.hidden = false") && !html.includes("BOSS<br>DEFEATED"), "Boss death must use the Boss and treasure Spine sequence instead of an invented defeat card");
assert(!html.includes('<p class="eyebrow">BOSS DEFEATED</p>') && !css.includes("linear-gradient(160deg,#5d1b62"), "kill reward must not use the invented purple settlement card");
assert(js.includes("bossSpineRetryCount < 2") && js.includes("bossSpineRetrySignature === signature"), "transient Boss Spine load failures require bounded same-encounter retry");
assert(js.includes("bossSpineFailedSignature === signature") && js.includes("else bossSpineFailedSignature = signature"), "exhausted Boss Spine retries must block render-triggered request storms");
assert(js.includes("bossSpineLoadingSignature === signature") && js.includes('bossSpineLoadingSignature = ""'), "repeated renders must share one in-flight Boss Spine request");
assert((js.match(/fallback: "assets\/mobile\/boss-fallback\//g) || []).length === 8, "all eight Bosses require a first-frame fallback while Spine loads");
assert(js.includes('loadSpineResource(key, "spine-front")') && js.includes("activeBossHandSpine") && js.includes("mergeBossSafeBounds(bodySafeBounds, frontSafeBounds)") && css.includes(".boss-hand-spine-stage"), "all Bosses require their exact synchronized, uncropped foreground hand/arm Spine layer");
const attackSpineBody = js.match(/async function playAttackSpine\([^]*?\n  }\n\n  function measureBossSafeBounds/)?.[0] || "";
assert(js.includes("ATTACK_SOURCE_BOUNDS") && js.includes("x: -541, y: -960.64, width: 1082, height: 1920.65") && attackSpineBody.includes("const bounds = ATTACK_SOURCE_BOUNDS") && !attackSpineBody.includes("spine.getLocalBounds()"), "attack Spine must use its full 1080x1920 source stage instead of a transient first-frame bound that sends later effects offscreen");
assert(js.includes("function auditBossAnimationCoverage(key)") && js.includes('get("qa") !== "1"') && js.includes("[0, .25, .5, .75, 1]") && js.includes("maximumCriticalVisible") && js.includes("window.__bossPhaseAudit"), "QA mode must sample both Boss layers and critical hand/arm/card visibility at five points per phase without adding production-state work");
assert(js.includes('els.gameShell.style.top = `${viewportTop + safeArea.top}px`') && /body\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*display:\s*block;/.test(css), "390×695 game canvas must stay top-aligned inside the mobile safe area");
assert(!css.includes(".phase-boss-dialogue .combat-message") && !css.includes(".phase-boss-victory-dialogue .combat-message"), "Boss speech must never cover the table after compare or damage");
assert(css.includes(".phase-round-result .combat-message,.phase-resolved-loss .combat-message { display: none; }"), "round result must keep the former speech area hidden");
assert(html.includes('location.protocol === "file:"') && html.includes("http://127.0.0.1:4173/"), "file-opened Demo must redirect to the local server so Boss Spine assets can load");
assert(toolHtml.includes('location.protocol === "file:"') && toolHtml.includes("http://127.0.0.1:4173/"), "file-opened probability tool must share the Demo HTTP origin so hot update remains connected");
assert(js.includes('data-effect-toggle=') && js.includes('aria-expanded=') && css.includes('.playing-card.effect-expanded'), "bound damage values must expand on tap without being covered by neighboring cards");
assert(js.includes('data-magic-preview=') && js.includes("openMagicPreview(Number(card.dataset.magicPreview))") && js.includes("if (event.target === els.magicPreview) closeMagicPreview()"), "left mini magic cards must reopen supplied big-card art and close from the backdrop without game-state writes");
assert(/\.deck-stack\s*\{[^}]*top:\s*-12px;[^}]*right:\s*-15px;/.test(css) && /\.deck-stack b\s*\{[^}]*right:\s*-5px;[^}]*bottom:\s*8px;[^}]*min-width:\s*46px;[^}]*font-size:\s*13px;/.test(css) && js.includes('`${encounter.presentation.playerDeck.length}/52`') && js.includes('const atRoundBoundary = encounter.phase === "round-result"'), "deck count must stay at the pile bottom-right as n/52 while the entire pile clears the ONE PAIR paytable row and remains inside the viewport");
assert(/\.treasure-badge\s*\{[^}]*z-index:\s*15;/.test(css), "numeric treasure maximum must remain above foreground Boss hands");
assert(/id="playerName">\d{16}</.test(html) && html.includes('<span>TOTAL BET</span>') && css.includes(".wallet-bar > div:first-child::before") && css.includes(".brand-mark::before"), "footer must retain the original numeric player ID, wallet, coin pile, and TOTAL BET structure");
const cardRule = css.match(/\.playing-card\.original-art\s*\{([^}]*)\}/)?.[1] || "";
const cardsRule = css.match(/\.cards\s*\{([^}]*)\}/)?.[1] || "";
const collapsedEffectRule = css.match(/\.bound-effect\s*\{([^}]*)\}/)?.[1] || "";
const expandedEffectRule = css.match(/\.bound-effect\[aria-expanded="true"\]\s*\{([^}]*)\}/)?.[1] || "";
const expandedCardRule = css.match(/\.playing-card\.effect-expanded\s*\{([^}]*)\}/)?.[1] || "";
const cardWidth = Number(cardRule.match(/width:\s*(\d+)px/)?.[1]);
const cardOverlap = Math.abs(Number(cardRule.match(/margin-left:\s*(-?\d+)px/)?.[1]));
const cardsCenterOffset = Number(cardsRule.match(/left:\s*calc\(50%\s*\+\s*(\d+)px\)/)?.[1]);
const collapsedLeft = Number(collapsedEffectRule.match(/left:\s*(-?\d+)px/)?.[1]);
const collapsedWidth = Number(collapsedEffectRule.match(/width:\s*(\d+)px/)?.[1]);
const expandedWidth = Number(expandedEffectRule.match(/width:\s*(\d+)px/)?.[1]);
assert(cardWidth - cardOverlap >= collapsedLeft + collapsedWidth, "collapsed bound-effect hit area must stay inside the visible slice of every overlapped card");
const handWidth = cardWidth + 5 * (cardWidth - cardOverlap);
const handLeft = shellWidth / 2 + cardsCenterOffset - handWidth / 2;
const handRight = handLeft + handWidth;
assert(handLeft >= 0 && handRight <= shellWidth, "six-card hand must remain inside the portrait viewport");
assert(css.includes(".cards > .playing-card.original-art:first-child { margin-left: 0; }"), "first player card must cancel the overlap margin so the safe-zone math matches the rendered flex row");
const magicRule = css.match(/\.magic-card\s*\{([^}]*)\}/)?.[1] || "";
const magicLeft = Number(magicRule.match(/left:\s*(-?\d+)(?:px)?/)?.[1]);
const magicWidth = Number(magicRule.match(/width:\s*(\d+)px/)?.[1]);
assert(handLeft - (magicLeft + magicWidth) >= 12, "player hand must keep a visible safe gap from the left magic-card column");
const cardHeight = Number(cardRule.match(/height:\s*(\d+)px/)?.[1]);
assert(Math.abs(cardWidth / cardHeight - 220 / 283) < 0.002, "player cards must preserve the supplied 220:283 aspect ratio");
assert(css.includes(".playing-card.sixth-card { opacity: 1;") && css.includes(".compare-card-row .compare-sixth-card") && css.includes("opacity: .5;"), "the sixth card must stay normal in the hand and dim exactly 50% only in compare evidence");
assert(css.includes(".playing-card.sixth-card::after { display: none; }"), "the unmatched sixth card must not gain an invented 6TH label");
assert(/\.result-board-frame\s*\{[^}]*top:\s*369px;[^}]*width:\s*246px;[^}]*min-height:\s*54px;/.test(css), "compare result must use a compact center ribbon that leaves both evidence hands visible");
assert(js.includes('const compareEvidence = ["compare-reveal", "compare-result", "tie-result"]') && !/playing-card\.discard[^}]*grayscale/.test(css), "only compare evidence may dim the sixth card and discarded/unselected cards must preserve red/black suits");
assert(js.includes("function jokerCardMarkup(rank, revealSubstituteRank = true)") && js.includes("jokerCardMarkup(jokerRank, compareEvidence)") && js.includes('card.joker && compareEvidence ? `，代替') && js.includes('revealSubstituteRank ? `<img class="joker-card-rank"') && js.includes('" joker-only"'), "Joker must stay generic before compare and reveal its substitute rank only in compare evidence");
assert(expandedWidth >= 38 && expandedWidth <= cardWidth - cardOverlap, "expanded bound-effect final value must stay inside the exposed card slice and never cover the next card");
assert(expandedCardRule.includes("z-index: 30 !important") && expandedCardRule.includes("overflow: visible"), "expanded bound-effect card must rise above neighboring cards without clipping its panel");
assert(js.includes('class="combat-magic-chip') && js.includes('data-combat-roll=') && js.includes('data-locked-final=') && css.includes(".combat-final-value.rolling") && css.includes(".combat-final-value.settled"), "post-compare magic must use RandomNum-style rolls that retain locked X/+ values");
assert(js.includes('const hasHiddenDamageEffect = breakdown.activeEffects.some((effect) => effect.key !== "joker")') && js.includes("if (!hasHiddenDamageEffect)"), "crit, fixed damage, and every hand-type damage multiplier must all reveal their final value during compare");
assert(html.includes('id="combatLiveDamage"') && css.includes(".combat-live-damage") && js.includes("function combatPreviewDamage(base, effects)") && js.includes('rollingValue === "X1"') && js.includes("setCombatLiveDamage(breakdown.base, true)"), "magic reward rolling must show live damage above the card, with X1 equal to the original hand damage");
assert(/async function showCombatResolution\(state, result, breakdownInput = null\)[\s\S]*?await runCombatRandomNumbers\(breakdown\.activeEffects, breakdown, token\)[\s\S]*?classList\.add\("formula-ready"\)[\s\S]*?beginAttackPlayback\(state, result, breakdown, attackTier, token\)/.test(js), "all magic values and live damage must stop before formula and attack playback");
const attackBody = js.match(/async function beginAttackPlayback\([^]*?\n  }\n\n  async function showCombatResolution/)?.[0] || "";
for (const marker of ['phase = "attack"', "await playAttackSpine", 'phase = "damage"', 'playBossSequence("17_damage", null)', "encounter.hpLeft =", 'phase = "post-hit"', 'playBossSequence("14_idle_nocard"', "finishRound("]) assert(attackBody.includes(marker), `nonlethal attack sequence missing ${marker}`);
assert(attackBody.indexOf('phase = "attack"') < attackBody.indexOf('phase = "damage"') && attackBody.indexOf('phase = "damage"') < attackBody.indexOf("encounter.hpLeft =") && attackBody.indexOf("encounter.hpLeft =") < attackBody.indexOf('phase = "post-hit"') && attackBody.indexOf('phase = "post-hit"') < attackBody.indexOf("finishRound("), "attack, damage, HP, idle, and CONTINUE must remain strictly ordered; any Boss speech may only be non-blocking after post-hit");
assert(js.includes("ATTACK_ANIMATION_SECONDS") && js.includes("findAnimation?.(animation)?.duration") && !js.includes("animationWindowMs(1.6, 80)"), "attack completion must use the selected Spine animation's true runtime instead of a fixed 1.6-second wait");
assert(js.includes("opened: new Set(), finished: new Set(), settling: false, encounter") && !js.includes('stage: "normal", encounter') && !js.includes("normalRunningSum") && !js.includes("multiplierRunningSum") && !js.includes("schedulePrizeAutoReveal"), "kill reward must let every die animate independently and settle only after all clicked dice finish");
const rewardRevealBody = js.match(/function revealPrizeDie\(index\)[\s\S]*?\n  }\n\n  function animateRewardTotal/)?.[0] || "";
assert(rewardRevealBody.includes("state.opened.add(index)") && rewardRevealBody.includes("setTimeout(() =>") && rewardRevealBody.indexOf("state.opened.add(index)") < rewardRevealBody.indexOf("setTimeout(() =>") && rewardRevealBody.includes("state.finished.add(index)") && rewardRevealBody.includes("state.opened.size === totalDice && state.finished.size === totalDice") && !rewardRevealBody.includes("await prizePause"), "a clicked die must commit immediately, animate independently, and only the all-finished guard may start settlement");
assert(js.includes("void mountRewardDiceSpines()") && js.includes('setAnimation(0, spineRecord.multiplier ? "golden_flip" : "normal_flip", false)') && js.includes("REWARD_DIE_FLIP_SECONDS") && css.includes("@keyframes reward-die-roll"), "every clicked normal or multiplier die must retain its non-blocking Spine/CSS flip presentation");
assert(js.includes("function diePipsMarkup(face)") && css.includes(".die-pips") && css.includes(".die.spine-ready.rolling .die-fallback,.die.spine-ready.revealed .die-fallback { display: grid; }"), "normal dice must retain readable DOM pips throughout each independent roll so a blank Spine canvas can never hide the result");
assert(js.includes("`${dice.total} + ${encounter.coinBonusX} = ${totalRewardX}X`") && js.includes("`BET ${activeBet} · WIN ${payout.toFixed"), "TOTAL WIN must identify the dice subtotal and coin-card addition without adding small diagnostic copy");
assert(!js.includes('state.normalFaces.join(" + ")') && !js.includes('state.multiplierFaces.join(" + ")'), "reward display must not expose live subtotals before every independent die has settled");
assert(css.includes(".cards-cleared #playerCards") && css.includes(".cards-cleared .boss-cards") && css.includes(".cards-cleared .magic-row") && css.includes(".phase-attack.cards-cleared #playerCards") && css.includes(".combat-fx.attack-normal .combat-fx-cards"), "both hands and magic cards must exit before attack, never flash back on attack render, and stay cleared through CONTINUE");
const bossVictoryBody = js.match(/function beginBossVictoryDialogue\([^]*?\n  }\n\n  function fold/)?.[0] || "";
assert(bossVictoryBody.includes('cardsCleared = true') && !bossVictoryBody.includes('boss-victory-dialogue') && bossVictoryBody.indexOf('cardsCleared = true') < bossVictoryBody.indexOf("finishRound("), "Boss victory must clear both hands and expose CONTINUE without a blocking speech phase");
assert(css.includes(".bound-effect.bound-flatDamage { top: 49px; }") && css.includes(".bound-effect.bound-crit { top: 72px; }") && js.includes('["flatDamage", "crit"]'), "blue fixed damage must remain above yellow critical on the resized card");
assert(!js.includes("--effect-index"), "bound-effect slots must be keyed by effect type instead of array order");
assert(/function fold\(\)[\s\S]*?encounter\.expandedEffect = "";/.test(js) && /function fight\(\)[\s\S]*?encounter\.expandedEffect = "";/.test(js), "FIGHT and FOLD must both collapse bound-effect details before presentation starts");
assert(js.includes('!["hand", "round-result"].includes(encounter.phase)'), "bound-effect details must stay locked during compare, attack, hit, and defeat presentation");
assert(js.includes('typeof Rules.sortCardIndexes === "function"') && js.includes("JOKER 為萬能牌") && js.includes("最多只能鎖定 5 張牌"), "formal arrangement rules must drive the UI, force Joker lock, and enforce the five-card cap");
assert(js.includes("每次換牌完成都重新依實際保留牌與 Joker 邏輯點數排序") && js.includes("玩家手動新增／取消只改保留狀態，不移動任何牌") && js.includes("LOCK ${lockedCards}/5"), "only initial deal and redraw may sort; manual hold changes must preserve every card position");
assert(/function advanceBoss\(\)[\s\S]*?const previousStar = encounter\.packet\.star;[\s\S]*?spawnBoss\(previousStar\);/.test(js), "normal Boss advance must avoid repeating the previous star");
assert(js.includes("isTurbo() ? 360 : 1000"), "each round-start magic card must advance or close after one second in normal mode");
assert((html.match(/data-tutorial-page=/g) || []).length === 4 && html.includes("tutorial-p1.png") && html.includes("tutorial-p4.png"), "the supplied four-page tutorial must be wired");
assert((html.match(/class="tutorial-copy"/g) || []).length === 4 && html.includes("Within a limited number of rounds, defeat the BOSS to earn a Kill Reward!") && html.includes("KEEP FIVE. REDRAW THE REST.") && html.includes("KILL FIRST. REVEAL DICE AFTER."), "every supplied tutorial page must retain its visible instruction copy");
assert(css.includes("height: 584px") && css.includes("grid-template-rows: 252px auto") && css.includes("tutorial-page-art.page-p1 { width: 288px"), "tutorial proportions must reserve dedicated image and copy areas without the oversized empty panel");
assert(css.includes("round-panel.png") && html.includes("round-word.png") && css.includes("round-numbers.png"), "the supplied ROUND panel, word, and number sheet must replace system text");
assert(/\.round-ribbon\s*\{[^}]*width:\s*84px;[^}]*height:\s*59px;[^}]*transform:\s*none;/.test(css), "the top-left ROUND panel must use the original 84x59 reference size without the oversized 2x transform");
assert(html.includes("src/core/boss-duel-poker-arrangement-core.js?v=frontend-v90") && html.includes("src/core/boss-duel-rules.js?v=frontend-v90") && html.includes("src/core/boss-duel-natural-story-core.js?v=frontend-v90") && html.includes("src/game/boss-duel-demo.js?v=frontend-v90") && html.includes("src/game/boss-duel-demo.css?v=frontend-v90"), "Demo code, shared arrangement, and live story assets must share the v90 cache key");
assert(js.includes("STORY_BET_CONTRACT_VERSION = NaturalCore.STORY_BET_CONTRACT_VERSION") && js.includes("NaturalCore.materializeStoryForBet") && js.includes("storyBetContract"), "game must use the shared X-multiplier story contract across every Bet and expose it in replay audit");
assert(js.includes("NaturalCore.drawUniformPresetStoryCommit") && js.includes("ticketBasis: 1000000") && !js.includes("ticketCandidateTournamentSize"), "normal Demo play must draw one candidate uniformly from each full class pool and score-ticket only those three candidates");
assert(html.includes("src/core/boss-duel-story-planner.js?v=boss-plan-v10") && html.includes("data/story/boss-duel-story-preset-v1.js?v=story-catalog-v12"), "Demo must load the planner and freshly regenerated 240,000-story seed preset");
assert(js.includes("executeRuntimeRedraw") && js.includes("plannedKeepIds") && js.includes("actualKeepIds") && js.includes("suppressionActive"), "Demo must compare each successful redraw with the planned action and persist suppression state");
assert(js.includes("suppressionPolicy: encounter.packet.storyConfig?.suppressionPolicy") && js.includes("SUPPRESSION_STORAGE_KEY"), "game redraw and showdown must use the versioned suppression policy selected by the tool");
assert(js.includes("window.getBossDuelReplayAudit") && js.includes("actionLog") && js.includes("replayContract") && js.includes("bossInstanceId") && js.includes("requestId") && js.includes("bossCardIds"), "backend-facing replay audit must expose unique ordered operations, both initial hands, and the exact replay contract");
assert(js.includes('qaParams.get("storyMode") !== "1"') && js.includes("NaturalCore.simulateNaturalStory") && js.includes("naturalStorySeed: story.seed"), "a tool-selected story must still load its exact classified Natural seed into the Demo");
assert(js.includes("STORY_REWARD_FLOOR_PCT = 10") && js.includes("STORY_REWARD_CEILING_MULTIPLE = 10") && js.includes("amount * encounter.poolTargetRtpPct / 100"), "normal Demo play must accrue each paid event at the locked target RTP and enforce 10%-to-1000% reward bounds");
assert(js.includes("NaturalCore.normalizeTargetRtpPct(window.BOSS_DUEL_PLATFORM_CONFIG?.targetRtpPct)") && js.includes("lockedTargetRtpPct"), "platform RTP must be clamped to 80%-99% and locked into each Boss");
assert(js.includes("settleStoryPool(organicPayoutCredits, true)") && js.includes("NaturalCore.settleStartedStory") && js.includes("organicPayoutCredits: organicPayout"), "the current killed Boss must debit organic payout and apply the shared legal-dice correction exactly once");
assert(js.includes("Rules.createNaturalRound") && js.includes("1201 + tieIndex * 17") && !js.includes("Rules.createRound") && !js.includes("Rules.prepareCompare"), "every encounter must replay the formal natural story without an obsolete controlled-round fallback");
assert(js.includes("故事節奏：照自動保留再換") && js.includes("? 120 : HAND_SECONDS"), "story experience must show the exact redraw rhythm and give the player enough time to follow it");
assert(js.includes("let storyExperience = loadStoryExperience(runtimeConfig)") && js.includes("if (leavingFixedStory) storyExperience = null"), "paid reroll from a fixed story must leave the selected story before spawning the next dynamic Boss");
assert(js.includes("els.rerollButton.hidden = !(ready || roundResult)") && !js.includes('packet.storyRuntimeMode === "FIXED" || !(ready || roundResult)'), "REROLL BOSS must be visible before play and between rounds in fixed and dynamic stories");
assert(js.includes('.filter((key) => hasBoundMagicEffect(card, key))') && js.includes('Object.prototype.hasOwnProperty.call(card.magicEffects, key)') && js.includes("數值於比牌結算揭露"), "a bound damage card must render without exposing its hidden value before showdown");
assert(js.includes("publicBaseDamage") && js.includes("魔法值比牌時揭露") && !js.includes("現有傷害 ${result.damage}"), "hand phase must show only base hand damage and must not leak magic values through the total");
assert.deepEqual(Rules.magicDisplay({ key: "crit", label: "CRITICAL", type: "DMG", value: 5 }), { type: "DMG", label: "CRITICAL" });
assert.deepEqual(Rules.magicDisplay({ key: "flatDamage", label: "FIXED DMG", type: "DMG", value: 6 }), { type: "DMG", label: "FIXED DMG" });
assert.equal(Rules.magicDisplay({ key: "threeBoost", label: "THREE OF A KIND", type: "DMG", value: 3 }).label, "THREE OF A KIND");
assert.equal(Rules.magicDisplay({ key: "coin", label: "GOLD", type: "GOLD", value: 6 }).label, "+6x", "coin is the only card that exposes its amount at reveal");
assert(js.includes('source: "NATURAL"'), "story experience must use the Natural-only catalog");
assert(toolHtml.includes('href="%E9%81%8A%E6%88%B2Demo.html?v=frontend-v90"'), "probability tool must keep a direct link to the current frontend Demo");
assert(!html.includes("Killstreak") && !html.includes("連殺與魔法卡加成"), "disabled killstreak copy must not remain in the game tutorial or reroll prompt");

console.log(JSON.stringify({
  status: "ok",
  flowNodes: requiredIds.length,
  phases: 13,
  bossAnimations: 7,
  portraitViewport: `${shellWidth}x${shellHeight}`,
  payoutWrites: payoutWrites.length,
  effectVisibleSlicePx: cardWidth - cardOverlap,
  effectHitRightPx: collapsedLeft + collapsedWidth,
  handBoundsPx: [handLeft, handRight]
}, null, 2));
