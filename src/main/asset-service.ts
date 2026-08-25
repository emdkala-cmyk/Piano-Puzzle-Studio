import electron from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";

const { dialog } = electron;

const filters: Record<"image" | "midi" | "audio", { name: string; extensions: string[] }[]> = {
  image: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
  midi: [{ name: "MIDI", extensions: ["mid", "midi"] }],
  audio: [{ name: "Audio", extensions: ["wav", "mp3", "ogg", "m4a"] }]
} as const;

// 🧪 TEST: Read file by absolute path without dialog (DELETE AFTER TESTING)
export async function readAssetByPath(filePath: string) {
  const stat = await fs.stat(filePath);
  const extension = path.extname(filePath).toLowerCase();
  const mimeType = extension === ".jpg" || extension === ".jpeg"
    ? "image/jpeg"
    : extension === ".png"
      ? "image/png"
      : extension === ".mid" || extension === ".midi"
        ? "audio/midi"
        : "application/octet-stream";
  const bytes = await fs.readFile(filePath);
  return { filePath, fileName: path.basename(filePath), fileSize: stat.size, mimeType, dataBase64: bytes.toString("base64") };
}

export async function chooseAsset(type: keyof typeof filters) {
  const result = await dialog.showOpenDialog({ properties: ["openFile"], filters: [...filters[type]] });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  const stat = await fs.stat(filePath);
  const extension = path.extname(filePath).toLowerCase();
  const mimeType = type === "image" ? `image/${extension === ".jpg" || extension === ".jpeg" ? "jpeg" : extension.slice(1)}` : type === "midi" ? "audio/midi" : `audio/${extension.slice(1)}`;
  const bytes = await fs.readFile(filePath);
  return { filePath, fileName: path.basename(filePath), fileSize: stat.size, mimeType, dataBase64: bytes.toString("base64") };
}
