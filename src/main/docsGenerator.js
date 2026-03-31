const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const { PDFDocument } = require("pdf-lib");

const { PATHS, CHECKLIST_FIELDS } = require("../shared/constants");
const {
  cleanText,
  safeFileName,
  ensureDirSync,
  toPosixPath,
} = require("./utils");

const IDNR_LABELS = new Set(["idnr", "idnummer", "id"]);
const SERIEN_LABELS = new Set(["seriennr", "seriennummer", "sn", "serialno", "serialnr", "seriennrn", "serienno", "seriennbr"]);
const TECHNIKER_LABELS = new Set(["techniker", "tech", "servicetechniker", "mitarbeiter"]);
const GERAET_LABELS = new Set(["gerätetyp", "geratetyp", "geraetetyp", "devicetype", "type", "modell", "model"]);

const MIN_SCORE = 4;
const MIN_SCORE_CK = 4;

function listFiles(dir, extension) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith(extension.toLowerCase()))
    .map((name) => path.join(dir, name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b), "de", { sensitivity: "base" }));
}

function scoreMatch(modell, templateFilePath) {
  const stem = path.parse(templateFilePath).name;
  const modellTokens = new Set((modell.toLowerCase().match(/[A-Za-z0-9]+/g) || []));
  const fileTokens = new Set((stem.toLowerCase().match(/[A-Za-z0-9]+/g) || []));

  let score = 0;
  for (const tok of modellTokens) {
    if (tok.length < 2) {
      continue;
    }

    if (fileTokens.has(tok)) {
      score += tok.length ** 2;
      continue;
    }

    for (const ftok of fileTokens) {
      if (tok.length >= 3 && ftok.length >= 3 && (ftok.includes(tok) || tok.includes(ftok))) {
        score += Math.min(tok.length, ftok.length);
      }
    }
  }

  return score;
}

function findBoardkarteTemplate(modell) {
  const templates = listFiles(PATHS.boardcardsDir, ".xlsx");
  if (templates.length === 0) {
    return { best: null, scored: [] };
  }

  const scored = templates.map((f) => ({ score: scoreMatch(modell, f), file: f }));
  scored.sort((a, b) => b.score - a.score);
  if (scored[0].score < MIN_SCORE) {
    return { best: null, scored };
  }

  return { best: scored[0].file, scored };
}

function modellkern(stem) {
  for (const prefix of ["Taskalfa_", "TASKalfa_", "TASKALFA_", "Ecosys_", "ECOSYS_", "Kyocera_", "KYOCERA_"]) {
    if (stem.startsWith(prefix)) {
      return stem.slice(prefix.length);
    }
  }
  const parts = stem.split("_", 2);
  if (parts.length > 1) {
    return parts[1];
  }
  return stem;
}

