/**
 * TEST BUTTON - DELETE THIS FILE + REMOVE IMPORT FROM App.tsx
 * Loads files from test folder and auto-configures the app.
 */

const TEST_DIR = "C:/Users/MEHDI/Desktop/test";
const BROWSER_TEST_BASE = "/test";
const MIME_MAP: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", mid: "audio/midi", midi: "audio/midi" };

async function readFileByPath(filePath: string) {
  // Try Electron API first
  const readFn = (window as any).pianoPuzzle?.readAssetByPath;
  if (typeof readFn === "function") {
    const electronResult = await readFn(filePath);
    if (electronResult) return electronResult;
  }
  // Browser fallback: fetch from public/test/
  const fileName = filePath.split("/").pop() ?? filePath;
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const mime = MIME_MAP[ext] ?? "application/octet-stream";
  const resp = await fetch(`${BROWSER_TEST_BASE}/${fileName}`);
  if (!resp.ok) throw new Error("Failed to fetch: " + fileName + " (" + resp.status + ")");
  const blob = await resp.blob();
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      resolve(dataUrl.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return { filePath: fileName, fileName, mimeType: mime, fileSize: blob.size, dataBase64: base64 };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function clickButton(textIncludes: string) {
  const buttons = Array.from(document.querySelectorAll("button")) as HTMLButtonElement[];
  const btn = buttons.find((b) => b.textContent?.includes(textIncludes) && !b.disabled);
  if (btn) { btn.click(); return true; }
  return false;
}

export interface TestLoadCallbacks {
  acceptReferenceFrame: (filePath: string, fileName: string, mimeType: string, dataUrl: string, fileSize: number) => Promise<void>;
  acceptPuzzleArtwork: (filePath: string, fileName: string, mimeType: string, dataUrl: string, fileSize: number) => Promise<void>;
  importMidiFromDataUrl: (dataBase64: string, fileName: string) => Promise<void>;
  setGeometryMode: (mode: "grid" | "voronoi" | "delaunay" | "hybrid") => void;
  generatePieces: () => void;
  runMapping: () => void;
  loadFxPreset: (name: string) => void;
  setPianoPlacement: (updater: (prev: any) => any) => void;
  setArtworkPlacement: (updater: (prev: any) => any) => void;
}

export async function runTestLoad(cb: TestLoadCallbacks, onStatus: (msg: string) => void): Promise<void> {
  onStatus("1/7 loading piano...");
  const piano = await readFileByPath(TEST_DIR + "/1.jpg");
  await cb.acceptReferenceFrame(piano.filePath, piano.fileName, piano.mimeType, "data:" + piano.mimeType + ";base64," + piano.dataBase64, piano.fileSize);
  await sleep(800);

  onStatus("2/7 loading artwork...");
  const puzzle = await readFileByPath(TEST_DIR + "/2.png");
  await cb.acceptPuzzleArtwork(puzzle.filePath, puzzle.fileName, puzzle.mimeType, "data:" + puzzle.mimeType + ";base64," + puzzle.dataBase64, puzzle.fileSize);
  await sleep(800);

  onStatus("3/7 loading MIDI...");
  const midi = await readFileByPath(TEST_DIR + "/3.mid");
  await cb.importMidiFromDataUrl(midi.dataBase64, midi.fileName);
  await sleep(800);

  // Set hybrid mode
  onStatus("4/7 hybrid mode...");
  cb.setGeometryMode("hybrid");
  await sleep(500);

  const selects = Array.from(document.querySelectorAll("select")) as HTMLSelectElement[];
  const hybridSelect = selects.find((s) => s.value !== "hybrid" && Array.from(s.options).some((o) => o.value === "hybrid"));
  if (hybridSelect) {
    hybridSelect.value = "hybrid";
    hybridSelect.dispatchEvent(new Event("change", { bubbles: true }));
  }
  await sleep(300);

  // Generate
  onStatus("4/7 generating...");
  clickButton("Generate Puzzle Pieces");
  await sleep(2000);

  // Mapping
  onStatus("5/7 mapping...");
  clickButton("Run Mapping");
  await sleep(1000);

  // Preset
  onStatus("6/7 preset...");
  cb.loadFxPreset("4");
  await sleep(500);

  // Switch to puzzle preview tab
  onStatus("6/7 puzzle preview tab...");
  clickButton("Puzzle Animation Preview");
  await sleep(500);

  // Click Play
  onStatus("7/7 playing...");
  clickButton("Play");
  await sleep(300);

  onStatus("Done! Playing...");
}
