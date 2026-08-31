import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const root = path.resolve(import.meta.dirname, "..");
const outputDir = path.join(root, "outputs", "01a0475c-013b-77b1-8bad-bb0725d62606");
const previewOnly = process.env.BOSS_DUEL_PREVIEW_ONLY === "1";

const classOrder = { win: 0, push: 1, lose: 2 };
const classLabel = { win: "贏多", push: "贏少", lose: "輸" };
const winMinReturnX = 3;
const pushMinReturnX = 1;
const suitCode = { "♠": "S", "♥": "H", "♦": "D", "♣": "C" };
const handLabel = {
  high: "高牌", pair: "一對", twoPair: "兩對", three: "三條", straight: "順子",
  flush: "同花", fullHouse: "葫蘆", four: "四條", straightFlush: "同花順"
};
const magicLabel = {
  threeBoost: "三條傷害", fourBoost: "四條傷害", straightBoost: "順子傷害", flushBoost: "同花傷害",
  fullHouseBoost: "葫蘆傷害", joker: "Joker", crit: "暴擊", flatDamage: "固傷", coin: "金幣", freeDraw: "免費換牌"
};

function cardId(label) {
  if (String(label).toUpperCase().includes("JOKER")) return "JOKER";
  const text = String(label);
  const match = text.match(/^(10|[2-9JQKA])([♠♥♦♣])/);
  if (!match) return text;
  const rank = ({ J: 11, Q: 12, K: 13, A: 14 })[match[1]] || match[1];
  return `${rank}${suitCode[match[2]]}`;
}

function keptLabels(round, ids) {
  const byId = new Map((round.initialCards || []).map((card) => [cardId(card), card]));
  return (ids || []).map((id) => byId.get(id) || id).join(" ");
}

function perRound(story, getter) {
  return (story.path || []).map((round) => `R${round.round}${round.tieIndex ? `.${round.tieIndex}` : ""}:${getter(round)}`).join("｜");
}

function rowFor(story, index) {
  const actionSummary = `戰${story.actions.fights}／棄${story.actions.folds}／和${story.actions.ties}／換${story.actions.totalDraws}（付${story.actions.paidDraws}／免${story.actions.freeDraws}）／手動${story.actions.manualAdjustments}`;
  const keepSummary = perRound(story, (round) => `初:${(round.initialCards || []).join(" ")}／自:${keptLabels(round, round.autoKeepCardIds) || "無"}／劇:${keptLabels(round, round.initialKeepCardIds) || "無"}`);
  const plannedOperations = perRound(story, (round) => (round.drawLog || []).map((draw, drawIndex) => {
    const keep = (draw.keepCardIds || []).join(",") || "無";
    const discarded = (draw.discardedCardIds || []).join(",") || "無";
    const accepted = (draw.acceptedCardIds || []).join(",") || "無";
    return `D${drawIndex + 1}[留:${keep}／棄:${discarded}／補:${accepted}]`;
  }).join(" ") || "無換牌");
  const resultSummary = perRound(story, (round) => `${handLabel[round.finalHand] || round.finalHand}〔${(round.finalCards || []).join(" ")}〕 ${round.action}/${round.result} 傷${round.damage || 0} HP${round.bossHpBefore ?? "—"}→${round.bossHpAfter ?? "—"}｜BOSS ${handLabel[round.bossHand] || round.bossHand}〔${(round.bossCards || []).join(" ")}〕`);
  const fullReplayAudit = JSON.stringify({
    actions: story.actions,
    terminationReason: story.terminationReason,
    magicCounts: story.magicCounts,
    decisionMetrics: story.decisionMetrics,
    path: story.path
  });
  const replayContract = `seed=${story.seed}／${story.plannerVersion || "boss-plan-v10"}／story-action-trace-v1／deviation-suppression-v1`;
  return [
    index + 1, story.id, story.seed, classLabel[story.classKey], story.killed ? "是" : "否",
    story.spendX, story.payoutX, null, null, story.hp, story.hpLeft, story.rounds,
    actionSummary, keepSummary, plannedOperations, resultSummary, fullReplayAudit, replayContract
  ];
}

function reclassify(story) {
  const returnX = Number(story.payoutX) / Math.max(Number(story.spendX), Number.EPSILON);
  story.classKey = returnX >= winMinReturnX ? "win" : returnX >= pushMinReturnX ? "push" : "lose";
  story.classLabel = classLabel[story.classKey];
  return story;
}