function cleanModelSpacing(value) {
  let text = String(value ?? "");
  text = text.replace(/\s*([/-])\s*/g, "$1");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

function normalizeModelText(value) {
  let text = cleanModelSpacing(value).replace(/_/g, " ");
  text = text.replace(/\bKYOCERA\b\s*/gi, "");
  text = text.replace(/\bTASKALFA\b/gi, "TASKalfa");
  text = text.replace(/\bECOSYS\b/gi, "Ecosys");
  text = text.replace(/\b([A-Z]{1,4}\d{3,5})([A-Z]{1,6})\b/g, (_m, p1, p2) => `${p1}${p2.toLowerCase()}`);
  return text.replace(/\s+/g, " ").trim().replace(/^[\s\-/]+|[\s\-/]+$/g, "");
}

function splitBrandTail(value) {
  const text = normalizeModelText(value);
  const parts = text.split(" ", 2);
  if (parts.length === 2 && /\d/.test(parts[1])) {
    return { brand: parts[0], tail: parts[1] };
  }
  return { brand: "", tail: text };
}

function looksLikeMultiModel(value) {
  const text = normalizeModelText(value);
  const tail = splitBrandTail(text).tail;
  if (/\d{3,5}[A-Za-z]*\s*[-/]\s*[A-Za-z]*\d{3,5}/.test(tail)) {
    return true;
  }
  if (tail.includes("/") || tail.includes(",") || tail.includes(" und ") || tail.includes(" or ")) {
    const modelish = tail.match(/[A-Za-z]*\d{3,5}[A-Za-z]*/gi) || [];
    if (modelish.length >= 2) {
      return true;
    }
  }
  return false;
}

function resolveActualDeviceText(inputModel, boardModel = "", templateHint = "") {
  const inputText = normalizeModelText(inputModel);
  const boardText = normalizeModelText(boardModel || inputModel);
  const templateText = normalizeModelText(templateHint || "");

  if (!boardText) {
    return inputText;
  }

  // Guard against placeholder/header artifacts like "Geraetetyp:".
  const boardNorm = boardText.toLowerCase().replace(/[\s:._-]/g, "");
  if (!/\d/.test(boardText) || boardNorm === "geraetetyp" || boardNorm === "device") {
    return inputText || boardText;
  }

  if (looksLikeMultiModel(boardText) || looksLikeMultiModel(templateText)) {
    return inputText || boardText;
  }

  return boardText || inputText;
}

function findChecklisteTemplate(boardkartenStem) {
  const templates = listFiles(PATHS.checklistsDir, ".pdf");
  if (templates.length === 0) {
    return { best: null, scored: [] };
  }

  const kern = modellkern(boardkartenStem);
  const scored = templates.map((f) => ({ score: scoreMatch(kern, f), file: f }));
  scored.sort((a, b) => b.score - a.score);
  if (scored[0].score < MIN_SCORE_CK) {
    return { best: null, scored };
  }

  return { best: scored[0].file, scored };
}

function normLabel(value) {
  return String(value ?? "").replace(/[\s:.\-/]/g, "").toLowerCase();
}

function parseSharedStrings(xmlText) {
  const strings = [];
  const siMatches = xmlText.match(/<si[\s\S]*?<\/si>/g) || [];
  for (const si of siMatches) {
    const tMatches = [...si.matchAll(/<t(?:\s+[^>]*)?>([\s\S]*?)<\/t>/g)];
    let value = "";
    for (const t of tMatches) {
      value += decodeXml(t[1] || "");
    }
    strings.push(value);
  }
  return strings;
}

function colToNum(col) {
  let num = 0;
  for (const ch of col.toUpperCase()) {
    num = num * 26 + (ch.charCodeAt(0) - 64);
  }
  return num;
}

function numToCol(n) {
  let num = n;
  let out = "";
  while (num > 0) {
    const r = (num - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    num = Math.floor((num - 1) / 26);
  }
  return out;
}

function decodeXml(value) {
  return String(value ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function extractCellValue(cellXml, sharedStrings) {
  const typeMatch = cellXml.match(/\bt="([^"]*)"/);
  const type = typeMatch ? typeMatch[1] : "";

  if (type === "s") {
    const vm = cellXml.match(/<v>([^<]*)<\/v>/);
    if (vm) {
      const idx = Number(vm[1]);
      if (Number.isFinite(idx) && idx >= 0 && idx < sharedStrings.length) {
        return sharedStrings[idx];
      }
    }
    return null;
  }

  if (type === "inlineStr") {
    const tm = cellXml.match(/<t(?:\s+[^>]*)?>([\s\S]*?)<\/t>/);
    return tm ? decodeXml(tm[1]) : null;
  }

  const vm = cellXml.match(/<v>([^<]*)<\/v>/);
  return vm ? decodeXml(vm[1]) : null;
}

function findFields(sheetXmlText, sharedStrings) {
  const found = {};

  function pickRightmost(key, cellRef, colNum) {
    const cur = found[key];
    if (!cur || colNum > cur.colNum) {
      found[key] = { ref: cellRef, colNum };
    }
  }
  const rowMatches = [...sheetXmlText.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)];

  for (const rowMatch of rowMatches) {
    const rowNum = rowMatch[1];
    const rowXml = rowMatch[2] || "";
    const cellMatches = [...rowXml.matchAll(/<c\b[^>]*\br="([A-Z]+\d+)"[^>]*\/>|<c\b[^>]*\br="([A-Z]+\d+)"[^>]*>([\s\S]*?)<\/c>/g)];

    for (const cm of cellMatches) {
      const cellRef = cm[1] || cm[2] || "";
      if (!cellRef) {
        continue;
      }

      const fullCellXml = cm[0];
      const colRef = cellRef.replace(/\d/g, "");
      const cellValue = extractCellValue(fullCellXml, sharedStrings);
      if (cellValue == null) {
        continue;
      }

      const normalized = normLabel(cellValue);
      const nextCol = numToCol(colToNum(colRef) + 1);
      const nextRef = `${nextCol}${rowNum}`;
      const nextColNum = colToNum(nextCol);

      if (IDNR_LABELS.has(normalized)) {
        pickRightmost("idnr", nextRef, nextColNum);
      } else if (SERIEN_LABELS.has(normalized)) {
        pickRightmost("seriennr", nextRef, nextColNum);
      } else if (TECHNIKER_LABELS.has(normalized)) {
        pickRightmost("techniker", nextRef, nextColNum);
      } else if (GERAET_LABELS.has(normalized)) {
        pickRightmost("geraetetyp_ref", nextRef, nextColNum);
      }
    }
  }

  return {
    idnr: found.idnr?.ref,
    seriennr: found.seriennr?.ref,
    techniker: found.techniker?.ref,
    geraetetyp_ref: found.geraetetyp_ref?.ref,
  };
}

function setCellValue(sheetXml, cellRef, value) {
  const escaped = escapeXml(value);
  const refEscaped = cellRef.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const selfClosePattern = new RegExp(`<c([^>]*)\\br=\"${refEscaped}\"([^>]*)\\/>`, "g");
  let replaced = false;
  let newXml = sheetXml.replace(selfClosePattern, (full, p1, p2) => {
    replaced = true;
    const styleMatch = full.match(/\bs="([^"]*)"/);
    const sAttr = styleMatch ? ` s="${styleMatch[1]}"` : "";
    return `<c r="${cellRef}"${sAttr} t="inlineStr"><is><t>${escaped}</t></is></c>`;
  });
  if (replaced) {
    return newXml;
  }

  const contentPattern = new RegExp(`<c\\b(?=[^>]*\\br=\"${refEscaped}\")(?![^>]*\\/>)((?:[^>])*)>[\\s\\S]*?<\\/c>`, "g");
  newXml = sheetXml.replace(contentPattern, (full, attrs) => {
    replaced = true;
    const cleanAttrs = String(attrs).replace(/\s+t="[^"]*"/g, "");
    return `<c${cleanAttrs} t="inlineStr"><is><t>${escaped}</t></is></c>`;
  });
  if (replaced) {
    return newXml;
  }

  const sharedPattern = new RegExp(`<c\\b([^>]*\\br=\"${refEscaped}\"[^>]*)\\bt="s"([^>]*)><v>[^<]*<\\/v><\\/c>`, "g");
  newXml = sheetXml.replace(sharedPattern, (_full, p1, p2) => {
    replaced = true;
    const attrs = `${p1}${p2}`.replace(/\s+t="[^"]*"/g, "");
    return `<c${attrs} t="inlineStr"><is><t>${escaped}</t></is></c>`;
  });
  if (replaced) {
    return newXml;
  }

  const cellMatch = cellRef.match(/^([A-Z]+)(\d+)$/);
  if (!cellMatch) {
    return sheetXml;
  }

  const [, colLetters, rowNum] = cellMatch;
  const rowPattern = new RegExp(`(<row\\b[^>]*\\br=\"${rowNum}\"[^>]*>)([\\s\\S]*?)(<\\/row>)`, "g");
  return sheetXml.replace(rowPattern, (_full, head, rowContent, tail) => {
    const cellTags = [...String(rowContent).matchAll(/<c\b[^>]*\br="([A-Z]+)\d+"[^>]*\/>|<c\b[^>]*\br="([A-Z]+)\d+"[^>]*>[\s\S]*?<\/c>/g)];

    let insertAt = rowContent.length;
    let styleAttr = "";

    for (const tag of cellTags) {
      const fullTag = tag[0];
      const col = tag[1] || tag[2] || "";
      if (col && col > colLetters) {
        insertAt = tag.index ?? rowContent.length;
        const sm = fullTag.match(/\bs="([^"]*)"/);
        if (sm) {
          styleAttr = ` s="${sm[1]}"`;
        }
        break;
      }
    }

    if (!styleAttr && cellTags.length > 0) {
      const lastTag = cellTags[cellTags.length - 1][0];
      const sm = lastTag.match(/\bs="([^"]*)"/);
      if (sm) {
        styleAttr = ` s="${sm[1]}"`;
      }
    }

    const insertCell = `<c r="${cellRef}"${styleAttr} t="inlineStr"><is><t>${escaped}</t></is></c>`;
    return head + rowContent.slice(0, insertAt) + insertCell + rowContent.slice(insertAt) + tail;
  });
}

