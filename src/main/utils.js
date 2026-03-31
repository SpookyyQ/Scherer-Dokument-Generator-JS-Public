const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

function cleanText(value) {
  return String(value ?? "").trim().replace(/^'+|'+$/g, "").trim();
}

function normSeriennummer(value) {
  return cleanText(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normIdnr(value) {
  return cleanText(value).replace(/\D/g, "");
}

function extractIpv4(value) {
  const text = String(value ?? "").trim();
  const m = text.match(/((?:\d{1,3}\.){3}\d{1,3})/);
  return m ? m[1] : "";
}

function runPowerShell(script, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const args = [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8; " + script,
    ];

    const child = spawn("powershell", args, { windowsHide: true });

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
        reject(new Error(`PowerShell timeout after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    child.stdout.on("data", (d) => {
      stdout += d.toString("utf8");
    });

    child.stderr.on("data", (d) => {
      stderr += d.toString("utf8");
    });

    child.on("error", (err) => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        reject(err);
      }
    });

    child.on("close", (code) => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      }
    });
  });
}

function ensureDirSync(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function safeFileName(value) {
  return String(value ?? "").replace(/[^A-Za-z0-9]/g, "_");
}

function pathExists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch (_) {
    return false;
  }
}

function isKyocera(entry) {
  const name = String(entry?.name ?? "").toLowerCase();
  const driver = String(entry?.driver ?? "").toLowerCase();
  return name.includes("kyocera") || driver.includes("kyocera");
}

function getNowLocalString() {
  const now = new Date();
  const pad = (v) => String(v).padStart(2, "0");
  return `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function toPosixPath(p) {
  return p.split(path.sep).join("/");
}

module.exports = {
  cleanText,
  normSeriennummer,
  normIdnr,
  extractIpv4,
  runPowerShell,
  ensureDirSync,
  safeFileName,
  pathExists,
  isKyocera,
  getNowLocalString,
  toPosixPath,
};
