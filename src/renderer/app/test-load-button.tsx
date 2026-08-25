/**
 * TEST BUTTON - DELETE THIS FILE + REMOVE IMPORT FROM App.tsx
 * Loads files from test folder and auto-configures the app.
 */

const TEST_DIR = "C:/Users/MEHDI/Desktop/test";

async function readFileByPath(filePath: string) {
  const result = await (window as any).pianoPuzzle?.readAssetByPath(filePath);
  if (!result) throw new Error("Failed to read: " + filePath);
  return result;
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
  onStatus("1/5 loading piano...");
  const piano = await readFileByPath(TEST_DIR + "/1.jpg");
  await cb.acceptReferenceFrame(piano.filePath, piano.fileName, piano.mimeType, "data:" + piano.mimeType + ";base64," + piano.dataBase64, piano.fileSize);
  await sleep(800);

  onStatus("2/5 loading artwork...");
  const puzzle = await readFileByPath(TEST_DIR + "/2.png");
  await cb.acceptPuzzleArtwork(puzzle.filePath, puzzle.fileName, puzzle.mimeType, "data:" + puzzle.mimeType + ";base64," + puzzle.dataBase64, puzzle.fileSize);
  await sleep(800);

  onStatus("3/5 loading MIDI...");
  const midi = await readFileByPath(TEST_DIR + "/3.mid");
  await cb.importMidiFromDataUrl(midi.dataBase64, midi.fileName);
  await sleep(800);

  // Set hybrid mode via React state
  onStatus("4/5 setting hybrid mode...");
  cb.setGeometryMode("hybrid");
  await sleep(500);

  // Also set the select DOM element to ensure it's in sync
  const selects = Array.from(document.querySelectorAll("select")) as HTMLSelectElement[];
  const hybridSelect = selects.find((s) => s.value !== "hybrid" && Array.from(s.options).some((o) => o.value === "hybrid"));
  if (hybridSelect) {
    hybridSelect.value = "hybrid";
    hybridSelect.dispatchEvent(new Event("change", { bubbles: true }));
  }
  await sleep(300);

  // Click Generate Puzzle Pieces
  onStatus("4/5 generating pieces...");
  let genOk = clickButton("Generate Puzzle Pieces");
  onStatus("4/5 generate: " + (genOk ? "clicked" : "button not found"));
  await sleep(2000);

  // Click Run Mapping
  onStatus("5/5 running mapping...");
  let mapOk = clickButton("Run Mapping");
  onStatus("5/5 mapping: " + (mapOk ? "clicked" : "button not found"));
  await sleep(1000);

  // Load preset
  onStatus("loading preset...");
  cb.loadFxPreset("4");

  onStatus("Done!");
}