function readBoardZip(templatePath) {
  const zip = new AdmZip(templatePath);
  const entries = zip.getEntries();
  const data = {};
  for (const entry of entries) {
    data[entry.entryName] = entry.getData();
  }
  return data;
}

function writeZip(outputPath, entries) {
  const zip = new AdmZip();
  for (const [name, buf] of Object.entries(entries)) {
    zip.addFile(name, Buffer.isBuffer(buf) ? buf : Buffer.from(buf));
  }
  zip.writeZip(outputPath);
}

function readGeraetetypFromBoardkarte(templatePath) {
  const all = readBoardZip(templatePath);
  if (!all["xl/sharedStrings.xml"] || !all["xl/worksheets/sheet1.xml"]) {
    return null;
  }

  const shared = parseSharedStrings(all["xl/sharedStrings.xml"].toString("utf8"));
  const sheetXml = all["xl/worksheets/sheet1.xml"].toString("utf8");
  const fields = findFields(sheetXml, shared);

  if (!fields.geraetetyp_ref) {
    return null;
  }

  const refEscaped = fields.geraetetyp_ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const cellPattern = new RegExp(`<c\\b[^>]*\\br=\"${refEscaped}\"[^>]*/>|<c\\b[^>]*\\br=\"${refEscaped}\"[^>]*>[\\s\\S]*?<\\/c>`, "g");
  const cell = sheetXml.match(cellPattern);
  if (!cell || cell.length === 0) {
    return null;
  }

  return extractCellValue(cell[0], shared);
}

