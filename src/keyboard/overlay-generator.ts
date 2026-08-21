import type { Calibration, PianoKey, Point } from "./models";
import { buildKeyProjectionContext, projectKeyPolygon, type KeyProjectionContext } from "./key-projection";
function pointString(points: Point[]): string { return points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" "); }
function keyPolygon(key: PianoKey, calibration: Calibration, ctx: KeyProjectionContext): Point[] {
  return projectKeyPolygon(calibration, key, ctx);
}
export function createOverlaySvg(calibration: Calibration): string {
  const settings = calibration.overlaySettings;
  const keys = calibration.keyMap.filter((key) => key.keyType === "white" ? settings.showWhiteKeys : settings.showBlackKeys);
  const ctx = buildKeyProjectionContext(calibration);
  const polygons = keys.map((key) => `<polygon points="${pointString(keyPolygon(key, calibration, ctx))}" fill="${settings.wireframe ? "none" : settings.fillColor}" fill-opacity="${settings.opacity}" stroke="${settings.lineColor}" stroke-width="${settings.lineWidth}"/>`).join("");
  const labels = settings.showNoteLabels ? keys.filter((key) => key.keyType === "white" && key.midiNote % 12 === 0).map((key) => { const p = keyPolygon(key, calibration, ctx)[0]; return `<text x="${p.x}" y="${p.y}" fill="${settings.lineColor}" font-size="14">${settings.showMidiNumbers ? `${key.noteName} (${key.midiNote})` : key.noteName}</text>`; }).join("") : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${calibration.sourceWidth}" height="${calibration.sourceHeight}">${polygons}${labels}</svg>`;
}
