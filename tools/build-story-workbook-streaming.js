"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { once } = require("node:events");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "outputs", "01a0475c-013b-77b1-8bad-bb0725d62606");
const packageDir = path.join(outputDir, "workbook-package-v10");
const previewDir = path.join(outputDir, "Boss Duel 逐利型玩家劇情 240000 預覽");
const outputPath = path.join(outputDir, "Boss Duel 逐利型玩家劇情 240000.xlsx");
const classKeys = ["win", "push", "lose"];
const classLabel = { win: "贏多", push: "贏少", lose: "輸" };
const handLabel = {
  high: "高牌", pair: "一對", twoPair: "兩對", three: "三條", straight: "順子",
  flush: "同花", fullHouse: "葫蘆", four: "四條", straightFlush: "同花順"
};
const suitCode = { "♠": "S", "♥": "H", "♦": "D", "♣": "C" };
const headers = [
  "排序", "故事 ID", "種子", "分類", "擊殺", "總押 x", "總派彩 x", "遊戲淨結果 x", "分類倍率",
  "BOSS HP", "剩餘 HP", "回合", "操作合計", "初始／自動／劇本保留", "劇本換牌操作", "各回合結果與雙方手牌",
  "完整重播稽核 JSON", "重播契約"
];

function clean(value) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function xml(value) {
  return clean(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function cardId(label) {
  const text = String(label || "");
  if (text.toUpperCase().includes("JOKER")) return "JOKER";
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

function rowValues(story, index) {
  const actionSummary = `戰${story.actions.fights}／棄${story.actions.folds}／和${story.actions.ties}／換${story.actions.totalDraws}（付${story.actions.paidDraws}／免${story.actions.freeDraws}）／手動${story.actions.manualAdjustments}`;
  const keepSummary = perRound(story, (round) => `初:${(round.initialCards || []).join(" ")}／自:${keptLabels(round, round.autoKeepCardIds) || "無"}／劇:${keptLabels(round, round.initialKeepCardIds) || "無"}`);
  const plannedOperations = perRound(story, (round) => (round.drawLog || []).map((draw, drawIndex) => {
    const keep = (draw.keepCardIds || []).join(",") || "無";
    const discarded = (draw.discardedCardIds || []).join(",") || "無";
    const accepted = (draw.acceptedCardIds || []).join(",") || "無";
    const nextKeep = (draw.nextKeepCardIds || []).join(",") || "無";
    return `D${drawIndex + 1}[留:${keep}／棄:${discarded}／補:${accepted}／下輪留:${nextKeep}／${draw.free ? "免費" : `費${draw.feeX}`}]`;
  }).join(" ") || "無換牌");
  const resultSummary = perRound(story, (round) => {
    const magic = (round.magicCards || []).map((card) => `${card.key}:${card.value}${card.target ? `→${card.target}` : ""}`).join(",") || "無";
    return `${handLabel[round.finalHand] || round.finalHand}〔${(round.finalCards || []).join(" ")}〕 ${round.action}/${round.result} 傷${round.damage || 0} HP${round.bossHpBefore ?? "—"}→${round.bossHpAfter ?? "—"}｜BOSS ${handLabel[round.bossHand] || round.bossHand}〔${(round.bossCards || []).join(" ")}〕｜魔法:${magic}`;
  });
  const fullReplayAudit = JSON.stringify({
    actions: story.actions,
    terminationReason: story.terminationReason,
    magicCounts: story.magicCounts,
    decisionMetrics: story.decisionMetrics,
    path: story.path
  });
  if (fullReplayAudit.length > 32767) throw new Error(`${story.id} 完整稽核超過 Excel 單格上限`);
  const replayContract = `seed=${story.seed}／${story.plannerVersion || "boss-plan-v10"}／story-action-trace-v1／deviation-suppression-v2-separate-tables`;
  return [
    index + 1, story.id, story.seed, classLabel[story.classKey], story.killed ? "是" : "否",
    story.spendX, story.payoutX, story.netX, story.payoutX / Math.max(story.spendX, Number.EPSILON),
    story.hp, story.hpLeft, story.rounds, actionSummary, keepSummary, plannedOperations, resultSummary,
    fullReplayAudit, replayContract
  ];
}

function ref(column, row) {
  return `${String.fromCharCode(64 + column)}${row}`;
}

function stringCell(reference, value, style = 0) {
  return `<c r="${reference}"${style ? ` s="${style}"` : ""} t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

function numberCell(reference, value, style = 0) {
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
  return `<c r="${reference}"${style ? ` s="${style}"` : ""}><v>${safe}</v></c>`;
}

function formulaCell(reference, formula, cached, style = 0) {
  return `<c r="${reference}"${style ? ` s="${style}"` : ""}><f>${xml(formula)}</f><v>${Number(cached) || 0}</v></c>`;
}

async function write(stream, text) {
  if (!stream.write(text)) await once(stream, "drain");
}

function blankStats(star) {
  return { star, count: 0, kills: 0, classCounts: { win: 0, push: 0, lose: 0 }, spend: 0, payout: 0, returnX: 0, net: 0, redrawStories: 0 };
}

function updateStats(stats, story) {
  stats.count += 1;
  stats.kills += story.killed ? 1 : 0;
  stats.classCounts[story.classKey] += 1;
  stats.spend += Number(story.spendX) || 0;
  stats.payout += Number(story.payoutX) || 0;
  stats.returnX += Number(story.payoutX) / Math.max(Number(story.spendX), Number.EPSILON);
  stats.net += Number(story.netX) || 0;
  stats.redrawStories += Number(story.actions?.totalDraws || 0) > 0 ? 1 : 0;
}

const sheetPrefix = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:R30004"/><sheetViews><sheetView workbookViewId="0"><pane xSplit="4" ySplit="4" topLeftCell="E5" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="10" customWidth="1"/><col min="2" max="2" width="24" customWidth="1"/><col min="3" max="12" width="11" customWidth="1"/><col min="13" max="16" width="42" customWidth="1"/><col min="17" max="17" width="80" customWidth="1"/><col min="18" max="18" width="48" customWidth="1"/></cols><sheetData>`;

async function buildStarSheet(star) {
  const file = path.join(packageDir, "xl", "worksheets", `sheet${star + 1}.xml`);
  const stream = fs.createWriteStream(file, { encoding: "utf8" });
  const stats = blankStats(star);
  await write(stream, sheetPrefix);
  await write(stream, `<row r="1" ht="34" customHeight="1">${stringCell("A1", `${star} 星 BOSS｜逐利型聰明玩家 30,000 局（贏多→贏少→輸、同類淨結果由高到低）`, 1)}</row>`);
  await write(stream, `<row r="2">${stringCell("A2", "每筆為固定種子的實際合法重播；完整稽核 JSON 保存逐回合雙方手牌、保留、棄牌、補牌、魔法值、決策與結果。", 2)}</row>`);
  await write(stream, `<row r="4" ht="40" customHeight="1">${headers.map((value, index) => stringCell(ref(index + 1, 4), value, 3)).join("")}</row>`);
  let outputIndex = 0;
  for (const classKey of classKeys) {
    const inputFile = path.join(root, "reports", "story-detail-parts-v10", `star-${star}-${classKey}.json`);
    const stories = JSON.parse(await fsp.readFile(inputFile, "utf8"));
    if (stories.length !== 10000) throw new Error(`${star} 星 ${classKey} 不是 10,000 筆`);
    stories.sort((left, right) => Number(right.netX) - Number(left.netX) || Number(left.seed) - Number(right.seed));
    for (const story of stories) {
      const returnX = Number(story.payoutX) / Math.max(Number(story.spendX), Number.EPSILON);
      const replayClass = returnX >= 3 ? "win" : returnX >= 1 ? "push" : "lose";
      if (story.classKey !== classKey || replayClass !== classKey) throw new Error(`${story.id} 分類重播不一致`);
      const values = rowValues(story, outputIndex);
      const row = outputIndex + 5;
      const classStyle = classKey === "win" ? 4 : classKey === "push" ? 5 : 6;
      const cells = [];
      for (let column = 1; column <= values.length; column += 1) {
        const reference = ref(column, row);
        if (column === 8) cells.push(formulaCell(reference, `G${row}-F${row}`, values[7], 7));
        else if (column === 9) cells.push(formulaCell(reference, `IFERROR(G${row}/F${row},0)`, values[8], 7));
        else if ([1, 3, 6, 7, 10, 11, 12].includes(column)) cells.push(numberCell(reference, values[column - 1], [6, 7].includes(column) ? 7 : 0));
        else cells.push(stringCell(reference, values[column - 1], column === 4 ? classStyle : 0));
      }
      await write(stream, `<row r="${row}">${cells.join("")}</row>`);
      updateStats(stats, story);
      outputIndex += 1;
    }
  }
  if (outputIndex !== 30000 || classKeys.some((key) => stats.classCounts[key] !== 10000)) throw new Error(`${star} 星明細數量不正確`);
  await write(stream, `</sheetData><mergeCells count="2"><mergeCell ref="A1:R1"/><mergeCell ref="A2:R2"/></mergeCells><autoFilter ref="A4:R30004"/><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`);
  stream.end();
  await once(stream, "finish");
  return stats;
}

function summaryRowXml(stats, row) {
  const s = `'${stats.star}星'`;
  const avgSpend = stats.spend / stats.count;
  const avgPayout = stats.payout / stats.count;
  const avgReturn = stats.returnX / stats.count;
  const avgNet = stats.net / stats.count;
  return `<row r="${row}">${stringCell(`A${row}`, `${stats.star}星`)}${formulaCell(`B${row}`, `COUNTA(${s}!$B$5:$B$30004)`, stats.count)}${formulaCell(`C${row}`, `COUNTIF(${s}!$E$5:$E$30004,"是")`, stats.kills)}${formulaCell(`D${row}`, `C${row}/B${row}`, stats.kills / stats.count, 8)}${formulaCell(`E${row}`, `COUNTIF(${s}!$D$5:$D$30004,"贏多")`, 10000)}${formulaCell(`F${row}`, `COUNTIF(${s}!$D$5:$D$30004,"贏少")`, 10000)}${formulaCell(`G${row}`, `COUNTIF(${s}!$D$5:$D$30004,"輸")`, 10000)}${formulaCell(`H${row}`, `AVERAGE(${s}!$F$5:$F$30004)`, avgSpend, 7)}${formulaCell(`I${row}`, `AVERAGE(${s}!$G$5:$G$30004)`, avgPayout, 7)}${formulaCell(`J${row}`, `AVERAGE(${s}!$I$5:$I$30004)`, avgReturn, 7)}${formulaCell(`K${row}`, `AVERAGE(${s}!$H$5:$H$30004)`, avgNet, 7)}${numberCell(`L${row}`, stats.redrawStories)}${formulaCell(`M${row}`, `COUNTA(${s}!$Q$5:$Q$30004)`, stats.count)}${formulaCell(`N${row}`, `COUNTA(${s}!$R$5:$R$30004)`, stats.count)}</row>`;
}

async function buildSummarySheet(statsRows) {
  const total = statsRows.reduce((result, row) => {
    for (const key of Object.keys(result)) if (key !== "classCounts") result[key] += Number(row[key] || 0);
    for (const key of classKeys) result.classCounts[key] += row.classCounts[key];
    return result;
  }, { count: 0, kills: 0, classCounts: { win: 0, push: 0, lose: 0 }, spend: 0, payout: 0, returnX: 0, net: 0, redrawStories: 0 });
  const rows = [];
  rows.push(`<row r="1" ht="34" customHeight="1">${stringCell("A1", "Boss Duel｜逐利型聰明玩家劇情總覽（8 星 × 30,000 局）", 1)}</row>`);
  rows.push(`<row r="2">${stringCell("A2", "版本：frontend-v87／action-tree-v31／boss-plan-v10／arrange-v9／natural-story-preset-v10；24 個結果資料格各 10,000；同一 X 倍數劇本通用所有 Bet。", 2)}</row>`);
  const summaryHeaders = ["星級", "故事數", "擊殺", "擊殺率", "贏多", "贏少", "輸", "平均總押", "平均總派彩", "平均倍率", "平均淨結果", "有換牌故事", "完整稽核", "重播契約"];
  rows.push(`<row r="4" ht="40" customHeight="1">${summaryHeaders.map((value, index) => stringCell(ref(index + 1, 4), value, 3)).join("")}</row>`);
  statsRows.forEach((stats, index) => rows.push(summaryRowXml(stats, index + 5)));
  rows.push(`<row r="13">${stringCell("A13", "合計／加權", 2)}${formulaCell("B13", "SUM(B5:B12)", total.count)}${formulaCell("C13", "SUM(C5:C12)", total.kills)}${formulaCell("D13", "C13/B13", total.kills / total.count, 8)}${formulaCell("E13", "SUM(E5:E12)", total.classCounts.win)}${formulaCell("F13", "SUM(F5:F12)", total.classCounts.push)}${formulaCell("G13", "SUM(G5:G12)", total.classCounts.lose)}${formulaCell("H13", "SUMPRODUCT(H5:H12,B5:B12)/B13", total.spend / total.count, 7)}${formulaCell("I13", "SUMPRODUCT(I5:I12,B5:B12)/B13", total.payout / total.count, 7)}${formulaCell("J13", "SUMPRODUCT(J5:J12,B5:B12)/B13", total.returnX / total.count, 7)}${formulaCell("K13", "SUMPRODUCT(K5:K12,B5:B12)/B13", total.net / total.count, 7)}${formulaCell("L13", "SUM(L5:L12)", total.redrawStories)}${formulaCell("M13", "SUM(M5:M12)", total.count)}${formulaCell("N13", "SUM(N5:N12)", total.count)}</row>`);
  rows.push(`<row r="16">${stringCell("A16", "分類", 3)}${stringCell("B16", "正式界線", 3)}${stringCell("C16", "說明", 3)}</row>`);
  rows.push(`<row r="17">${stringCell("A17", "贏多", 4)}${stringCell("B17", "總派彩 ÷ 總押 ≥ 3x")}${stringCell("C17", "每星固定 10,000 個自然結果")}</row>`);
  rows.push(`<row r="18">${stringCell("A18", "贏少", 5)}${stringCell("B18", "1x ≤ 總派彩 ÷ 總押 < 3x")}${stringCell("C18", "每星固定 10,000 個自然結果")}</row>`);
  rows.push(`<row r="19">${stringCell("A19", "輸", 6)}${stringCell("B19", "總派彩 ÷ 總押 < 1x")}${stringCell("C19", "每星固定 10,000 個自然結果")}</row>`);
  rows.push(`<row r="21">${stringCell("A21", "重播內容", 3)}${stringCell("B21", "初始手牌、每次保留／棄牌／補牌、雙方最終手牌、魔法卡值、玩家／劇本操作、結果與重播契約")}</row>`);
  const source = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:N21"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="14" customWidth="1"/><col min="2" max="14" width="16" customWidth="1"/></cols><sheetData>${rows.join("")}</sheetData><mergeCells count="3"><mergeCell ref="A1:N1"/><mergeCell ref="A2:N2"/><mergeCell ref="B21:N21"/></mergeCells><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`;
  await fsp.writeFile(path.join(packageDir, "xl", "worksheets", "sheet1.xml"), source, "utf8");
  return total;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="0.00x"/><numFmt numFmtId="165" formatCode="0.0%"/></numFmts><fonts count="4"><font><sz val="10"/><name val="Microsoft JhengHei"/></font><font><b/><color rgb="FFFFF4D6"/><sz val="18"/><name val="Microsoft JhengHei"/></font><font><i/><color rgb="FF1D1113"/><sz val="10"/><name val="Microsoft JhengHei"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Microsoft JhengHei"/></font></fonts><fills count="8"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF351217"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF4D6"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1D1113"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDBEAFE"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFEE2E2"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="9"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment wrapText="1"/></xf><xf numFmtId="0" fontId="3" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="5" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="6" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="7" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

async function writePackageMetadata() {
  const sheetNames = ["總覽", "1星", "2星", "3星", "4星", "5星", "6星", "7星", "8星"];
  const overrides = Array.from({ length: 9 }, (_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  await fsp.writeFile(path.join(packageDir, "[Content_Types].xml"), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`, "utf8");
  await fsp.writeFile(path.join(packageDir, "_rels", ".rels"), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`, "utf8");
  await fsp.writeFile(path.join(packageDir, "xl", "workbook.xml"), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews><sheets>${sheetNames.map((name, index) => `<sheet name="${xml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets><calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1" calcMode="auto"/></workbook>`, "utf8");
  await fsp.writeFile(path.join(packageDir, "xl", "_rels", "workbook.xml.rels"), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${Array.from({ length: 9 }, (_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}<Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`, "utf8");
  await fsp.writeFile(path.join(packageDir, "xl", "styles.xml"), stylesXml(), "utf8");
  const now = new Date().toISOString();
  await fsp.writeFile(path.join(packageDir, "docProps", "core.xml"), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Boss Duel 逐利型玩家劇情 240000</dc:title><dc:creator>OpenAI Codex</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`, "utf8");
  await fsp.writeFile(path.join(packageDir, "docProps", "app.xml"), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft Excel Compatible</Application><TitlesOfParts><vt:vector size="9" baseType="lpstr">${sheetNames.map((name) => `<vt:lpstr>${xml(name)}</vt:lpstr>`).join("")}</vt:vector></TitlesOfParts></Properties>`, "utf8");
}

async function createXlsxArchive() {
  await fsp.rm(outputPath, { force: true });
  const command = [
    "Add-Type -AssemblyName System.IO.Compression",
    "Add-Type -AssemblyName System.IO.Compression.FileSystem",
    "$source = $env:BOSS_DUEL_XLSX_PACKAGE.TrimEnd([char]92) + [char]92",
    "$archive = [System.IO.Compression.ZipFile]::Open($env:BOSS_DUEL_XLSX_OUTPUT, [System.IO.Compression.ZipArchiveMode]::Create)",
    "try {",
    "  Get-ChildItem -LiteralPath $source -File -Recurse | ForEach-Object {",
    "    $entryName = $_.FullName.Substring($source.Length).Replace([char]92, [char]47)",
    "    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $_.FullName, $entryName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null",
    "  }",
    "} finally {",
    "  $archive.Dispose()",
    "}"
  ].join("\n");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    cwd: root,
    env: {
      ...process.env,
      BOSS_DUEL_XLSX_PACKAGE: packageDir,
      BOSS_DUEL_XLSX_OUTPUT: outputPath
    },
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`XLSX 封裝失敗：${result.stderr || result.stdout || `exit ${result.status}`}`);
  const archive = await fsp.stat(outputPath);
  if (!archive.isFile() || archive.size === 0) throw new Error("XLSX 封裝沒有產生有效檔案");
  return archive.size;
}

async function run() {
  await fsp.mkdir(path.join(packageDir, "_rels"), { recursive: true });
  await fsp.mkdir(path.join(packageDir, "docProps"), { recursive: true });
  await fsp.mkdir(path.join(packageDir, "xl", "_rels"), { recursive: true });
  await fsp.mkdir(path.join(packageDir, "xl", "worksheets"), { recursive: true });
  await fsp.mkdir(previewDir, { recursive: true });
  await writePackageMetadata();
  const stats = [];
  for (let star = 1; star <= 8; star += 1) {
    const row = await buildStarSheet(star);
    stats.push(row);
    process.stdout.write(JSON.stringify({ phase: "sheet", star, count: row.count }) + "\n");
  }
  const total = await buildSummarySheet(stats);
  const archiveBytes = await createXlsxArchive();
  const qa = {
    outputPath, packageDir, previewDir,
    sheets: ["總覽", "1星", "2星", "3星", "4星", "5星", "6星", "7星", "8星"],
    stories: total.count,
    cells: 24,
    storiesPerCell: 10000,
    archiveBytes,
    stats
  };
  await fsp.writeFile(path.join(previewDir, "streaming-qa.json"), JSON.stringify(qa, null, 2) + "\n", "utf8");
  process.stdout.write(JSON.stringify({ phase: "package-ready", ...qa }, null, 2));
}

run().catch((error) => {
  process.stderr.write(error.stack || error.message);
  process.exitCode = 1;
});