async function loadStoriesForStar(star) {
  const stories = (await Promise.all(["win", "push", "lose"].map(async (classKey) => {
    const file = path.join(root, "reports", "story-detail-parts-v10", `star-${star}-${classKey}.json`);
    return JSON.parse(await fs.readFile(file, "utf8"));
  }))).flat().map(reclassify);
  const counts = Object.fromEntries(["win", "push", "lose"].map((classKey) => [classKey, stories.filter((story) => story.classKey === classKey).length]));
  if (Object.values(counts).some((count) => count !== 10000)) throw new Error(`${star} 星三分類不是各 10,000 個：${JSON.stringify(counts)}`);
  stories.sort((left, right) => classOrder[left.classKey] - classOrder[right.classKey] || right.netX - left.netX || left.seed - right.seed);
  return previewOnly ? stories.slice(0, 24) : stories;
}
const storiesPerStar = 30000;
const totalStories = 240000;
const detailLastRow = previewOnly ? 28 : storiesPerStar + 4;
const previewDir = path.join(outputDir, `Boss Duel 逐利型玩家劇情 ${totalStories} 預覽`);
const outputPath = path.join(outputDir, `Boss Duel 逐利型玩家劇情 ${totalStories}.xlsx`);

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

const workbook = Workbook.create();
const summary = workbook.worksheets.add("總覽");
const starSheets = Array.from({ length: 8 }, (_, index) => workbook.worksheets.add(`${index + 1}星`));

const colors = {
  wine: "#351217", dark: "#1D1113", gold: "#D9A441", cream: "#FFF4D6",
  light: "#FFF9ED", line: "#E2D2B6", green: "#DCFCE7", greenText: "#166534",
  red: "#FEE2E2", redText: "#991B1B", blue: "#DBEAFE", blueText: "#1E3A8A"
};

function styleTitle(sheet, range) {
  range.format = {
    fill: colors.wine,
    font: { bold: true, color: colors.cream, size: 18 },
    horizontalAlignment: "left", verticalAlignment: "center"
  };
  range.format.rowHeight = 34;
  sheet.showGridLines = false;
}

