const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getInitialData: () => ipcRenderer.invoke("app:get-initial-data"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  updateSettings: (partial) => ipcRenderer.invoke("settings:update", partial),

  reloadData: () => ipcRenderer.invoke("data:reload"),
  setDataProvider: (config) => ipcRenderer.invoke("data:set-provider", config),

  resolveTemplates: (modell) => ipcRenderer.invoke("templates:resolve", modell),

  listPrinters: () => ipcRenderer.invoke("printers:list"),
  checkPrinterReachability: (names) => ipcRenderer.invoke("printers:reachability", names),

  runJob: (payload) => ipcRenderer.invoke("job:run", payload),

  listFiles: (outputDir) => ipcRenderer.invoke("files:list", outputDir),
  chooseOutputDir: (current) => ipcRenderer.invoke("dialog:choose-output-dir", current),

  openPath: (targetPath) => ipcRenderer.invoke("shell:open-path", targetPath),
  openFile: (filePath) => ipcRenderer.invoke("shell:open-file", filePath),

  scanDevices: (payload) => ipcRenderer.invoke("devices:scan", payload),
});
