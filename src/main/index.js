const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");

const { PATHS, DEFAULT_PRINTERS } = require("../shared/constants");
const { TxtDataProvider, SqlDataProvider } = require("./dataProvider");
const docs = require("./docsGenerator");
const printing = require("./printing");
const { runJob } = require("./jobRunner");
const { scanDevices } = require("./deviceScanner");
const { loadSettings, mergeSettings, saveSettings } = require("./settings");
const { cleanText } = require("./utils");

let mainWindow = null;
let dataProvider = null;
let lagerData = { exact: {}, suffix: {}, idnr: {} };
let lagerSource = null;

function ensureProjectDirs() {
  for (const dir of [PATHS.assetsDir, PATHS.boardcardsDir, PATHS.checklistsDir, PATHS.outputDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function defaultSettings() {
  return {
    printer_label: DEFAULT_PRINTERS.label,
    printer_board: DEFAULT_PRINTERS.board,
    printer_checklist: DEFAULT_PRINTERS.checklist,
    job_history: [],
    sidebar_chart_enabled: false,
    device_only_printers: true,
    device_scan_cidr: "192.168.1.0/24,192.168.22.0/24",
    speed_mode_enabled: false,
    language: "de",
    dark_mode: true,
    accent_color: "#ff3b30",
    background_fx: false,
    background_preset: "current",
    output_dir: PATHS.outputDir,
  };
}

function getSettingsMerged() {
  const merged = {
    ...defaultSettings(),
    ...loadSettings(),
  };
  if (!Array.isArray(merged.job_history)) {
    merged.job_history = [];
  }
  return merged;
}

async function reloadLagerData() {
  try {
    const res = await dataProvider.loadIndex();
    lagerData = res.index || { exact: {}, suffix: {}, idnr: {} };
    lagerSource = res.source || null;
  } catch (_) {
    lagerData = { exact: {}, suffix: {}, idnr: {} };
    lagerSource = null;
  }

  return { lagerData, lagerSource };
}

function getModelOptions() {
  try {
    return docs.buildModelOptions(lagerData);
  } catch (_) {
    return [];
  }
}

function listTemplates() {
  const board = fs.existsSync(PATHS.boardcardsDir)
    ? fs.readdirSync(PATHS.boardcardsDir).filter((f) => f.toLowerCase().endsWith(".xlsx")).sort()
    : [];
  const check = fs.existsSync(PATHS.checklistsDir)
    ? fs.readdirSync(PATHS.checklistsDir).filter((f) => f.toLowerCase().endsWith(".pdf")).sort()
    : [];
  const labels = fs.existsSync(PATHS.assetsDir)
    ? fs.readdirSync(PATHS.assetsDir).filter((f) => f.toLowerCase().endsWith(".docx")).sort()
    : [];
  return { board, check, labels };
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 920,
    minWidth: 1120,
    minHeight: 760,
    title: "Scherer - Dokumenten-Generator (JS)",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
}

function setupProvider() {
  dataProvider = new TxtDataProvider([
    PATHS.lagerFile,
    path.join(PATHS.assetsDir, "Lager.txt"),
    path.join(app.getPath("desktop"), "Scherer", "Lager.txt"),
  ]);
}

function setupIpc() {
  ipcMain.handle("app:get-initial-data", async () => {
    const settings = getSettingsMerged();

    if (cleanText(settings.printer_label) || cleanText(settings.printer_board) || cleanText(settings.printer_checklist)) {
      printing.setRuntimePrinterTargets({
        label: settings.printer_label,
        board: settings.printer_board,
        checklist: settings.printer_checklist,
      });
    }

    await reloadLagerData();

    const printers = await printing.getPrinterList([]).catch(() => []);
    const templates = listTemplates();

    return {
      settings,
      lagerData,
      lagerSource,
      printers,
      templates,
      modelOptions: getModelOptions(),
      runtimePaths: {
        appRoot: PATHS.appRoot,
        outputDir: settings.output_dir || PATHS.outputDir,
      },
    };
  });

  ipcMain.handle("settings:get", async () => getSettingsMerged());

  ipcMain.handle("settings:update", async (_event, partial) => {
    const current = getSettingsMerged();
    const next = {
      ...current,
      ...(partial || {}),
    };
    saveSettings(next);

    printing.setRuntimePrinterTargets({
      label: next.printer_label,
      board: next.printer_board,
      checklist: next.printer_checklist,
    });

    return next;
  });

  ipcMain.handle("data:reload", async () => {
    await reloadLagerData();
    return {
      lagerData,
      lagerSource,
      modelOptions: getModelOptions(),
    };
  });

  ipcMain.handle("data:set-provider", async (_event, config) => {
    const kind = String(config?.kind || "txt").toLowerCase();
    if (kind === "sql") {
      dataProvider = new SqlDataProvider({
        connection: config.connection,
        query: config.query,
        idnrCol: config.idnrCol || "idnr",
        modellCol: config.modellCol || "modell",
        serienCol: config.serienCol || "seriennr",
        technikerCol: config.technikerCol || "techniker",
      });
    } else {
      dataProvider = new TxtDataProvider(config?.candidates || [PATHS.lagerFile]);
    }

    await reloadLagerData();
    return {
      lagerData,
      lagerSource,
      modelOptions: getModelOptions(),
    };
  });

  ipcMain.handle("templates:resolve", async (_event, modell) => {
    const board = docs.findBoardkarteTemplate(modell || "");
    if (!board.best) {
      return { board: null, checklist: null };
    }

    const ck = docs.findChecklisteTemplate(path.parse(board.best).name);
    return {
      board: path.basename(board.best),
      checklist: ck.best ? path.basename(ck.best) : null,
    };
  });

  ipcMain.handle("printers:list", async () => {
    const printers = await printing.getPrinterList([]).catch(() => []);
    return printers;
  });

  ipcMain.handle("printers:reachability", async (_event, names) => {
    const printers = await printing.getPrinterList([]).catch(() => []);
    const entries = {};
    for (const key of ["label", "board", "checklist"]) {
      const name = names?.[key] || "";
      entries[key] = await printing.checkPrinterReachable(printers, name);
    }
    return entries;
  });

  ipcMain.handle("job:run", async (_event, payload) => {
    const result = await runJob(payload);
    return result;
  });

  ipcMain.handle("files:list", async (_event, outputDir) => {
    const out = outputDir || PATHS.outputDir;
    fs.mkdirSync(out, { recursive: true });

    const files = [];
    const stack = [out];
    while (stack.length > 0) {
      const dir = stack.pop();
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          stack.push(full);
        } else if (e.isFile()) {
          const stat = fs.statSync(full);
          files.push({
            path: full,
            relative: path.relative(out, full),
            mtimeMs: stat.mtimeMs,
            size: stat.size,
          });
        }
      }
    }

    files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return files;
  });

  ipcMain.handle("dialog:choose-output-dir", async (_event, current) => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: "Output-Ordner ändern",
      properties: ["openDirectory", "createDirectory"],
      defaultPath: current || PATHS.outputDir,
    });

    if (res.canceled || !res.filePaths || res.filePaths.length === 0) {
      return null;
    }

    return res.filePaths[0];
  });

  ipcMain.handle("shell:open-path", async (_event, targetPath) => {
    if (!targetPath) {
      return false;
    }
    fs.mkdirSync(targetPath, { recursive: true });
    await shell.openPath(targetPath);
    return true;
  });

  ipcMain.handle("shell:open-file", async (_event, filePath) => {
    if (!filePath || !fs.existsSync(filePath)) {
      return false;
    }
    await shell.openPath(filePath);
    return true;
  });

  ipcMain.handle("devices:scan", async (_event, payload) => {
    const devices = await scanDevices({
      printers: payload?.printers || [],
      lagerData: payload?.lagerData || lagerData,
      networkCidr: payload?.networkCidr || "",
      onProgress: null,
    });
    return devices;
  });
}

app.whenReady().then(async () => {
  ensureProjectDirs();
  setupProvider();
  await reloadLagerData();
  setupIpc();
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
