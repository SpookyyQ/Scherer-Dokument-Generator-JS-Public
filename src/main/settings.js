const fs = require("fs");
const path = require("path");
const { app } = require("electron");

function getSettingsPath() {
  const base = app.getPath("appData");
  return path.join(base, "SchererGenerator", "settings.json");
}

function loadSettings() {
  const p = getSettingsPath();
  try {
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf8");
      const data = JSON.parse(raw);
      if (data && typeof data === "object") {
        return data;
      }
    }
  } catch (_) {
    // ignore
  }
  return {};
}

function saveSettings(settings) {
  const p = getSettingsPath();
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(settings, null, 2), "utf8");
    return true;
  } catch (_) {
    return false;
  }
}

function mergeSettings(partial) {
  const current = loadSettings();
  const next = {
    ...current,
    ...(partial || {}),
  };
  saveSettings(next);
  return next;
}

module.exports = {
  getSettingsPath,
  loadSettings,
  saveSettings,
  mergeSettings,
};