function fillBoardkarte(templatePath, idnr, seriennr, techniker, outputPath, geraetetypText = "") {
  const all = readBoardZip(templatePath);

  const sharedXml = all["xl/sharedStrings.xml"] ? all["xl/sharedStrings.xml"].toString("utf8") : "";
  const sheetXmlRaw = all["xl/worksheets/sheet1.xml"] ? all["xl/worksheets/sheet1.xml"].toString("utf8") : "";
  if (!sharedXml || !sheetXmlRaw) {
    throw new Error("Boardkarten-Datei ist ungültig: sheet1/sharedStrings fehlen.");
  }

  const shared = parseSharedStrings(sharedXml);
  const fields = findFields(sheetXmlRaw, shared);

  let sheetXml = sheetXmlRaw;
  if (fields.idnr) {
    sheetXml = setCellValue(sheetXml, fields.idnr, idnr);
  }
  if (fields.seriennr) {
    sheetXml = setCellValue(sheetXml, fields.seriennr, seriennr);
  }
  if (techniker && fields.techniker) {
    sheetXml = setCellValue(sheetXml, fields.techniker, techniker);
  }
  if (geraetetypText && fields.geraetetyp_ref) {
    sheetXml = setCellValue(sheetXml, fields.geraetetyp_ref, geraetetypText);
  }

  all["xl/worksheets/sheet1.xml"] = Buffer.from(sheetXml, "utf8");
  writeZip(outputPath, all);
}