summary.getRange("A1:N1").merge();
summary.getRange("A1").values = [[`Boss Duel｜逐利型聰明玩家劇情總覽（8 星 × ${storiesPerStar.toLocaleString("en-US")} 局）`]];
styleTitle(summary, summary.getRange("A1:N1"));
summary.getRange("A2:N2").merge();
summary.getRange("A2").values = [["版本：frontend-v85／action-tree-v30／boss-plan-v10／arrange-v9／natural-story-preset-v10　分類：贏多 ≥3x；贏少 ≥1x 且 <3x；輸 <1x；24 個結果資料格各 10,000；同一 X 倍數劇本通用所有 Bet"]];
summary.getRange("A2:N2").format = { fill: colors.cream, font: { color: colors.dark, italic: true }, wrapText: true };
summary.getRange("A4:N4").values = [["星級", "故事數", "擊殺", "擊殺率", "贏多", "贏少", "輸", "平均總押", "平均總派彩", "平均倍率", "平均淨結果", "有換牌故事", "完整稽核", "重播契約"]];
summary.getRange("A4:N4").format = { fill: colors.dark, font: { bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", wrapText: true };

for (let star = 1; star <= 8; star += 1) {
  const row = star + 4;
  const s = `'${star}星'`;
  summary.getRange(`A${row}`).values = [[`${star}星`]];
  summary.getRange(`B${row}:N${row}`).formulas = [[
    `=COUNTA(${s}!$B$5:$B$${detailLastRow})`, `=COUNTIF(${s}!$E$5:$E$${detailLastRow},"是")`, `=C${row}/B${row}`,
    `=COUNTIF(${s}!$D$5:$D$${detailLastRow},"贏多")`, `=COUNTIF(${s}!$D$5:$D$${detailLastRow},"贏少")`, `=COUNTIF(${s}!$D$5:$D$${detailLastRow},"輸")`,
    `=AVERAGE(${s}!$F$5:$F$${detailLastRow})`, `=AVERAGE(${s}!$G$5:$G$${detailLastRow})`, `=AVERAGE(${s}!$I$5:$I$${detailLastRow})`, `=AVERAGE(${s}!$H$5:$H$${detailLastRow})`,
    `=B${row}-COUNTIF(${s}!$M$5:$M$${detailLastRow},"*／換0（*")`, `=COUNTA(${s}!$Q$5:$Q$${detailLastRow})`, `=COUNTA(${s}!$R$5:$R$${detailLastRow})`
  ]];
}
summary.getRange("A13").values = [["合計／加權"]];
summary.getRange("B13:N13").formulas = [[
  "=SUM(B5:B12)", "=SUM(C5:C12)", "=C13/B13", "=SUM(E5:E12)", "=SUM(F5:F12)", "=SUM(G5:G12)",
  "=SUMPRODUCT(H5:H12,B5:B12)/B13", "=SUMPRODUCT(I5:I12,B5:B12)/B13", "=SUMPRODUCT(J5:J12,B5:B12)/B13", "=SUMPRODUCT(K5:K12,B5:B12)/B13",
  "=SUM(L5:L12)", "=SUM(M5:M12)", "=SUM(N5:N12)"
]];
summary.getRange("A13:N13").format = { fill: colors.cream, font: { bold: true, color: colors.wine }, borders: { preset: "doubleBottom", style: "medium", color: colors.gold } };
summary.getRange("D5:D13").format.numberFormat = "0.0%";
summary.getRange("H5:K13").format.numberFormat = "0.00x";
summary.getRange("B5:C13").format.numberFormat = "#,##0";
summary.getRange("E5:G13").format.numberFormat = "#,##0";
summary.getRange("L5:N13").format.numberFormat = "#,##0";
summary.getRange("A4:N13").format.borders = { insideHorizontal: { style: "thin", color: colors.line }, bottom: { style: "medium", color: colors.gold } };
summary.getRange("A16:D20").values = [
  ["分類", "正式界線", "排序", "說明"],
  ["贏多", "總派彩 ÷ 總押 ≥ 3x", 1, "同類內依遊戲淨結果由高到低"],
  ["贏少", "1x ≤ 總派彩 ÷ 總押 < 3x", 2, "不補造、不強迫有案例"],
  ["輸", "總派彩 ÷ 總押 < 1x", 3, "0x 派彩會顯示負的遊戲淨結果"],
  ["遊戲淨結果", "總派彩－總押", null, "正數顯示為獲利，負數顯示為虧損"]
];
summary.getRange("A16:D16").format = { fill: colors.gold, font: { bold: true, color: colors.dark } };
summary.getRange("F16:J21").values = [
  ["現行玩家規則", "內容", null, null, null],
  ["目標", "最大化有機會獲利，不以擊殺率排序結果", null, null, null],
  ["決策訊號", "比牌勝率＋擊殺機會＋魔法卡連動＋整隻 BOSS 總押／派彩", null, null, null],
  ["自動鎖牌", "四張：暴擊優先，無暴擊留固傷；三張：暴擊與固傷都留；最多五張", null, null, null],
  ["Joker", "一定保留；換牌上限與手動門檻比無 Joker 更保守", null, null, null],
  ["資料口徑", `每星三分類各 10,000 個、共 ${storiesPerStar.toLocaleString("en-US")} 個正式自然種子；每個接受種子可依版本與操作完整重播`, null, null, null]
];
summary.getRange("F16:J16").merge();
summary.getRange("F16").values = [["現行玩家規則"]];
summary.getRange("F16:J16").format = { fill: colors.gold, font: { bold: true, color: colors.dark } };
for (let row = 17; row <= 21; row += 1) summary.getRange(`G${row}:J${row}`).merge();
summary.getRange("F16:J21").format.wrapText = true;
summary.getRange("F17:F21").format.font = { bold: true, color: colors.wine };
summary.freezePanes.freezeRows(4);
summary.getRange("A1:N21").format.font = { name: "Microsoft JhengHei", size: 10 };
summary.getRange("A1:N21").format.autofitRows();
summary.getRange("A1:N21").format.autofitColumns();
summary.getRange("F19:J19").format.rowHeight = 34;
summary.getRange("A:A").format.columnWidth = 13;
summary.getRange("B:N").format.columnWidth = 14;
summary.getRange("B2:N2").format.columnWidth = 14;
summary.getRange("B1:B21").format.columnWidth = 24;
summary.getRange("D1:D21").format.columnWidth = 30;
summary.getRange("F1:F21").format.columnWidth = 18;

const helperRange = summary.getRange("Q4:T12");
helperRange.values = [["星級", "贏多", "贏少", "輸"], ...Array.from({ length: 8 }, (_, index) => [`${index + 1}星`, null, null, null])];
for (let row = 5; row <= 12; row += 1) summary.getRange(`R${row}:T${row}`).formulas = [[`=E${row}`, `=F${row}`, `=G${row}`]];
const chart = summary.charts.add("bar", helperRange);
chart.title = "各星故事分類數量";
chart.hasLegend = true;
chart.setPosition("P4", "X20");

const headers = [
  "排序", "故事 ID", "種子", "分類", "擊殺", "總押 x", "總派彩 x", "遊戲淨結果 x", "分類倍率",
  "BOSS HP", "剩餘 HP", "回合", "操作合計", "初始／自動／劇本保留", "劇本換牌操作", "各回合結果與雙方手牌",
  "完整重播稽核 JSON", "重播契約"
];

for (let star = 1; star <= 8; star += 1) {
  if (typeof global.gc === "function") global.gc();
  const sheet = starSheets[star - 1];
  const stories = await loadStoriesForStar(star);
  if (!previewOnly && stories.length !== storiesPerStar) throw new Error(`${star} 星故事不是 ${storiesPerStar} 個`);
  sheet.getRange("A1:R1").merge();
  sheet.getRange("A1").values = [[`${star} 星 BOSS｜逐利型聰明玩家 ${storiesPerStar.toLocaleString("en-US")} 局（已依贏多→贏少→輸、淨結果由高到低排序）`]];
  styleTitle(sheet, sheet.getRange("A1:R1"));
  sheet.getRange("A2:R2").merge();
  sheet.getRange("A2").values = [["每筆均為實際合法重播；總押＝入場＋付費換牌，遊戲淨結果＝總派彩－總押。Joker 與無 Joker 會採用不同換牌／手動門檻。"]];
  sheet.getRange("A2:R2").format = { fill: colors.cream, font: { italic: true, color: colors.dark }, wrapText: true };
  sheet.getRange("A4:R4").values = [headers];
  sheet.getRange("A4:R4").format = { fill: colors.dark, font: { bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true };
  const rows = stories.map(rowFor);
  sheet.getRange(`A5:R${rows.length + 4}`).values = rows;
  sheet.getRange(`H5:I${rows.length + 4}`).formulas = rows.map((_story, index) => {
    const row = index + 5;
    return [`=G${row}-F${row}`, `=IFERROR(G${row}/F${row},0)`];
  });
  sheet.getRange(`D5:D${rows.length + 4}`).conditionalFormats.add("containsText", { text: "贏多", format: { fill: colors.green, font: { color: colors.greenText, bold: true } } });
  sheet.getRange(`D5:D${rows.length + 4}`).conditionalFormats.add("containsText", { text: "贏少", format: { fill: colors.blue, font: { color: colors.blueText, bold: true } } });
  sheet.getRange(`D5:D${rows.length + 4}`).conditionalFormats.add("containsText", { text: "輸", format: { fill: colors.red, font: { color: colors.redText, bold: true } } });
  sheet.getRange(`H5:H${rows.length + 4}`).conditionalFormats.add("cellIs", { operator: "greaterThan", formula: 0, format: { font: { color: colors.greenText } } });
  sheet.getRange(`H5:H${rows.length + 4}`).conditionalFormats.add("cellIs", { operator: "lessThan", formula: 0, format: { font: { color: colors.redText } } });
  sheet.freezePanes.freezeRows(4);
  sheet.freezePanes.freezeColumns(4);
  sheet.getRange("A:A").format.columnWidth = 10;
  sheet.getRange("B:B").format.columnWidth = 24;
  sheet.getRange("C:L").format.columnWidth = 11;
  sheet.getRange("M:P").format.columnWidth = 42;
  sheet.getRange("Q:Q").format.columnWidth = 80;
  sheet.getRange("R:R").format.columnWidth = 48;
  sheet.getRange("A4:R4").format.rowHeight = 40;
}

const formulaInspection = await workbook.inspect({ kind: "formula", maxChars: 8000, tableMaxRows: 8, tableMaxCols: 12, options: { maxResults: 80 } });
const errorInspection = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", maxChars: 5000, options: { useRegex: true, maxResults: 50 } });

for (const sheetName of ["總覽", "1星", "2星", "3星", "4星", "5星", "6星", "7星", "8星"]) {
  const preview = await workbook.render({ sheetName, range: sheetName === "總覽" ? "A1:X22" : "A1:R28", scale: 0.8, format: "png" });
  await fs.writeFile(path.join(previewDir, `${sheetName}.png`), new Uint8Array(await preview.arrayBuffer()));
}

if (typeof global.gc === "function") global.gc();
if (!previewOnly) {
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);
}
await fs.writeFile(path.join(previewDir, "qa.json"), JSON.stringify({
  outputPath,
  sheets: ["總覽", "1星", "2星", "3星", "4星", "5星", "6星", "7星", "8星"],
  stories: totalStories,
  formulaInspection: formulaInspection.ndjson || formulaInspection,
  errorInspection: errorInspection.ndjson || errorInspection
}, null, 2));

console.log(JSON.stringify({ outputPath, previewDir, stories: totalStories, previewOnly }, null, 2));
