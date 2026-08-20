import { Container, Graphics, Text } from "pixi.js";
import type { Calibration } from "./models";
import { applyTransform } from "./calibration-transform";
import { applyHomography, computeHomography } from "./homography";
function project(calibration: Calibration, point: { x: number; y: number }) {
  const corners = [calibration.transform.topLeft, calibration.transform.topRight, calibration.transform.bottomRight, calibration.transform.bottomLeft];
  const matrix = calibration.homography ?? computeHomography([{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}], corners);
  const p = applyHomography(point, matrix); return { x: p.x * calibration.sourceWidth, y: p.y * calibration.sourceHeight };
}
export function renderCalibration(container: Container, calibration: Calibration, viewWidth: number, viewHeight: number): void {
  const layer = new Container(); const scale = Math.min(viewWidth / calibration.sourceWidth, viewHeight / calibration.sourceHeight);
  const offsetX = (viewWidth - calibration.sourceWidth * scale) / 2, offsetY = (viewHeight - calibration.sourceHeight * scale) / 2;
  const toView = (point: { x: number; y: number }) => ({ x: offsetX + point.x * scale, y: offsetY + point.y * scale });
  calibration.keyMap.forEach((key) => {
    const s = calibration.overlaySettings; if (key.keyType === "white" ? !s.showWhiteKeys : !s.showBlackKeys) return;
    const points = [{x:key.normalizedX,y:key.normalizedY},{x:key.normalizedX+key.normalizedWidth,y:key.normalizedY},{x:key.normalizedX+key.normalizedWidth,y:key.normalizedY+key.normalizedHeight},{x:key.normalizedX,y:key.normalizedY+key.normalizedHeight}].map((p) => toView(project(calibration, p)));
    const graphic = new Graphics(); graphic.poly(points).fill(s.fillColor).stroke({ color: s.lineColor, width: s.lineWidth }); layer.addChild(graphic);
    if (s.showNoteLabels && key.keyType === "white" && key.midiNote % 12 === 0) { const label = new Text({ text: s.showMidiNumbers ? `${key.noteName} ${key.midiNote}` : key.noteName, style: { fill: s.lineColor, fontSize: 11 } }); const p = toView(project(calibration, key.centerPoint)); label.position.set(p.x, p.y); layer.addChild(label); }
  });
  if (calibration.overlaySettings.showAnchors) calibration.anchorPoints.forEach((anchor) => { const p = toView(anchor.point); const marker = new Graphics().circle(p.x, p.y, 5).fill(0xffcc66); layer.addChild(marker); });
  container.removeChildren(); container.addChild(layer);
}
