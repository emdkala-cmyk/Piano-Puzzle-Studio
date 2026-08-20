import type { Calibration, PianoKey, Point } from "./models";
import { applyHomography, computeHomography } from "./homography";
function pointString(points: Point[]): string { return points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" "); }
function keyPolygon(key: PianoKey, calibration: Calibration): Point[] {
  const x = key.normalizedX, y = key.normalizedY, w = key.normalizedWidth, h = key.normalizedHeight;
  const matrix = calibration.homography ?? computeHomography([{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}], [calibration.transform.topLeft,calibration.transform.topRight,calibration.transform.bottomRight,calibration.transform.bottomLeft]);
  return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }].map((p) => { const q = applyHomography(p, matrix); return { x: q.x * calibration.sourceWidth, y: q.y * calibration.sourceHeight }; });
}
export function createOverlaySvg(calibration: Calibration): string {
  const settings = calibration.overlaySettings;
  const keys = calibration.keyMap.filter((key) => key.keyType === "white" ? settings.showWhiteKeys : settings.showBlackKeys);
  const polygons = keys.map((key) => `<polygon points="${pointString(keyPolygon(key, calibration))}" fill="${settings.wireframe ? "none" : settings.fillColor}" fill-opacity="${settings.opacity}" stroke="${settings.lineColor}" stroke-width="${settings.lineWidth}"/>`).join("");
  const labels = settings.showNoteLabels ? keys.filter((key) => key.keyType === "white" && key.midiNote % 12 === 0).map((key) => { const p = keyPolygon(key, calibration)[0]; return `<text x="${p.x}" y="${p.y}" fill="${settings.lineColor}" font-size="14">${settings.showMidiNumbers ? `${key.noteName} (${key.midiNote})` : key.noteName}</text>`; }).join("") : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${calibration.sourceWidth}" height="${calibration.sourceHeight}">${polygons}${labels}</svg>`;
}
