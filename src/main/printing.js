const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const { DEFAULT_PRINTERS } = require("../shared/constants");
const {
  cleanText,
  extractIpv4,
  runPowerShell,
  isKyocera,
} = require("./utils");

const runtimePrinters = {
  label: DEFAULT_PRINTERS.label,
  board: DEFAULT_PRINTERS.board,
  checklist: DEFAULT_PRINTERS.checklist,
};

const PY_BRIDGE_CANDIDATES = [
  path.join(__dirname, "printing_bridge.py"),
  path.join(process.cwd(), "src", "main", "printing_bridge.py"),
];

async function runCommand(command, args, timeoutMs = 120000) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    let done = false;

    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        try {
          child.kill();
        } catch (_) {
          // ignore
        }
        resolve({ code: -1, stdout, stderr: `${stderr}\nTimeout after ${timeoutMs}ms` });
      }
    }, timeoutMs);

    child.stdout.on("data", (d) => {
      stdout += d.toString("utf8");
    });

    child.stderr.on("data", (d) => {
      stderr += d.toString("utf8");
    });

    child.on("close", (code) => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      }
    });

    child.on("error", (err) => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve({ code: -1, stdout, stderr: String(err?.message || err) });
      }
    });
  });
}

function getPythonBridgePath() {
  for (const p of PY_BRIDGE_CANDIDATES) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function parseJsonLine(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(lines[i]);
    } catch (_) {
      // continue
    }
  }
  return null;
}

async function runPythonBridge(action, filePath, printerIdentifier, timeoutMs = 180000) {
  const scriptPath = getPythonBridgePath();
  if (!scriptPath) {
    return { ok: false, log: "Python-Bridge nicht gefunden." };
  }

  const args = [scriptPath, "--action", action, "--file", filePath, "--printer", String(printerIdentifier || "")];
  let result = await runCommand("py", ["-3", ...args], timeoutMs);

  if (result.code === -1 && /ENOENT|not recognized|nicht als/i.test(String(result.stderr || ""))) {
    result = await runCommand("python", args, timeoutMs);
  }

  const payload = parseJsonLine(result.stdout);
  if (payload && typeof payload.ok === "boolean") {
    return { ok: payload.ok, log: String(payload.log || "").trim() };
  }

  const err = String(result.stderr || "").trim();
  const out = String(result.stdout || "").trim();
  return {
    ok: false,
    log: [
      "Python-Bridge lieferte kein gueltiges Ergebnis.",
      `RC=${result.code}`,
      out ? `stdout: ${out.slice(0, 400)}` : "",
      err ? `stderr: ${err.slice(0, 400)}` : "",
    ].filter(Boolean).join("\n"),
  };
}

async function getPrinterList(log = null) {
  const script = [
    "Get-Printer | ForEach-Object {",
    "  $pname = $_.PortName;",
    "  $port = Get-PrinterPort -Name $pname -ErrorAction SilentlyContinue;",
    "  $phost = if($port -and $port.PrinterHostAddress) { $port.PrinterHostAddress } else { '' };",
    "  Write-Output ($_.Name + '|' + $pname + '|' + $phost + '|' + $_.DriverName)",
    "}",
  ].join(" ");

  const result = await runPowerShell(script, 25000).catch((err) => ({ code: -1, stdout: "", stderr: String(err?.message || err) }));
  if (result.code !== 0 && log) {
    log.push(`  PowerShell-Fehler: ${(result.stderr || "").trim().slice(0, 220)}`);
  }

  const data = [];
  const lines = (result.stdout || "").split(/\r?\n/);
  for (const line of lines) {
    const parts = line.trim().split("|");
    if (parts.length < 4) continue;
    const [name, port, host, driver] = parts.map((p) => p.trim());
    if (!name) continue;
    data.push({ name, port, host, driver });
  }
  return data;
}

function isIp(value) {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(String(value ?? "").trim());
}

async function resolvePrinterName(identifier, log = []) {
  const ident = String(identifier ?? "").trim();
  if (!ident) {
    log.push("  FEHLER: Kein Drucker-Name/IP angegeben.");
    return null;
  }

  log.push(`  Suche Drucker für '${ident}' ...`);
  const printers = await getPrinterList(log);

  if (printers.length === 0) {
    log.push("  FEHLER: Keine installierten Drucker gefunden.");
    return null;
  }

  const exact = printers.find((p) => p.name.toLowerCase() === ident.toLowerCase());
  if (exact) return exact.name;

  if (isIp(ident)) {
    const candidates = printers.filter(
      (p) => String(p.port || "").includes(ident) || String(p.host || "").includes(ident) || String(p.name || "").includes(ident),
    );
    if (candidates.length > 0) {
      candidates.sort((a, b) => {
        const ka = [
          a.host === ident ? 0 : 1,
          String(a.port || "").includes(ident) ? 0 : 1,
          String(a.port || "").toLowerCase().includes("ipp") ? 0 : 1,
          String(a.name || "").toLowerCase(),
        ];
        const kb = [
          b.host === ident ? 0 : 1,
          String(b.port || "").includes(ident) ? 0 : 1,
          String(b.port || "").toLowerCase().includes("ipp") ? 0 : 1,
          String(b.name || "").toLowerCase(),
        ];
        return ka.join("|").localeCompare(kb.join("|"));
      });
      return candidates[0].name;
    }
  }

  const partial = printers.find((p) => p.name.toLowerCase().includes(ident.toLowerCase()));
  return partial ? partial.name : null;
}

