const fs = require("fs");

const docs = require("./docsGenerator");
const printing = require("./printing");

async function runJob({
  modell,
  idnr,
  seriennr,
  techniker = "",
  mac = "",
  outputDir,
  shouldPrint = false,
  jobOptions = null,
  printerLabelId = null,
  printerBoardId = null,
  printerChecklistId = null,
  labelTemplateOverride = null,
  hasKNummer = false,
  useKLabel = true,
}) {
  const effectiveJobOptions = {
    createLabel: jobOptions?.createLabel !== false,
    createBoard: jobOptions?.createBoard !== false,
    createChecklist: jobOptions?.createChecklist !== false,
    printLabel: jobOptions?.printLabel !== false,
    printBoard: jobOptions?.printBoard !== false,
    printChecklist: jobOptions?.printChecklist !== false,
  };
  if (!effectiveJobOptions.createLabel && !effectiveJobOptions.createBoard && !effectiveJobOptions.createChecklist) {
    throw new Error("Es wurde kein Dokumenttyp für die Erstellung ausgewählt.");
  }

  let effectiveLabelTemplate = labelTemplateOverride || null;
  if (!effectiveLabelTemplate && useKLabel) {
    const kTemplate = docs.resolveKLabelTemplate(Boolean(hasKNummer));
    if (kTemplate) {
      effectiveLabelTemplate = kTemplate;
    }
  }

  const generated = await docs.generateDocuments({
    modell,
    idnr,
    seriennr,
    techniker,
    mac,
    outputDir,
    labelTemplateOverride: effectiveLabelTemplate,
    createOptions: {
      label: effectiveJobOptions.createLabel,
      board: effectiveJobOptions.createBoard,
      checklist: effectiveJobOptions.createChecklist,
    },
  });

  let printResults = null;
  if (shouldPrint) {
    printResults = [];

    if (effectiveJobOptions.printLabel) {
      if (generated.labelPath && fs.existsSync(generated.labelPath)) {
        const res = await printing.druckeLabel(generated.labelPath, printerLabelId);
        printResults.push({ name: "Label", ok: res.ok, log: res.log });
      } else {
        printResults.push({ name: "Label", ok: false, log: "Label-Datei fehlt." });
      }
    }

    if (effectiveJobOptions.printBoard) {
      if (generated.boardPath && fs.existsSync(generated.boardPath)) {
        const res = await printing.druckeBoardkarte(generated.boardPath, printerBoardId);
        printResults.push({ name: "Boardkarte", ok: res.ok, log: res.log });
      } else {
        printResults.push({ name: "Boardkarte", ok: false, log: "Boardkarte-Datei fehlt." });
      }
    }

    if (effectiveJobOptions.printChecklist) {
      if (generated.checklistPath && fs.existsSync(generated.checklistPath)) {
        const res = await printing.druckeCheckliste(generated.checklistPath, printerChecklistId);
        printResults.push({ name: "Checkliste", ok: res.ok, log: res.log });
      } else {
        printResults.push({ name: "Checkliste", ok: false, log: "Checkliste-Datei fehlt oder keine Vorlage vorhanden." });
      }
    }
  }

  return {
    boardPath: generated.boardPath,
    labelPath: generated.labelPath,
    checklistPath: generated.checklistPath,
    printResults,
    debug: {
      boardTemplate: generated.boardTemplate,
      boardDeviceText: generated.boardDeviceText,
      actualDeviceText: generated.actualDeviceText,
    },
  };
}

module.exports = {
  runJob,
};