function fillLabel(idnr, modell, seriennr, outputPath, templatePath = null) {
  const tpl = templatePath || PATHS.labelTemplate;
  const all = readBoardZip(tpl);
  const docPath = "word/document.xml";
  if (!all[docPath]) {
    throw new Error("Label-Vorlage ist ungültig (word/document.xml fehlt).");
  }

  const modelText = cleanText(modell);
  const escapedModelText = escapeXml(modelText);
  let xml = all[docPath].toString("utf8");
  xml = xml.replace(/>18908</g, `>${escapeXml(idnr)}<`);
  xml = xml.replace(/>19D4X07224</g, `>${escapeXml(seriennr)}<`);

  // Legacy DOCX templates can split the model placeholder over two runs (e.g. "Ecosys" + "MA4000fx").
  // Remove leftover placeholder brand fragments and inject full model text.
  xml = xml.replace(/<w:p\b[\s\S]*?<\/w:p>/gi, (paragraphXml) => {
    if (!/(MA4000fx|Ecosys)/i.test(paragraphXml)) {
      return paragraphXml;
    }
    let out = paragraphXml.replace(/>\s*Ecosys\s*</gi, "><");
    out = out.replace(/>\s*MA4000fx\s*</gi, `>${escapedModelText}<`);
    return out;
  });

  // Fallback replacements when placeholders are not split in runs.
  xml = xml.replace(/>\s*MA4000fx\s*</gi, `>${escapedModelText}<`);
  xml = xml.replace(/Ecosys(?=\s*(TASKalfa|KYOCERA|Kyocera))/gi, "");

  all[docPath] = Buffer.from(xml, "utf8");
  writeZip(outputPath, all);
}

async function fillCheckliste(templatePath, idnr, seriennr, outputPath, mac = "") {
  const bytes = fs.readFileSync(templatePath);
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });

  const form = pdfDoc.getForm();
  const fields = form.getFields();
  const byName = {};
  for (const f of fields) {
    byName[f.getName()] = f;
  }

  const setText = (fieldName, value) => {
    const field = byName[fieldName];
    if (field && typeof field.setText === "function") {
      try {
        field.setText(String(value ?? ""));
      } catch (_) {
        // ignore
      }
    }
  };

  setText(CHECKLIST_FIELDS.idnr, idnr);
  setText(CHECKLIST_FIELDS.seriennr, seriennr);
  if (mac) {
    setText(CHECKLIST_FIELDS.mac, mac);
  }

  const out = await pdfDoc.save();
  fs.writeFileSync(outputPath, Buffer.from(out));
}