async function forceKyoceraPrinter(printerName, log = []) {
  const list = await getPrinterList(log);
  if (list.length === 0) return null;

  const chosen = list.find((p) => p.name.toLowerCase() === String(printerName || "").trim().toLowerCase()) || null;
  if (chosen && isKyocera(chosen)) return chosen.name;

  const kyocera = list.find((p) => isKyocera(p));
  return kyocera ? kyocera.name : null;
}

async function druckeLabel(filePath, printerIdentifier) {
  const target = String(printerIdentifier || "").trim() || runtimePrinters.label;
  const py = await runPythonBridge("label", path.resolve(filePath), target, 180000);
  return { ok: py.ok, log: py.log };
}

async function druckeBoardkarte(filePath, printerIdentifier) {
  const target = String(printerIdentifier || "").trim() || runtimePrinters.board;
  const py = await runPythonBridge("board", path.resolve(filePath), target, 240000);
  return { ok: py.ok, log: py.log };
}

async function druckeCheckliste(filePath, printerIdentifier) {
  const target = String(printerIdentifier || "").trim() || runtimePrinters.checklist || runtimePrinters.board;
  const py = await runPythonBridge("checklist", path.resolve(filePath), target, 240000);
  return { ok: py.ok, log: py.log };
}

async function druckeAlle({
  labelPfad,
  boardkartePfad,
  checklistePfad = null,
  druckerLabelId = null,
  druckerBoardId = null,
  druckerChecklisteId = null,
}) {
  const out = [];
  const labelTarget = druckerLabelId || runtimePrinters.label;
  const boardTarget = druckerBoardId || runtimePrinters.board;
  const checklistTarget = druckerChecklisteId || runtimePrinters.checklist || boardTarget;

  if (labelPfad && fs.existsSync(labelPfad)) {
    const result = await druckeLabel(labelPfad, labelTarget).catch((err) => ({ ok: false, log: `FEHLER: ${String(err?.message || err)}` }));
    out.push({ name: "Label", ok: result.ok, log: result.log });
  }

  if (boardkartePfad && fs.existsSync(boardkartePfad)) {
    const result = await druckeBoardkarte(boardkartePfad, boardTarget).catch((err) => ({ ok: false, log: `FEHLER: ${String(err?.message || err)}` }));
    out.push({ name: "Boardkarte", ok: result.ok, log: result.log });
  }

  if (checklistePfad && fs.existsSync(checklistePfad)) {
    const result = await druckeCheckliste(checklistePfad, checklistTarget).catch((err) => ({ ok: false, log: `FEHLER: ${String(err?.message || err)}` }));
    out.push({ name: "Checkliste", ok: result.ok, log: result.log });
  }

  return out;
}

async function pingHost(host) {
  const target = String(host || "").trim();
  if (!target) return false;
  const result = await runCommand("ping", ["-n", "1", "-w", "700", target], 2000);
  return result.code === 0;
}

function findPrinterMeta(printers, printerName) {
  const name = String(printerName || "").trim().toLowerCase();
  if (!name) return null;
  return printers.find((p) => String(p.name || "").trim().toLowerCase() === name) || null;
}

async function checkPrinterReachable(printers, printerName) {
  const name = String(printerName || "").trim();
  if (!name) {
    return { state: null, tip: "Kein Drucker ausgewählt." };
  }

  const meta = findPrinterMeta(printers, name);
  if (!meta) {
    return { state: false, tip: "Drucker nicht in der aktuellen Windows-Liste gefunden." };
  }

  let host = cleanText(meta.host);
  if (!host) host = extractIpv4(meta.port);

  if (host) {
    const ok = await pingHost(host);
    return { state: ok, tip: `Host ${host} ${ok ? "erreichbar" : "nicht erreichbar"}.` };
  }

  return { state: true, tip: "Lokaler/WSD-Drucker ohne IP-Host (keine Ping-Prüfung)." };
}

function setRuntimePrinterTargets({ label, board, checklist }) {
  if (label) runtimePrinters.label = String(label).trim();
  if (board) runtimePrinters.board = String(board).trim();
  if (checklist) runtimePrinters.checklist = String(checklist).trim();
}

function getRuntimePrinterTargets() {
  return { ...runtimePrinters };
}

module.exports = {
  getPrinterList,
  resolvePrinterName,
  forceKyoceraPrinter,
  druckeLabel,
  druckeBoardkarte,
  druckeCheckliste,
  druckeAlle,
  setRuntimePrinterTargets,
  getRuntimePrinterTargets,
  checkPrinterReachable,
};
