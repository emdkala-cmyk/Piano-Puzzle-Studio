import electron from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chooseAsset } from "./asset-service.js";

const { app, BrowserWindow, ipcMain } = electron;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#090b14",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.argv.includes("--dev")) {
    void window.loadURL("http://127.0.0.1:5173");
  } else {
    void window.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  ipcMain.handle("app:info", () => ({ name: "Piano Puzzle Studio", version: app.getVersion() }));
  ipcMain.handle("asset:choose", (_event, type: "image" | "midi" | "audio") => chooseAsset(type));
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