function resolveKLabelTemplate(hasKNummer) {
  if (!hasKNummer) {
    return null;
  }
  for (const p of PATHS.kLabelCandidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

async function generateDocuments({
  modell,
  idnr,
  seriennr,
  techniker = "",
  mac = "",
  outputDir = PATHS.outputDir,
  labelTemplateOverride = null,
  createOptions = null,
}) {
  ensureDirSync(outputDir);

  const create = {
    label: createOptions?.label !== false,
    board: createOptions?.board !== false,
    checklist: createOptions?.checklist !== false,
  };
  if (!create.label && !create.board && !create.checklist) {
    throw new Error("Es wurde kein Dokumenttyp für die Erstellung ausgewählt.");
  }

  const safe = `${idnr}_${safeFileName(modell)}`;
  const needsBoardTemplate = !!(create.board || create.checklist);
  const { best: boardTemplate, scored: boardScores } = needsBoardTemplate
    ? findBoardkarteTemplate(modell)
    : { best: null, scored: [] };
  if (needsBoardTemplate && !boardTemplate) {
    const available = listFiles(PATHS.boardcardsDir, ".xlsx").map((p) => path.basename(p));
    throw new Error(
      `Keine passende Vorlage für '${modell}'. Vorlagen im boardkarten/-Ordner: ${available.length ? available.join(", ") : "(leer!)"}`,
    );
  }

  const boardPath = create.board ? path.join(outputDir, `Boardkarte_${safe}.xlsx`) : null;
  const labelPath = create.label ? path.join(outputDir, `Label_${safe}.docx`) : null;

  const boardDeviceText = boardTemplate ? readGeraetetypFromBoardkarte(boardTemplate) : "";
  // For generated docs we must preserve the exact model text coming from Lager/input.
  const preferredDeviceText = cleanText(modell);
  const actualDeviceText = preferredDeviceText || resolveActualDeviceText(modell, boardDeviceText || modell, boardTemplate ? path.parse(boardTemplate).name : "");

  if (create.board && boardTemplate && boardPath) {
    fillBoardkarte(boardTemplate, idnr, seriennr, techniker, boardPath, actualDeviceText);
  }
  if (create.label && labelPath) {
    fillLabel(idnr, actualDeviceText, seriennr, labelPath, labelTemplateOverride);
  }

  let checklistPath = null;
  const checklistQuery = boardTemplate ? path.parse(boardTemplate).name : modell;
  const { best: checklistTemplate } = create.checklist ? findChecklisteTemplate(checklistQuery) : { best: null };
  if (create.checklist && checklistTemplate) {
    checklistPath = path.join(outputDir, `Checkliste_${safe}.pdf`);
    await fillCheckliste(checklistTemplate, idnr, seriennr, checklistPath, mac || "");
  }

  return {
    boardPath,
    labelPath,
    checklistPath,
    boardTemplate,
    boardScores,
    actualDeviceText,
    boardDeviceText,
  };
}

function prettifyModelName(value) {
  let text = cleanText(value).replace(/_/g, " ");
  text = text.replace(/\bKYOCERA\b\s*/gi, "");
  text = text.replace(/\bTASKALFA\b/gi, "TASKalfa");
  text = text.replace(/\bECOSYS\b/gi, "Ecosys");
  text = text.replace(/\s+/g, " ").trim();
  text = text.replace(/\b([A-Z]{1,4}\d{3,5})([A-Z]{1,6})\b/g, (_m, p1, p2) => `${p1}${p2.toLowerCase()}`);
  return text;
}

function modelKey(value) {
  return cleanText(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function deriveModelFromBoardTemplate(templateStem, queryText = "") {
  const stem = prettifyModelName(templateStem);
  const parts = stem.split(" ", 2);
  if (parts.length !== 2) {
    return stem;
  }

  const brand = parts[0];
  const tail = parts[1];
  const variants = tail.split("-").map((v) => v.trim()).filter(Boolean);
  if (variants.length === 0) {
    return stem;
  }

  const queryDigits = (cleanText(queryText).match(/\d{3,5}/g) || []);
  let chosen = variants[variants.length - 1];

  if (queryDigits.length > 0) {
    for (const variant of variants) {
      const key = modelKey(variant);
      if (queryDigits.some((d) => key.includes(d))) {
        chosen = variant;
        break;
      }
    }
  }

  if (/^\d/.test(chosen)) {
    const pm = variants[0].match(/^[A-Za-z]+/);
    if (pm) {
      chosen = `${pm[0]}${chosen}`;
    }
  }

  return `${brand} ${chosen}`.trim();
}

function buildModelOptions(lagerIndex) {
  const options = [];
  const seen = new Set();

  const idnrMap = lagerIndex?.idnr || {};
  Object.values(idnrMap).forEach((list) => {
    for (const rec of list) {
      const modell = prettifyModelName(rec.modell || "");
      const key = modelKey(modell);
      if (modell && key && !seen.has(key)) {
        seen.add(key);
        options.push(modell);
      }
    }
  });

  for (const templatePath of listFiles(PATHS.boardcardsDir, ".xlsx")) {
    const model = deriveModelFromBoardTemplate(path.parse(templatePath).name);
    const key = modelKey(model);
    if (model && key && !seen.has(key)) {
      seen.add(key);
      options.push(model);
    }
  }

  options.sort((a, b) => a.localeCompare(b, "de", { sensitivity: "base" }));
  return options;
}

module.exports = {
  scoreMatch,
  findBoardkarteTemplate,
  findChecklisteTemplate,
  resolveActualDeviceText,
  generateDocuments,
  fillBoardkarte,
  fillLabel,
  fillCheckliste,
  readGeraetetypFromBoardkarte,
  resolveKLabelTemplate,
  buildModelOptions,
  prettifyModelName,
  modelKey,
  deriveModelFromBoardTemplate,
};
