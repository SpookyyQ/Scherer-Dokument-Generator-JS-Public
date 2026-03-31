
/* global window, document */

const state = {
  settings: {},
  lagerData: { exact: {}, suffix: {}, idnr: {} },
  lagerSource: null,
  printers: [],
  modelOptions: [],
  templates: { board: [], check: [], labels: [] },
  outputDir: "",
  hasKNummer: false,
  lastMissingIdnr: null,
  jobHistory: [],
  deviceCache: new Map(),
  queuePending: [],
  queueTotal: 0,
  queueDone: 0,
  queueErrors: 0,
  generationInProgress: false,
  selectedDeviceDialog: null,
  bgAnimEnabled: false,
  bgPreset: "current",
  darkMode: true,
  accentColor: "#ff3b30",
  jobOptions: {
    createLabel: true,
    createBoard: true,
    createChecklist: true,
    printLabel: true,
    printBoard: true,
    printChecklist: true,
  },
};

const el = {};

function cleanText(value) { return String(value ?? "").trim().replace(/^'+|'+$/g, "").trim(); }
function normSeriennummer(value) { return cleanText(value).toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function normIdnr(value) { return cleanText(value).replace(/\D/g, ""); }

function nowString() {
  const d = new Date();
  const pad = (v) => String(v).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatMtime(ms) {
  const d = new Date(ms);
  const pad = (v) => String(v).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escapeHtml(v) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function toast(title, message, kind = "info", holdMs = 3000) {
  const node = document.createElement("div");
  node.className = `toast ${kind}`;
  node.innerHTML = `<div class="title">${escapeHtml(title)}</div><div>${escapeHtml(message)}</div>`;
  el.toastHost.appendChild(node);
  setTimeout(() => node.remove(), holdMs);
}

function setBusy(active, message = "") {
  el.busyOverlay.classList.toggle("hidden", !active);
  if (message) el.busyMessage.textContent = message;
}

function setPage(pageName) {
  document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.id === `page-${pageName}`));
  document.querySelectorAll(".nav-btn[data-page]").forEach((b) => b.classList.toggle("active", b.dataset.page === pageName));
  updateFloatingCreateVisibility();
}

function bindElements() {
  el.toastHost = document.getElementById("toast-host");
  el.busyOverlay = document.getElementById("busy-overlay");
  el.busyMessage = document.getElementById("busy-message");
  el.logo = document.getElementById("logo");
  el.navSpeed = document.getElementById("nav-speed");
  el.sidebarChart = document.getElementById("sidebar-chart");
  el.barSuccess = document.getElementById("bar-success");
  el.barError = document.getElementById("bar-error");
  el.sidebarChartMeta = document.getElementById("sidebar-chart-meta");
  el.modell = document.getElementById("modell");
  el.modelOptions = document.getElementById("modell-options");
  el.idnr = document.getElementById("idnr");
  el.seriennr = document.getElementById("seriennr");
  el.techniker = document.getElementById("techniker");
  el.mac = document.getElementById("mac");
  el.kNo = document.getElementById("k-no");
  el.kYes = document.getElementById("k-yes");
  el.kNumberLabel = document.getElementById("k-number-label");
  el.kNumber = document.getElementById("k-number");
  el.autoPrint = document.getElementById("auto-print");
  el.openJobOptionsMain = document.getElementById("open-job-options-main");
  el.printerLabel = document.getElementById("printer-label");
  el.printerBoard = document.getElementById("printer-board");
  el.printerChecklist = document.getElementById("printer-checklist");
  el.printerLabelState = document.getElementById("printer-label-state");
  el.printerBoardState = document.getElementById("printer-board-state");
  el.printerChecklistState = document.getElementById("printer-checklist-state");
  el.printerFrame = document.querySelector(".printer-frame");
  el.printerSkeleton = document.getElementById("printer-skeleton");
  el.printerScanStatus = document.getElementById("printer-scan-status");
  el.refreshPrinters = document.getElementById("refresh-printers");
  el.deviceScanBtn = document.getElementById("scan-devices");
  el.deviceCidr = document.getElementById("device-cidr");
  el.deviceOnlyPrinters = document.getElementById("device-only-printers");
  el.deviceScanStatus = document.getElementById("device-scan-status");
  el.deviceTableBody = document.querySelector("#device-table tbody");
  el.deviceTable = document.getElementById("device-table");
  el.deviceSkeleton = document.getElementById("device-skeleton");
  el.deviceDialog = document.getElementById("device-detail-dialog");
  el.deviceDialogClose = document.getElementById("device-dialog-close");
  el.deviceDialogApply = document.getElementById("device-dialog-apply");
  el.deviceDialogName = document.getElementById("device-dialog-name");
  el.deviceDialogModel = document.getElementById("device-dialog-model");
  el.deviceDialogIdnr = document.getElementById("device-dialog-idnr");
  el.deviceDialogSerial = document.getElementById("device-dialog-serial");
  el.deviceDialogMac = document.getElementById("device-dialog-mac");
  el.deviceDialogHost = document.getElementById("device-dialog-host");
  el.deviceDialogPort = document.getElementById("device-dialog-port");
  el.deviceDialogDriver = document.getElementById("device-dialog-driver");
  el.deviceDialogStatus = document.getElementById("device-dialog-status");
  el.deviceDialogTech = document.getElementById("device-dialog-tech");
  el.deviceDialogFeedback = document.getElementById("device-dialog-feedback");
  el.tplBoard = document.getElementById("tpl-board");
  el.tplChecklist = document.getElementById("tpl-checklist");
  el.outputLabel = document.getElementById("output-label");
  el.openOutput = document.getElementById("open-output");
  el.runMain = document.getElementById("run-main") || document.getElementById("run-main-fab");
  el.runMainFab = document.getElementById("run-main-fab");
  el.statusMain = document.getElementById("status-main");
  el.speedSuffix = document.getElementById("speed-suffix");
  el.speedQueueToggle = document.getElementById("speed-queue-toggle");
  el.speedQueueBox = document.getElementById("speed-queue-box");
  el.speedQ1 = document.getElementById("speed-q1");
  el.speedQ2 = document.getElementById("speed-q2");
  el.speedQ3 = document.getElementById("speed-q3");
  el.speedPreviewState = document.getElementById("speed-preview-state");
  el.speedPreviewModel = document.getElementById("speed-preview-model");
  el.speedPreviewIdnr = document.getElementById("speed-preview-idnr");
  el.speedTech = document.getElementById("speed-tech");
  el.speedPrint = document.getElementById("speed-print");
  el.openJobOptionsSpeed = document.getElementById("open-job-options-speed");
  el.runSpeed = document.getElementById("run-speed");
  el.statusSpeed = document.getElementById("status-speed");
  el.filesCount = document.getElementById("files-count");
  el.filesRefresh = document.getElementById("files-refresh");
  el.filesOpen = document.getElementById("files-open-output");
  el.filesList = document.getElementById("files-list");
  el.historyCount = document.getElementById("history-count");
  el.historyRefresh = document.getElementById("history-refresh");
  el.historyClear = document.getElementById("history-clear");
  el.historyTableBody = document.querySelector("#history-table tbody");
  el.language = document.getElementById("language");
  el.theme = document.getElementById("theme");
  el.speedVisible = document.getElementById("speed-visible");
  el.sidebarChartToggle = document.getElementById("sidebar-chart-toggle");
  el.accent = document.getElementById("accent");
  el.bgToggle = document.getElementById("bg-toggle");
  el.bgStyle = document.getElementById("bg-style");
  el.outputSettingsLabel = document.getElementById("output-settings-label");
  el.chooseOutput = document.getElementById("choose-output");
  el.refreshDashboard = document.getElementById("refresh-dashboard");
  el.dashSource = document.getElementById("dash-source");
  el.dashMachines = document.getElementById("dash-machines");
  el.dashModels = document.getElementById("dash-models");
  el.dashBoard = document.getElementById("dash-board");
  el.dashCheck = document.getElementById("dash-check");
  el.dashLabels = document.getElementById("dash-labels");
  el.dashPrinters = document.getElementById("dash-printers");
  el.dashNetwork = document.getElementById("dash-network");
  el.dashOutput = document.getElementById("dash-output");
  el.dashHistory = document.getElementById("dash-history");
  el.jobOptionsDialog = document.getElementById("job-options-dialog");
  el.jobOptionsClose = document.getElementById("job-options-close");
  el.jobOptionsApply = document.getElementById("job-options-apply");
  el.jobOptionsNote = document.getElementById("job-options-note");
  el.optCreateLabel = document.getElementById("opt-create-label");
  el.optCreateBoard = document.getElementById("opt-create-board");
  el.optCreateChecklist = document.getElementById("opt-create-checklist");
  el.optPrintLabel = document.getElementById("opt-print-label");
  el.optPrintBoard = document.getElementById("opt-print-board");
  el.optPrintChecklist = document.getElementById("opt-print-checklist");
}

function bindNavigation() {
  document.querySelectorAll(".nav-btn[data-page]").forEach((btn) => btn.addEventListener("click", () => setPage(btn.dataset.page)));
}

function applyTheme() {
  document.documentElement.classList.toggle("light", !state.darkMode);
  document.documentElement.style.setProperty("--accent", state.accentColor);
}

function syncKNummerUI() {
  el.kNo.classList.toggle("active", !state.hasKNummer);
  el.kYes.classList.toggle("active", state.hasKNummer);
  el.kNumberLabel.classList.toggle("hidden", !state.hasKNummer);
  el.kNumber.classList.toggle("hidden", !state.hasKNummer);
  if (!state.hasKNummer) el.kNumber.value = "";
}

function updateSpeedVisibility() {
  el.navSpeed.style.display = state.settings.speed_mode_enabled ? "" : "none";
  if (!state.settings.speed_mode_enabled && document.querySelector(".nav-btn.active")?.dataset.page === "speed") setPage("home");
}

function updateOutputLabels() {
  el.outputLabel.textContent = `Output-Ordner: ${state.outputDir}`;
  el.outputSettingsLabel.textContent = `Output-Ordner: ${state.outputDir}`;
}

function normalizeJobOptions(value) {
  const source = value || {};
  return {
    createLabel: source.createLabel !== false,
    createBoard: source.createBoard !== false,
    createChecklist: source.createChecklist !== false,
    printLabel: source.printLabel !== false,
    printBoard: source.printBoard !== false,
    printChecklist: source.printChecklist !== false,
  };
}

function syncJobOptionsDialogUi() {
  const o = normalizeJobOptions(state.jobOptions);
  if (el.optCreateLabel) el.optCreateLabel.checked = !!o.createLabel;
  if (el.optCreateBoard) el.optCreateBoard.checked = !!o.createBoard;
  if (el.optCreateChecklist) el.optCreateChecklist.checked = !!o.createChecklist;
  if (el.optPrintLabel) el.optPrintLabel.checked = !!o.printLabel;
  if (el.optPrintBoard) el.optPrintBoard.checked = !!o.printBoard;
  if (el.optPrintChecklist) el.optPrintChecklist.checked = !!o.printChecklist;
}

function readJobOptionsFromDialog() {
  return normalizeJobOptions({
    createLabel: !!el.optCreateLabel?.checked,
    createBoard: !!el.optCreateBoard?.checked,
    createChecklist: !!el.optCreateChecklist?.checked,
    printLabel: !!el.optPrintLabel?.checked,
    printBoard: !!el.optPrintBoard?.checked,
    printChecklist: !!el.optPrintChecklist?.checked,
  });
}

function setJobOptionsNote(message = "", kind = "error") {
  if (!el.jobOptionsNote) return;
  const text = cleanText(message);
  el.jobOptionsNote.classList.remove("hidden", "error", "success");
  if (!text) {
    el.jobOptionsNote.textContent = "";
    el.jobOptionsNote.classList.add("hidden");
    return;
  }
  el.jobOptionsNote.textContent = text;
  el.jobOptionsNote.classList.add(kind === "success" ? "success" : "error");
}

function closeJobOptionsDialog() {
  if (!el.jobOptionsDialog) return;
  setJobOptionsNote("");
  if (el.jobOptionsDialog.open) el.jobOptionsDialog.close();
  updateFloatingCreateVisibility();
}

function openJobOptionsDialog() {
  if (!el.jobOptionsDialog) return;
  syncJobOptionsDialogUi();
  setJobOptionsNote("");
  if (!el.jobOptionsDialog.open) el.jobOptionsDialog.showModal();
  updateFloatingCreateVisibility();
}

function getEffectiveJobOptions(shouldPrint) {
  const opts = normalizeJobOptions(state.jobOptions);
  if (!shouldPrint) {
    return {
      ...opts,
      printLabel: false,
      printBoard: false,
      printChecklist: false,
    };
  }
  return opts;
}

function setModelOptions(options) {
  state.modelOptions = [...(options || [])];
  el.modelOptions.innerHTML = "";
  state.modelOptions.forEach((opt) => {
    const node = document.createElement("option");
    node.value = opt;
    el.modelOptions.appendChild(node);
  });
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

function modelKey(value) { return cleanText(value).toUpperCase().replace(/[^A-Z0-9]/g, ""); }

function modelTokens(value) {
  const tokens = new Set();
  (prettifyModelName(value).toUpperCase().match(/[A-Z]+|\d+/g) || []).forEach((tok) => { if (tok.length >= 2) tokens.add(tok); });
  const compact = modelKey(value);
  if (compact) tokens.add(compact);
  return tokens;
}

function stringModelScore(query, candidate) {
  const qText = prettifyModelName(query);
  const cText = prettifyModelName(candidate);
  const qKey = modelKey(qText);
  const cKey = modelKey(cText);
  if (!qKey || !cKey) return 0;
  if (qKey === cKey) return 10000;
  let score = 0;
  if (cKey.includes(qKey)) score += 600 + qKey.length * 8;
  const qTokens = modelTokens(qText);
  const cTokens = modelTokens(cText);
  qTokens.forEach((qTok) => {
    if (cTokens.has(qTok)) { score += qTok.length ** 2; return; }
    if (qTok.length < 3) return;
    cTokens.forEach((cTok) => {
      if (cTok.length >= 3 && (cTok.includes(qTok) || qTok.includes(cTok))) score += Math.min(qTok.length, cTok.length) * 3;
    });
  });
  const qDigits = qText.match(/\d{3,5}/g) || [];
  const cDigits = cText.match(/\d{3,5}/g) || [];
  if (qDigits.length && cDigits.length) {
    if (qDigits.some((q) => cDigits.includes(q))) score += 200;
    else if (qDigits.some((q) => cDigits.some((c) => q.includes(c) || c.includes(q)))) score += 80;
  }
  return score;
}

function deriveModelFromBoardTemplate(stem, queryText = "") {
  const text = prettifyModelName(stem);
  const parts = text.split(" ");
  if (parts.length < 2) return text;
  const brand = parts.shift();
  const variants = parts.join(" ").split("-").map((v) => v.trim()).filter(Boolean);
  if (!variants.length) return text;
  const digits = cleanText(queryText).match(/\d{3,5}/g) || [];
  let chosen = variants[variants.length - 1];
  if (digits.length) {
    for (const v of variants) {
      if (digits.some((d) => modelKey(v).includes(d))) { chosen = v; break; }
    }
  }
  if (/^\d/.test(chosen)) {
    const pm = variants[0].match(/^[A-Za-z]+/);
    if (pm) chosen = `${pm[0]}${chosen}`;
  }
  return `${brand} ${chosen}`.trim();
}

async function normalizeModelInput() {
  const text = cleanText(el.modell.value);
  if (!text) return;
  const key = modelKey(text);
  for (const cand of state.modelOptions) {
    if (modelKey(cand) === key) { el.modell.value = cand; return; }
  }
  const scored = state.modelOptions
    .map((cand) => ({ cand, score: stringModelScore(text, cand), len: cand.length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.len - b.len || a.cand.localeCompare(b.cand, "de", { sensitivity: "base" }));
  if (scored.length && scored[0].score >= 80) { el.modell.value = scored[0].cand; return; }
  try {
    const tpl = await window.api.resolveTemplates(text);
    if (tpl?.board) el.modell.value = deriveModelFromBoardTemplate(tpl.board.replace(/\.xlsx$/i, ""), text);
  } catch (_) { }
}

async function refreshTemplates() {
  const modell = cleanText(el.modell.value);
  if (!modell) {
    el.tplBoard.textContent = "Boardkarte: -";
    el.tplChecklist.textContent = "Checkliste: -";
    el.tplBoard.style.color = "";
    el.tplChecklist.style.color = "";
    return;
  }
  try {
    const t = await window.api.resolveTemplates(modell);
    if (t.board) {
      el.tplBoard.textContent = `Boardkarte: ${t.board}`;
      el.tplBoard.style.color = "";
      if (t.checklist) {
        el.tplChecklist.textContent = `Checkliste: ${t.checklist}`;
        el.tplChecklist.style.color = "";
      } else {
        el.tplChecklist.textContent = "Checkliste: Keine Vorlage gefunden";
        el.tplChecklist.style.color = "var(--danger)";
      }
    } else {
      el.tplBoard.textContent = "Boardkarte: Keine Vorlage gefunden";
      el.tplBoard.style.color = "var(--danger)";
      el.tplChecklist.textContent = "Checkliste: -";
      el.tplChecklist.style.color = "";
    }
  } catch (_) {
    el.tplBoard.textContent = "Boardkarte: Fehler bei Vorlagenprüfung";
    el.tplBoard.style.color = "var(--danger)";
  }
}

function lookupSerial(serialInput) {
  const sn = normSeriennummer(serialInput);
  if (sn.length < 5) return null;
  const exact = state.lagerData.exact?.[sn] || [];
  if (exact.length === 1) return exact[0];
  const suffix = state.lagerData.suffix?.[sn.slice(-5)] || [];
  if (suffix.length === 1) return suffix[0];
  return null;
}

async function autofillSerial() {
  const rec = lookupSerial(el.seriennr.value);
  if (!rec) return;
  el.seriennr.value = rec.seriennr || "";
  el.idnr.value = rec.idnr || "";
  el.modell.value = rec.modell || "";
  el.techniker.value = rec.techniker || "";
  await refreshTemplates();
}

async function checkIdnrAndAutofill(triggeredByEnter) {
  const idnr = normIdnr(el.idnr.value);
  if (idnr.length !== 5) {
    if (idnr.length === 0) state.lastMissingIdnr = null;
    return;
  }
  const matches = state.lagerData.idnr?.[idnr] || [];
  if (matches.length === 1) {
    const rec = matches[0];
    el.modell.value = rec.modell || "";
    el.seriennr.value = rec.seriennr || "";
    el.techniker.value = rec.techniker || "";
    state.lastMissingIdnr = null;
    await refreshTemplates();
    return;
  }
  if (triggeredByEnter || state.lastMissingIdnr !== idnr) {
    toast("IDNR nicht gefunden", `Die IDNR ${idnr} existiert nicht in den Lagerdaten. Bitte Daten manuell eingeben.`, "warn", 3200);
    state.lastMissingIdnr = idnr;
  }
}
function setPrinterScanStatus(text) {
  if (!el.printerScanStatus) return;
  el.printerScanStatus.textContent = cleanText(text) || "Druckersuche noch nicht gestartet.";
}

function setPrinterLoading(active, statusText = "") {
  if (el.printerFrame) el.printerFrame.classList.toggle("loading", !!active);
  if (el.printerSkeleton) el.printerSkeleton.classList.toggle("hidden", !active);
  [el.printerLabel, el.printerBoard, el.printerChecklist, el.refreshPrinters].forEach((node) => {
    if (node) node.disabled = !!active;
  });
  if (statusText) setPrinterScanStatus(statusText);
}

function buildPrinterOption(printer) {
  const host = cleanText(printer.host);
  const port = cleanText(printer.port);
  const suffix = host || port ? ` (${host || port})` : "";
  return `${printer.name}${suffix}`;
}

function setPrinterBadge(node, info) {
  const s = info?.state;
  node.classList.remove("ok", "bad", "unknown");
  if (s === true) { node.textContent = "● Erreichbar"; node.classList.add("ok"); }
  else if (s === false) { node.textContent = "● Nicht erreichbar"; node.classList.add("bad"); }
  else { node.textContent = "● Status unbekannt"; node.classList.add("unknown"); }
  node.title = info?.tip || "";
}

async function refreshPrinterReachability() {
  const names = { label: cleanText(el.printerLabel.value), board: cleanText(el.printerBoard.value), checklist: cleanText(el.printerChecklist.value) };
  const res = await window.api.checkPrinterReachability(names).catch(() => ({}));
  setPrinterBadge(el.printerLabelState, res.label);
  setPrinterBadge(el.printerBoardState, res.board);
  setPrinterBadge(el.printerChecklistState, res.checklist);
}

async function onPrinterSelectionChanged() {
  state.settings.printer_label = cleanText(el.printerLabel.value);
  state.settings.printer_board = cleanText(el.printerBoard.value);
  state.settings.printer_checklist = cleanText(el.printerChecklist.value);
  await persistSettings();
  await refreshPrinterReachability();
}

async function refreshPrinters({ includeNetworkScan = false } = {}) {
  const statusText = includeNetworkScan
    ? "Suche nach Windows- und Netzwerkdruckern ..."
    : "Windows-Drucker werden geladen ...";
  setPrinterLoading(true, statusText);
  try {
    state.printers = await window.api.listPrinters().catch(() => []);
    const combos = [el.printerLabel, el.printerBoard, el.printerChecklist];
    combos.forEach((c) => { c.innerHTML = ""; });

    if (!state.printers.length) {
      combos.forEach((c) => {
        const o = document.createElement("option");
        o.value = "";
        o.textContent = "Keine Drucker gefunden";
        c.appendChild(o);
      });
      await refreshPrinterReachability();
      if (includeNetworkScan) await refreshDeviceList({ showBusyOverlay: false, skipPrinterRefresh: true, source: "startup" });
      setPrinterScanStatus("Keine Windows-Drucker gefunden.");
      refreshDashboard();
      return;
    }

    let firstKyocera = -1;
    state.printers.forEach((p, idx) => {
      combos.forEach((c) => {
        const o = document.createElement("option");
        o.value = p.name;
        o.textContent = buildPrinterOption(p);
        o.title = `Name: ${p.name}\nHost: ${p.host || "-"}\nPort: ${p.port || "-"}\nTreiber: ${p.driver || "-"}`;
        c.appendChild(o);
      });
      if (firstKyocera < 0 && `${p.name || ""} ${p.driver || ""}`.toLowerCase().includes("kyocera")) firstKyocera = idx;
    });

    const selectByValue = (combo, wanted) => {
      const w = cleanText(wanted);
      if (!w) return false;
      const opts = [...combo.options];
      const exact = opts.find((o) => o.value.toLowerCase() === w.toLowerCase());
      if (exact) { combo.value = exact.value; return true; }
      const partial = opts.find((o) => o.value.includes(w));
      if (partial) { combo.value = partial.value; return true; }
      return false;
    };

    const foundLabel = selectByValue(el.printerLabel, state.settings.printer_label);
    const foundBoard = selectByValue(el.printerBoard, state.settings.printer_board);
    const foundCheck = selectByValue(el.printerChecklist, state.settings.printer_checklist || state.settings.printer_board);
    if (!foundLabel) el.printerLabel.selectedIndex = 0;
    if (firstKyocera >= 0) {
      if (!foundBoard) el.printerBoard.selectedIndex = firstKyocera;
      if (!foundCheck) el.printerChecklist.selectedIndex = firstKyocera;
    } else {
      if (!foundBoard) el.printerBoard.selectedIndex = 0;
      if (!foundCheck) el.printerChecklist.selectedIndex = 0;
    }

    await onPrinterSelectionChanged();
    if (includeNetworkScan) await refreshDeviceList({ showBusyOverlay: false, skipPrinterRefresh: true, source: "startup" });
    setPrinterScanStatus(`Drucker geladen: ${state.printers.length} Windows-Drucker verfügbar.`);
    refreshDashboard();
  } finally {
    setPrinterLoading(false);
  }
}

function appendHistory(entry) {
  const rec = {
    time: nowString(),
    status: cleanText(entry.status || "info").toLowerCase(),
    modell: cleanText(entry.modell),
    idnr: cleanText(entry.idnr),
    seriennr: cleanText(entry.seriennr),
    techniker: cleanText(entry.techniker),
    source: cleanText(entry.source),
    print: cleanText(entry.print),
    message: cleanText(entry.message),
  };
  state.jobHistory.unshift(rec);
  if (state.jobHistory.length > 300) state.jobHistory = state.jobHistory.slice(0, 300);
  state.settings.job_history = state.jobHistory;
  persistSettings();
  renderHistory();
}

function renderHistory() {
  el.historyTableBody.innerHTML = "";
  el.historyCount.textContent = `${state.jobHistory.length} Einträge`;
  state.jobHistory.forEach((rec) => {
    const tr = document.createElement("tr");
    const status = String(rec.status || "").toLowerCase();
    const statusText = status === "success" ? "Erfolg" : (status === "error" ? "Fehler" : "Info");
    [rec.time || "-", rec.modell || "-", rec.idnr || "-", rec.seriennr || "-", rec.techniker || "-", rec.source || "-", rec.print || "-", statusText].forEach((v, idx) => {
      const td = document.createElement("td");
      td.textContent = v;
      if (idx === 7) { td.style.color = status === "success" ? "var(--success)" : (status === "error" ? "var(--danger)" : "var(--warn)"); td.style.fontWeight = "700"; }
      tr.appendChild(td);
    });
    el.historyTableBody.appendChild(tr);
  });
  updateSidebarChart();
  refreshDashboard();
}

function updateSidebarChart() {
  const total = state.jobHistory.length || 0;
  const success = state.jobHistory.filter((x) => String(x.status || "").toLowerCase() === "success").length;
  const error = state.jobHistory.filter((x) => String(x.status || "").toLowerCase() === "error").length;
  const successPct = total ? Math.round((success / total) * 100) : 0;
  const errorPct = total ? Math.round((error / total) * 100) : 0;
  el.barSuccess.style.width = `${successPct}%`;
  el.barError.style.width = `${errorPct}%`;
  el.sidebarChartMeta.textContent = `${total} Jobs | ${success} OK | ${error} Fehler`;
}

async function refreshFiles() {
  const files = await window.api.listFiles(state.outputDir).catch(() => []);
  el.filesList.innerHTML = "";
  el.filesCount.textContent = `${files.length} Datei(en)`;
  files.forEach((f) => {
    const li = document.createElement("li");
    li.textContent = `${f.relative}  |  ${formatMtime(f.mtimeMs)}  |  ${f.size} B`;
    li.addEventListener("dblclick", () => window.api.openFile(f.path));
    el.filesList.appendChild(li);
  });
  refreshDashboard();
}

function getMachineCount() {
  return Object.values(state.lagerData.exact || {}).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
}

async function refreshDashboard() {
  const outputFiles = await window.api.listFiles(state.outputDir).catch(() => []);
  const networkCount = [...state.deviceCache.values()].filter((d) => d.online).length;
  el.dashSource.textContent = `Lagerquelle: ${state.lagerSource || "Keine Lagerquelle geladen"}`;
  el.dashMachines.textContent = `Geladene Maschinen: ${getMachineCount()}`;
  el.dashModels.textContent = `Modell-Vorschläge: ${state.modelOptions.length}`;
  el.dashBoard.textContent = `Boardkarten-Vorlagen: ${state.templates.board.length}`;
  el.dashCheck.textContent = `Checklisten-Vorlagen: ${state.templates.check.length}`;
  el.dashLabels.textContent = `Label-Vorlagen: ${state.templates.labels.length}`;
  el.dashPrinters.textContent = `Windows-Drucker: ${state.printers.length}`;
  el.dashNetwork.textContent = `Erkannte Netzwerkgeräte: ${networkCount}`;
  el.dashOutput.textContent = `Dateien im Output: ${outputFiles.length}`;
  el.dashHistory.textContent = `Historie-Einträge: ${state.jobHistory.length}`;
}

function applyDeviceToForm(rec) {
  if (!rec) return;
  if (rec.modell) el.modell.value = rec.modell;
  if (rec.idnr) el.idnr.value = rec.idnr;
  if (rec.seriennr) el.seriennr.value = rec.seriennr;
  if (rec.techniker) el.techniker.value = rec.techniker;
  if (rec.mac) el.mac.value = rec.mac;
  refreshTemplates();
}

function closeDeviceDialog() {
  if (!el.deviceDialog) return;
  if (el.deviceDialog.open) el.deviceDialog.close();
  state.selectedDeviceDialog = null;
  setDeviceDialogFeedback("", "");
  updateFloatingCreateVisibility();
}

function openDeviceDialog(rec) {
  if (!rec || !el.deviceDialog) return;
  state.selectedDeviceDialog = rec;
  const lager = lookupSerial(rec.seriennr);
  el.deviceDialogName.textContent = rec.printer_name || "Netzwerkgerät";
  el.deviceDialogModel.textContent = lager?.modell || rec.modell || rec.snmp_modell || "-";
  el.deviceDialogIdnr.textContent = lager?.idnr || rec.idnr || "-";
  el.deviceDialogSerial.textContent = lager?.seriennr || rec.seriennr || "-";
  el.deviceDialogMac.textContent = rec.mac || "-";
  el.deviceDialogHost.textContent = rec.host || "-";
  el.deviceDialogPort.textContent = rec.port || "-";
  el.deviceDialogDriver.textContent = rec.driver || "-";
  el.deviceDialogStatus.textContent = rec.online ? "Online" : "Offline";
  if (el.deviceDialogTech) el.deviceDialogTech.value = cleanText(lager?.techniker || rec.techniker || el.techniker.value);
  setDeviceDialogFeedback("", "");
  if (!el.deviceDialog.open) el.deviceDialog.showModal();
  updateFloatingCreateVisibility();
}

function setDeviceDialogFeedback(message, kind = "error") {
  if (!el.deviceDialogFeedback) return;
  const text = cleanText(message);
  el.deviceDialogFeedback.classList.remove("hidden", "error", "success");
  if (!text) {
    el.deviceDialogFeedback.textContent = "";
    el.deviceDialogFeedback.classList.add("hidden");
    return;
  }
  el.deviceDialogFeedback.textContent = text;
  el.deviceDialogFeedback.classList.add(kind === "success" ? "success" : "error");
}

function updateFloatingCreateVisibility() {
  if (!el.runMainFab) return;
  const isHome = document.querySelector(".nav-btn.active")?.dataset.page === "home";
  const popupOpen = !!((el.deviceDialog && el.deviceDialog.open) || (el.jobOptionsDialog && el.jobOptionsDialog.open));
  el.runMainFab.classList.toggle("hidden", !isHome || popupOpen);
}

function buildJobFromDevice(rec, technikerInput = "") {
  const lager = lookupSerial(rec?.seriennr || "");
  const modell = cleanText(lager?.modell || rec?.modell || rec?.snmp_modell);
  const idnr = normIdnr(lager?.idnr || rec?.idnr);
  const seriennr = normSeriennummer(lager?.seriennr || rec?.seriennr);
  const techniker = cleanText(technikerInput || lager?.techniker || rec?.techniker || el.techniker.value);
  const mac = cleanText(rec?.mac || "");
  return { modell, idnr, seriennr, techniker, mac };
}

function populateDeviceTable() {
  const onlyPrinters = !!el.deviceOnlyPrinters.checked;
  const rows = [...state.deviceCache.values()]
    .filter((d) => !onlyPrinters || (!!cleanText(d.printer_name) && !cleanText(d.printer_name).toLowerCase().startsWith("netzwerkgerät")))
    .sort((a, b) => (a.online === b.online ? (b.last_seen || 0) - (a.last_seen || 0) : (a.online ? -1 : 1)));
  el.deviceTableBody.innerHTML = "";
  rows.forEach((rec) => {
    const tr = document.createElement("tr");
    tr.className = "clickable";
    tr.title = `${rec.printer_name || "-"}\nHost: ${rec.host || "-"}\nPort: ${rec.port || "-"}\nTreiber: ${rec.driver || "-"}\nStatus: ${rec.online ? "Online" : "Offline"}`;
    [rec.modell || rec.snmp_modell || "-", rec.idnr || "-", rec.seriennr || "-", rec.mac || "-"].forEach((v) => {
      const td = document.createElement("td");
      td.textContent = v;
      tr.appendChild(td);
    });
    tr.addEventListener("dblclick", () => { openDeviceDialog(rec); });
    el.deviceTableBody.appendChild(tr);
  });
  refreshDashboard();
}

function setDeviceLoading(active) {
  if (el.deviceSkeleton) el.deviceSkeleton.classList.toggle("hidden", !active);
  if (el.deviceTable) el.deviceTable.classList.toggle("hidden", !!active);
  if (el.deviceScanBtn) el.deviceScanBtn.disabled = !!active;
}

async function refreshDeviceList({ showBusyOverlay = false, skipPrinterRefresh = false, source = "manual" } = {}) {
  let cidr = cleanText(el.deviceCidr.value);
  if (!cidr) { cidr = cleanText(state.settings.device_scan_cidr) || "192.168.1.0/24,192.168.22.0/24"; el.deviceCidr.value = cidr; }
  state.settings.device_scan_cidr = cidr;
  state.settings.device_only_printers = !!el.deviceOnlyPrinters.checked;
  await persistSettings();
  if (!skipPrinterRefresh && !state.printers.length) await refreshPrinters();

  el.deviceScanStatus.textContent = `Geräteliste wird aktualisiert (${cidr}) ...`;
  setPrinterScanStatus("Suche im Netzwerk läuft ...");
  setDeviceLoading(true);
  if (showBusyOverlay) setBusy(true, "Geräteliste wird aktualisiert ...");
  try {
    const devices = await window.api.scanDevices({ printers: state.printers, lagerData: state.lagerData, networkCidr: cidr });
    const now = Date.now() / 1000;
    devices.forEach((item, idx) => {
      const key = cleanText(item.key || item.host || item.printer_name);
      if (!key) return;
      const prev = state.deviceCache.get(key) || {};
      state.deviceCache.set(key, { ...prev, ...item, online: !!item.online, last_seen: now + idx * 0.0001 });
    });
    const online = devices.filter((d) => d.online).length;
    const foundPrinters = devices.filter((d) => {
      const name = cleanText(d.printer_name).toLowerCase();
      return !!name && !name.startsWith("netzwerkgerät");
    }).length;
    el.deviceScanStatus.textContent = `Geräteliste aktualisiert: ${online}/${devices.length} online.`;
    setPrinterScanStatus(`Netzwerkscan: ${foundPrinters} Drucker erkannt (${online}/${devices.length} Hosts online).`);
    populateDeviceTable();
    return { ok: true, total: devices.length, online, foundPrinters };
  } catch (err) {
    el.deviceScanStatus.textContent = `Fehler beim Gerätescan: ${String(err?.message || err)}`;
    setPrinterScanStatus("Netzwerkscan fehlgeschlagen.");
    if (source !== "startup") toast("Gerätescan fehlgeschlagen", String(err?.message || err), "error", 3200);
    return { ok: false, total: 0, online: 0, foundPrinters: 0, error: String(err?.message || err) };
  } finally {
    setDeviceLoading(false);
    if (showBusyOverlay) setBusy(false);
  }
}
function speedMatches(suffix) {
  const s = normSeriennummer(suffix);
  if (s.length !== 5) return { suffix: s, matches: [] };
  return { suffix: s, matches: state.lagerData.suffix?.[s] || [] };
}

function updateSpeedPreview() {
  const { suffix, matches } = speedMatches(el.speedSuffix.value);
  if (suffix.length !== 5) {
    el.speedPreviewState.textContent = "Noch keine vollständige Eingabe (5 Zeichen).";
    el.speedPreviewModel.textContent = "Modell: -";
    el.speedPreviewIdnr.textContent = "IDNR: -";
    return;
  }
  if (matches.length === 1) {
    const rec = matches[0];
    el.speedPreviewState.textContent = "Treffer gefunden.";
    el.speedPreviewModel.textContent = `Modell: ${rec.modell || "-"}`;
    el.speedPreviewIdnr.textContent = `IDNR: ${rec.idnr || "-"}`;
    return;
  }
  el.speedPreviewState.textContent = matches.length ? `Mehrere Treffer für '${suffix}' (${matches.length}).` : `Kein Treffer für '${suffix}'.`;
  el.speedPreviewModel.textContent = "Modell: -";
  el.speedPreviewIdnr.textContent = "IDNR: -";
}

function setButtonsEnabled(enabled) {
  if (el.runMain) el.runMain.disabled = !enabled;
  if (el.runSpeed) el.runSpeed.disabled = !enabled;
  if (el.runMainFab) el.runMainFab.disabled = !enabled;
  if (el.runMain) el.runMain.classList.toggle("is-loading", !enabled);
  if (el.runSpeed) el.runSpeed.classList.toggle("is-loading", !enabled);
  if (el.runMainFab) el.runMainFab.classList.toggle("is-loading", !enabled);
  if (el.runMain) el.runMain.setAttribute("aria-busy", !enabled ? "true" : "false");
  if (el.runSpeed) el.runSpeed.setAttribute("aria-busy", !enabled ? "true" : "false");
  if (el.runMainFab) el.runMainFab.setAttribute("aria-busy", !enabled ? "true" : "false");
}

function resetQueueState() {
  state.queuePending = [];
  state.queueTotal = 0;
  state.queueDone = 0;
  state.queueErrors = 0;
}

function finalizeQueue() {
  if (state.queueTotal <= 0) return;
  const ok = Math.max(0, state.queueDone - state.queueErrors);
  el.statusSpeed.textContent = `${el.statusSpeed.textContent}\nQueue abgeschlossen: ${ok}/${state.queueTotal} erfolgreich.`.trim();
  resetQueueState();
}

async function startGeneration({ modell, idnr, seriennr, techniker, mac, shouldPrint, statusElement, useKLabel, source, jobOptions = null }) {
  if (state.generationInProgress) {
    toast("Bitte warten", "Es läuft bereits eine Erstellung.", "warn", 2200);
    return { ok: false, error: "busy" };
  }

  const effectiveOptions = normalizeJobOptions(jobOptions || state.jobOptions);
  if (!effectiveOptions.createLabel && !effectiveOptions.createBoard && !effectiveOptions.createChecklist) {
    const msg = "Bitte mindestens einen Dokumenttyp bei 'Erstellen' aktivieren.";
    statusElement.textContent = `Fehler: ${msg}`;
    toast("Keine Auswahl", msg, "warn", 2800);
    return { ok: false, error: msg };
  }

  const needsBoardTemplate = !!(effectiveOptions.createBoard || effectiveOptions.createChecklist);
  const tpl = needsBoardTemplate ? await window.api.resolveTemplates(modell).catch(() => ({ board: null })) : { board: null };
  if (needsBoardTemplate && !tpl?.board) {
    const msg = `Keine Boardkarten-Vorlage für '${modell}' gefunden.`;
    statusElement.textContent = `Fehler: ${msg}`;
    toast("Vorlage fehlt", msg, "error", 3200);
    appendHistory({ status: "error", modell, idnr, seriennr, techniker, source, print: "Nein", message: msg });
    return { ok: false, error: msg };
  }

  state.generationInProgress = true;
  setButtonsEnabled(false);
  const willPrintSomething = !!(shouldPrint && (effectiveOptions.printLabel || effectiveOptions.printBoard || effectiveOptions.printChecklist));
  statusElement.textContent = willPrintSomething ? "Dokumente werden erstellt und danach gedruckt ..." : "Dokumente werden erstellt ...";
  setBusy(true, statusElement.textContent);

  try {
    const result = await window.api.runJob({
      modell,
      idnr,
      seriennr,
      techniker,
      mac,
      outputDir: state.outputDir,
      shouldPrint,
      jobOptions: effectiveOptions,
      printerLabelId: cleanText(el.printerLabel.value),
      printerBoardId: cleanText(el.printerBoard.value),
      printerChecklistId: cleanText(el.printerChecklist.value),
      hasKNummer: !!state.hasKNummer,
      useKLabel: !!useKLabel,
    });

    const boardName = (result.boardPath || "").split(/[\\/]/).pop() || "";
    const labelName = (result.labelPath || "").split(/[\\/]/).pop() || "";
    const checkName = (result.checklistPath || "").split(/[\\/]/).pop() || "";
    const lines = ["[OK] Dokumente erstellt"];
    if (boardName) lines.push(`- ${boardName}`);
    if (labelName) lines.push(`- ${labelName}`);
    if (checkName) lines.push(`- ${checkName}`);
    if (!boardName && !labelName && !checkName) lines.push("- Keine Datei erzeugt");

    let printStatus = "Nein";
    let printDetails = "";
    if (shouldPrint && Array.isArray(result.printResults)) {
      if (result.printResults.length === 0) {
        printStatus = "Nein";
      } else {
        result.printResults.forEach((p) => {
          if (p.ok) lines.push(`[OK] ${p.name} gedruckt`);
          else {
            const last = String(p.log || "").split(/\r?\n/).filter(Boolean).pop() || "Fehler";
            lines.push(`[ERR] ${p.name}: ${last}`);
          }
          const duplexLine = String(p.log || "").split(/\r?\n/).find((line) => line.includes("DUPLEX="));
          if (duplexLine && p.name === "Boardkarte") {
            lines.push(`[INFO] ${duplexLine.trim()}`);
          }
        });
        const okCount = result.printResults.filter((p) => p.ok).length;
        printStatus = `Ja (${okCount}/${result.printResults.length})`;
        if (okCount !== result.printResults.length) printDetails = "Druck teilweise fehlgeschlagen.";
      }
    }

    statusElement.textContent = lines.join("\n");
    toast("Dokumente erstellt", "Die Dokumente wurden erfolgreich erstellt.", "success", 3000);

    const msgParts = [];
    if (boardName) msgParts.push(`Boardkarte: ${boardName}`);
    if (labelName) msgParts.push(`Label: ${labelName}`);
    if (checkName) msgParts.push(`Checkliste: ${checkName}`);
    if (!msgParts.length) msgParts.push("Keine Datei erzeugt");
    if (printDetails) msgParts.push(printDetails);

    appendHistory({ status: "success", modell, idnr, seriennr, techniker, source, print: printStatus, message: msgParts.join(" | ") });
    await refreshFiles();
    await refreshDashboard();
    return { ok: true, result };
  } catch (err) {
    const msg = String(err?.message || err);
    statusElement.textContent = `Fehler: ${msg}`;
    toast("Fehler beim Erstellen", msg, "error", 3400);
    appendHistory({ status: "error", modell, idnr, seriennr, techniker, source, print: "Nein", message: msg });
    return { ok: false, error: msg };
  } finally {
    state.generationInProgress = false;
    setButtonsEnabled(true);
    setBusy(false);
  }
}

async function runMain() {
  const modell = cleanText(el.modell.value);
  const idnr = cleanText(el.idnr.value);
  const seriennr = cleanText(el.seriennr.value);
  const techniker = cleanText(el.techniker.value);
  const mac = cleanText(el.mac.value);
  if (!modell || !idnr || !seriennr) {
    toast("Fehler", "Bitte Modell, IDNR und Seriennummer ausfüllen.", "warn", 2600);
    return;
  }
  await startGeneration({
    modell,
    idnr,
    seriennr,
    techniker,
    mac,
    shouldPrint: !!el.autoPrint.checked,
    jobOptions: getEffectiveJobOptions(!!el.autoPrint.checked),
    statusElement: el.statusMain,
    useKLabel: true,
    source: "Hauptbildschirm",
  });
}

async function runSpeedQueue(jobs, shouldPrint) {
  state.queuePending = [...jobs];
  state.queueTotal = jobs.length;
  state.queueDone = 0;
  state.queueErrors = 0;
  el.statusSpeed.textContent = `Queue gestartet: 0/${state.queueTotal} verarbeitet.`;

  while (state.queuePending.length > 0) {
    const idx = state.queueDone + 1;
    const total = state.queueTotal;
    const job = state.queuePending.shift();
    el.statusSpeed.textContent = `Queue: Job ${idx}/${total} wird gestartet ...`;
    const res = await startGeneration({
      modell: job.modell,
      idnr: job.idnr,
      seriennr: job.seriennr,
      techniker: job.techniker,
      mac: "",
      shouldPrint,
      jobOptions: getEffectiveJobOptions(shouldPrint),
      statusElement: el.statusSpeed,
      useKLabel: false,
      source: "Speed-Queue",
    });
    state.queueDone += 1;
    if (!res.ok) state.queueErrors += 1;
  }
  finalizeQueue();
}

async function runSpeed() {
  const tech = cleanText(el.speedTech.value);
  if (!tech) {
    toast("Techniker fehlt", "Bitte im Speed-Modus ein Techniker-Kürzel eingeben.", "warn", 2800);
    return;
  }
  const shouldPrint = !!el.speedPrint.checked;

  if (el.speedQueueToggle.checked) {
    const suffixes = [el.speedQ1.value, el.speedQ2.value, el.speedQ3.value].map((s) => normSeriennummer(s)).filter(Boolean);
    if (!suffixes.length) { toast("Eingabe fehlt", "Bitte im Queue-Modus mindestens eine Seriennummer (letzte 5) eingeben.", "warn", 2800); return; }
    if (suffixes.length > 3) { toast("Zu viele Einträge", "Queue-Modus erlaubt maximal 3 Seriennummern.", "warn", 2800); return; }
    if (new Set(suffixes).size !== suffixes.length) { toast("Doppelte Einträge", "Bitte jede Seriennummer nur einmal eingeben.", "warn", 2800); return; }

    const jobs = [];
    for (const s of suffixes) {
      if (s.length !== 5) { toast("Ungültige Eingabe", `'${s}' ist ungültig. Bitte genau 5 Zeichen je Seriennummer.`, "warn", 3200); return; }
      const { matches } = speedMatches(s);
      if (matches.length !== 1) {
        toast(matches.length ? "Nicht eindeutig" : "Nicht gefunden", matches.length ? `Mehrere Treffer für '${s}'. Bitte Hauptbildschirm nutzen.` : `Keine Maschine zu '${s}' gefunden.`, "warn", 3400);
        return;
      }
      const rec = matches[0];
      jobs.push({ modell: rec.modell, idnr: rec.idnr, seriennr: rec.seriennr, techniker: tech });
    }

    if (jobs.length) {
      const first = jobs[0];
      el.modell.value = first.modell;
      el.idnr.value = first.idnr;
      el.seriennr.value = first.seriennr;
      el.techniker.value = first.techniker;
      await refreshTemplates();
    }

    await runSpeedQueue(jobs, shouldPrint);
    return;
  }

  const { suffix, matches } = speedMatches(el.speedSuffix.value);
  if (suffix.length !== 5) { toast("Eingabe fehlt", "Bitte genau die letzten 5 Stellen der Seriennummer eingeben.", "warn", 2600); return; }
  if (matches.length !== 1) {
    toast(matches.length ? "Nicht eindeutig" : "Nicht gefunden", matches.length ? `Mehrere Treffer für '${suffix}'. Bitte Hauptbildschirm nutzen.` : `Keine Maschine zu '${suffix}' gefunden.`, "warn", 3400);
    return;
  }

  const rec = matches[0];
  el.modell.value = rec.modell;
  el.idnr.value = rec.idnr;
  el.seriennr.value = rec.seriennr;
  el.techniker.value = tech;
  await refreshTemplates();

  await startGeneration({
    modell: rec.modell,
    idnr: rec.idnr,
    seriennr: rec.seriennr,
    techniker: tech,
    mac: "",
    shouldPrint,
    jobOptions: getEffectiveJobOptions(shouldPrint),
    statusElement: el.statusSpeed,
    useKLabel: false,
    source: "Speed-Modus",
  });
}
async function persistSettings() {
  state.settings.job_history = state.jobHistory;
  const saved = await window.api.updateSettings(state.settings).catch(() => state.settings);
  state.settings = { ...state.settings, ...(saved || {}) };
}

function applySettingsToUi() {
  el.language.value = state.settings.language === "en" ? "en" : "de";
  state.darkMode = state.settings.dark_mode !== false;
  el.theme.value = state.darkMode ? "dark" : "light";
  state.accentColor = state.settings.accent_color || "#ff3b30";
  if (![...el.accent.options].some((o) => o.value === state.accentColor)) state.accentColor = "#ff3b30";
  el.accent.value = state.accentColor;
  state.bgAnimEnabled = !!state.settings.background_fx;
  el.bgToggle.checked = state.bgAnimEnabled;
  state.bgPreset = state.settings.background_preset || "current";
  if (![...el.bgStyle.options].some((o) => o.value === state.bgPreset)) state.bgPreset = "current";
  el.bgStyle.value = state.bgPreset;
  state.settings.speed_mode_enabled = !!state.settings.speed_mode_enabled;
  el.speedVisible.checked = state.settings.speed_mode_enabled;
  el.sidebarChartToggle.checked = !!state.settings.sidebar_chart_enabled;
  el.sidebarChart.classList.toggle("hidden", !el.sidebarChartToggle.checked);
  el.deviceCidr.value = cleanText(state.settings.device_scan_cidr) || "192.168.1.0/24,192.168.22.0/24";
  el.deviceOnlyPrinters.checked = state.settings.device_only_printers !== false;
  state.jobOptions = normalizeJobOptions(null);
  syncJobOptionsDialogUi();
  updateSpeedVisibility();
  applyTheme();
}

function setupLogo() {
  el.logo.src = "../../assets/Scherer-Logo3.png";
  el.logo.onerror = () => { el.logo.style.display = "none"; };
}

function hexToRgba(hex, alpha) {
  const c = hex.replace("#", "");
  const full = c.length === 3 ? c.split("").map((x) => x + x).join("") : c;
  const n = Number.parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function startBackgroundAnimation() {
  const canvas = document.getElementById("bg-canvas");
  const uiverseBg = document.getElementById("bg-uiverse");
  const ctx = canvas.getContext("2d");
  let phase = 0;
  let lastMode = "";
  let lastAccent = "";

  function getBackgroundMode() {
    if (!state.bgAnimEnabled) return "off";
    if (state.bgPreset === "sweet_dolphin_36") return "sweet_dolphin_36";
    if (state.bgPreset === "clever_puma_91") return "clever_puma_91";
    return "canvas";
  }

  function applyBackgroundMode(mode) {
    const showCanvas = mode === "canvas";
    const showUiverse = mode === "sweet_dolphin_36" || mode === "clever_puma_91";
    canvas.style.opacity = showCanvas ? "1" : "0";
    canvas.style.visibility = showCanvas ? "visible" : "hidden";
    uiverseBg.classList.toggle("active", showUiverse);
    uiverseBg.classList.toggle("preset-clever-puma-91", mode === "clever_puma_91");
  }

  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  function draw() {
    const mode = getBackgroundMode();
    if (mode !== lastMode || state.accentColor !== lastAccent) {
      const uiverseColor = mode === "clever_puma_91" ? "rgba(255, 43, 43, 0.9)" : "rgba(255, 59, 48, 0.82)";
      uiverseBg.style.setProperty("--c", uiverseColor);
      applyBackgroundMode(mode);
      lastMode = mode;
      lastAccent = state.accentColor;
    }

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (mode === "canvas") {
        [[0.18,0.2,250,180,hexToRgba(state.accentColor,0.22),0.86,0.6],[0.8,0.32,300,220,"rgba(255,255,255,0.08)",0.6,0.48],[0.4,0.82,360,230,"rgba(95,95,95,0.22)",0.44,0.35],[0.67,0.74,220,160,"rgba(45,45,45,0.30)",0.72,0.4]]
          .forEach((b, idx) => {
            const [rx, ry, sx, sy, color, speed, amp] = b;
            const cx = w * rx + Math.sin(phase * speed + idx) * (40 + idx * 12);
            const cy = h * ry + Math.cos(phase * speed * 0.9 + idx * 1.6) * (36 + idx * 9);
            ctx.beginPath();
            for (let i = 0; i <= 42; i += 1) {
              const a = (Math.PI * 2 * i) / 42;
              const rMod = 1 + amp * 0.17 * Math.sin(4.6 * a + phase * (0.7 + idx * 0.1));
              const x = cx + Math.cos(a) * sx * rMod;
              const y = cy + Math.sin(a) * sy * rMod;
              if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();
          });
    }
    phase += 0.015;
    requestAnimationFrame(draw);
  }

  window.addEventListener("resize", resize);
  resize();
  draw();
}

function bindFormEvents() {
  el.kNo.addEventListener("click", () => { state.hasKNummer = false; syncKNummerUI(); });
  el.kYes.addEventListener("click", () => { state.hasKNummer = true; syncKNummerUI(); });
  el.modell.addEventListener("input", async () => {
    await refreshTemplates();
    const currentKey = modelKey(el.modell.value);
    if (currentKey && state.modelOptions.some((opt) => modelKey(opt) === currentKey)) {
      await normalizeModelInput();
      await refreshTemplates();
    }
  });
  el.modell.addEventListener("change", () => normalizeModelInput().then(refreshTemplates));
  el.modell.addEventListener("blur", () => normalizeModelInput().then(refreshTemplates));
  el.seriennr.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); autofillSerial(); } });
  el.idnr.addEventListener("input", () => { const c = normIdnr(el.idnr.value); if (el.idnr.value !== c) el.idnr.value = c; checkIdnrAndAutofill(false); });
  el.idnr.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); checkIdnrAndAutofill(true); } });
  if (el.runMain) el.runMain.addEventListener("click", runMain);
  if (el.runMainFab && el.runMainFab !== el.runMain) el.runMainFab.addEventListener("click", runMain);
  if (el.openJobOptionsMain) el.openJobOptionsMain.addEventListener("click", openJobOptionsDialog);
  if (el.openJobOptionsSpeed) el.openJobOptionsSpeed.addEventListener("click", openJobOptionsDialog);
  if (el.jobOptionsClose) el.jobOptionsClose.addEventListener("click", closeJobOptionsDialog);
  if (el.jobOptionsApply) {
    el.jobOptionsApply.addEventListener("click", () => {
      const next = readJobOptionsFromDialog();
      if (!next.createLabel && !next.createBoard && !next.createChecklist) {
        setJobOptionsNote("Mindestens ein Dokumenttyp unter 'Erstellen' muss aktiv sein.");
        return;
      }
      state.jobOptions = next;
      setJobOptionsNote("Auswahl übernommen.", "success");
      setTimeout(() => closeJobOptionsDialog(), 120);
    });
  }
  if (el.jobOptionsDialog) {
    el.jobOptionsDialog.addEventListener("cancel", (ev) => { ev.preventDefault(); closeJobOptionsDialog(); });
    el.jobOptionsDialog.addEventListener("click", (ev) => {
      const rect = el.jobOptionsDialog.getBoundingClientRect();
      const inside = ev.clientX >= rect.left && ev.clientX <= rect.right && ev.clientY >= rect.top && ev.clientY <= rect.bottom;
      if (!inside) closeJobOptionsDialog();
    });
    el.jobOptionsDialog.addEventListener("close", updateFloatingCreateVisibility);
  }
  [el.printerLabel, el.printerBoard, el.printerChecklist].forEach((combo) => combo.addEventListener("change", onPrinterSelectionChanged));
  el.refreshPrinters.addEventListener("click", refreshPrinters);
  el.openOutput.addEventListener("click", () => window.api.openPath(state.outputDir));
  el.deviceScanBtn.addEventListener("click", refreshDeviceList);
  el.deviceOnlyPrinters.addEventListener("change", () => { state.settings.device_only_printers = !!el.deviceOnlyPrinters.checked; persistSettings(); populateDeviceTable(); });
  if (el.deviceDialogClose) el.deviceDialogClose.addEventListener("click", closeDeviceDialog);
  if (el.deviceDialogApply) el.deviceDialogApply.addEventListener("click", async () => {
    if (!state.selectedDeviceDialog) return;
    setDeviceDialogFeedback("", "");
    const job = buildJobFromDevice(state.selectedDeviceDialog, cleanText(el.deviceDialogTech?.value));
    if (!job.techniker) { setDeviceDialogFeedback("Techniker fehlt. Bitte im Fenster einen Techniker eintragen."); return; }
    if (!job.modell || !job.idnr || !job.seriennr) {
      setDeviceDialogFeedback("Gerät unvollständig: Modell, IDNR oder Seriennummer konnten nicht vollständig ermittelt werden.");
      return;
    }
    applyDeviceToForm(job);
    const res = await startGeneration({
      modell: job.modell,
      idnr: job.idnr,
      seriennr: job.seriennr,
      techniker: job.techniker,
      mac: job.mac,
      shouldPrint: !!el.autoPrint.checked,
      jobOptions: getEffectiveJobOptions(!!el.autoPrint.checked),
      statusElement: el.statusMain,
      useKLabel: true,
      source: "Netzwerkgerät-Fenster",
    });
    if (res?.ok) {
      setDeviceDialogFeedback("Dokumente erfolgreich erstellt.", "success");
      closeDeviceDialog();
    } else {
      setDeviceDialogFeedback(`Fehler beim Erstellen:\n${cleanText(res?.error || "Unbekannter Fehler")}`);
    }
  });
  if (el.deviceDialog) {
    el.deviceDialog.addEventListener("cancel", (ev) => { ev.preventDefault(); closeDeviceDialog(); });
    el.deviceDialog.addEventListener("click", (ev) => {
      const rect = el.deviceDialog.getBoundingClientRect();
      const inside = ev.clientX >= rect.left && ev.clientX <= rect.right && ev.clientY >= rect.top && ev.clientY <= rect.bottom;
      if (!inside) closeDeviceDialog();
    });
    el.deviceDialog.addEventListener("close", updateFloatingCreateVisibility);
  }
  el.speedQueueToggle.addEventListener("change", () => {
    const enabled = !!el.speedQueueToggle.checked;
    el.speedQueueBox.classList.toggle("hidden", !enabled);
    el.speedSuffix.disabled = enabled;
    el.speedPreviewState.style.display = enabled ? "none" : "";
    el.speedPreviewModel.style.display = enabled ? "none" : "";
    el.speedPreviewIdnr.style.display = enabled ? "none" : "";
    if (!enabled) { el.speedQ1.value = ""; el.speedQ2.value = ""; el.speedQ3.value = ""; updateSpeedPreview(); }
    else { el.speedPreviewState.textContent = "Queue-Modus aktiv."; el.speedPreviewModel.textContent = "Modell: -"; el.speedPreviewIdnr.textContent = "IDNR: -"; }
  });
  el.speedSuffix.addEventListener("input", updateSpeedPreview);
  el.runSpeed.addEventListener("click", runSpeed);
  [el.speedSuffix, el.speedTech, el.speedQ1, el.speedQ2, el.speedQ3].forEach((inp) => inp.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); runSpeed(); } }));
  el.filesRefresh.addEventListener("click", refreshFiles);
  el.filesOpen.addEventListener("click", () => window.api.openPath(state.outputDir));
  el.historyRefresh.addEventListener("click", renderHistory);
  el.historyClear.addEventListener("click", async () => { state.jobHistory = []; state.settings.job_history = []; await persistSettings(); renderHistory(); });
  el.language.addEventListener("change", async () => { state.settings.language = el.language.value; await persistSettings(); });
  el.theme.addEventListener("change", async () => { state.darkMode = el.theme.value === "dark"; state.settings.dark_mode = state.darkMode; applyTheme(); await persistSettings(); });
  el.speedVisible.addEventListener("change", async () => { state.settings.speed_mode_enabled = !!el.speedVisible.checked; updateSpeedVisibility(); await persistSettings(); });
  el.sidebarChartToggle.addEventListener("change", async () => {
    state.settings.sidebar_chart_enabled = !!el.sidebarChartToggle.checked;
    el.sidebarChart.classList.toggle("hidden", !el.sidebarChartToggle.checked);
    await persistSettings();
  });
  el.accent.addEventListener("change", async () => { state.accentColor = el.accent.value; state.settings.accent_color = state.accentColor; applyTheme(); await persistSettings(); });
  el.bgToggle.addEventListener("change", async () => { state.bgAnimEnabled = !!el.bgToggle.checked; state.settings.background_fx = state.bgAnimEnabled; await persistSettings(); });
  el.bgStyle.addEventListener("change", async () => { state.bgPreset = el.bgStyle.value; state.settings.background_preset = state.bgPreset; await persistSettings(); });
  el.chooseOutput.addEventListener("click", async () => {
    const chosen = await window.api.chooseOutputDir(state.outputDir);
    if (!chosen) return;
    state.outputDir = chosen;
    state.settings.output_dir = chosen;
    updateOutputLabels();
    await persistSettings();
    await refreshFiles();
  });
  el.refreshDashboard.addEventListener("click", refreshDashboard);
}

async function bootstrap() {
  bindElements();
  bindNavigation();
  bindFormEvents();
  setupLogo();
  startBackgroundAnimation();
  setBusy(false);
  try {
    const initial = await window.api.getInitialData();
    state.settings = initial.settings || {};
    state.lagerData = initial.lagerData || { exact: {}, suffix: {}, idnr: {} };
    state.lagerSource = initial.lagerSource || null;
    state.printers = initial.printers || [];
    state.templates = initial.templates || { board: [], check: [], labels: [] };
    state.jobHistory = Array.isArray(state.settings.job_history) ? state.settings.job_history : [];
    state.outputDir = cleanText(state.settings.output_dir) || cleanText(initial.runtimePaths?.outputDir) || "";
    setModelOptions(initial.modelOptions || []);
    applySettingsToUi();
    updateOutputLabels();
    syncKNummerUI();
    renderHistory();
    await refreshPrinters({ includeNetworkScan: true });
    await refreshTemplates();
    await refreshFiles();
    await refreshDashboard();
    updateSpeedPreview();
    setPage("home");
    updateFloatingCreateVisibility();
  } catch (err) {
    toast("Startfehler", String(err?.message || err), "error", 4500);
  }
}

document.addEventListener("DOMContentLoaded", bootstrap);
