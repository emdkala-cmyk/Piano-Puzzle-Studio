/**
 * TEST BUTTON - DELETE THIS FILE + IMPORT FROM App.tsx
 * Loads files from test folder and auto-configures the app.
 */

const TEST_DIR = "C:/Users/MEHDI/Desktop/test";

async function readFileByPath(filePath: string): Promise<{ filePath: string; fileName: string; fileSize: number; mimeType: string; dataBase64: string }> {
  const result = await (window as any).pianoPuzzle?.readAssetByPath(filePath);
  if (!result) throw new Error("Failed to read: " + filePath);
  return result;
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
  onStatus("1/5 loading piano image...");
  const piano = await readFileByPath(TEST_DIR + "/1.jpg");
  await cb.acceptReferenceFrame(piano.filePath, piano.fileName, piano.mimeType, "data:" + piano.mimeType + ";base64," + piano.dataBase64, piano.fileSize);
  cb.setPianoPlacement((prev: any) => ({ ...prev, zoom: 2.50 }));
  await new Promise((r) => setTimeout(r, 200));

  onStatus("2/5 loading puzzle image...");
  const puzzle = await readFileByPath(TEST_DIR + "/2.png");
  await cb.acceptPuzzleArtwork(puzzle.filePath, puzzle.fileName, puzzle.mimeType, "data:" + puzzle.mimeType + ";base64," + puzzle.dataBase64, puzzle.fileSize);
  cb.setArtworkPlacement((prev: any) => ({ ...prev, zoom: 2.80 }));
  await new Promise((r) => setTimeout(r, 200));

  onStatus("3/5 loading MIDI...");
  const midi = await readFileByPath(TEST_DIR + "/3.mid");
  await cb.importMidiFromDataUrl(midi.dataBase64, midi.fileName);
  await new Promise((r) => setTimeout(r, 200));

  onStatus("4/5 generating hybrid puzzle...");
  cb.setGeometryMode("hybrid");
  await new Promise((r) => setTimeout(r, 100));
  cb.generatePieces();
  await new Promise((r) => setTimeout(r, 500));

  onStatus("5/5 running mapping...");
  cb.runMapping();
  await new Promise((r) => setTimeout(r, 500));

  onStatus("loading preset...");
  cb.loadFxPreset("4");

  onStatus("Done!");
}
