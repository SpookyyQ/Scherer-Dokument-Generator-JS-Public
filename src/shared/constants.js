const path = require("path");

const APP_ROOT = path.resolve(__dirname, "..", "..");

const PATHS = {
  appRoot: APP_ROOT,
  assetsDir: path.join(APP_ROOT, "assets"),
  boardcardsDir: path.join(APP_ROOT, "boardkarten"),
  checklistsDir: path.join(APP_ROOT, "checklisten"),
  outputDir: path.join(APP_ROOT, "output"),
  lagerFile: path.join(APP_ROOT, "Lager.txt"),
  labelTemplate: path.join(APP_ROOT, "assets", "0_-_Basis_aktuell_-_Kopie.docx"),
  kLabelCandidates: [
    path.join(APP_ROOT, "assets", "0_-_Basis_K-Nummer.docx"),
    path.join(APP_ROOT, "assets", "0_-_Basis_K_Nummer.docx"),
    path.join(APP_ROOT, "assets", "Label_K-Nummer.docx"),
    path.join(APP_ROOT, "assets", "Label_K.docx"),
  ],
};

const DEFAULT_PRINTERS = {
  label: "Drucker_192.168.1.220",
  board: "Drucker_192.168.22.213",
  checklist: "Drucker_192.168.22.213",
};

const CHECKLIST_FIELDS = {
  idnr: "Textfeld 1_4",
  seriennr: "Textfeld 1_3",
  mac: "Textfeld 1_5",
};

module.exports = {
  PATHS,
  DEFAULT_PRINTERS,
  CHECKLIST_FIELDS,
};
