import electron from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chooseAsset, readAssetByPath } from "./asset-service.js";

const { app, BrowserWindow, ipcMain } = electron;

// Force Hardware Accelerated GPU & WebGL / WebGPU rasterization
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("enable-native-gpu-memory-buffers");
app.commandLine.appendSwitch("enable-webgl");
app.commandLine.appendSwitch("enable-webgl2-compute-context");
app.commandLine.appendSwitch("enable-accelerated-2d-canvas");
app.commandLine.appendSwitch("enable-accelerated-video-decode");
app.commandLine.appendSwitch("use-gl", "desktop"); // Use dedicated GPU GL driver

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
      nodeIntegration: false,
      webgl: true
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
  // 🧪 TEST: Read file by path (DELETE AFTER TESTING)
  ipcMain.handle("asset:read-by-path", (_event, filePath: string) => readAssetByPath(filePath));
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
