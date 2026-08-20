import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("pianoPuzzle", {
  getAppInfo: () => ipcRenderer.invoke("app:info"),
  chooseAsset: (type: "image" | "midi" | "audio") => ipcRenderer.invoke("asset:choose", type)
});
