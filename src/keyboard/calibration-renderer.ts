import { Container, Graphics, Text } from "pixi.js";
import type { Calibration } from "./models";
import { applyTransform } from "./calibration-transform";
import { buildKeyProjectionContext, projectKeyCenter, projectKeyPolygon } from "./key-projection";
import { computeViewProjection, toViewPoint } from "./view-projection";
export function renderCalibration(container: Container, calibration: Calibration, viewWidth: number, viewHeight: number): void {
  const layer = new Container();
  const projection = computeViewProjection(calibration, viewWidth, viewHeight);
  const toView = (point: { x: number; y: number }) => toViewPoint(point, projection);
  const ctx = buildKeyProjectionContext(calibration);
  calibration.keyMap.forEach((key) => {
    const s = calibration.overlaySettings; if (key.keyType === "white" ? !s.showWhiteKeys : !s.showBlackKeys) return;
    const points = projectKeyPolygon(calibration, key, ctx).map(toView);
    const graphic = new Graphics(); graphic.poly(points).fill(s.fillColor).stroke({ color: s.lineColor, width: s.lineWidth }); layer.addChild(graphic);
    if (s.showNoteLabels && key.keyType === "white" && key.midiNote % 12 === 0) { const label = new Text({ text: s.showMidiNumbers ? `${key.noteName} ${key.midiNote}` : key.noteName, style: { fill: s.lineColor, fontSize: 11 } }); const p = toView(projectKeyCenter(calibration, key, ctx)); label.position.set(p.x, p.y); layer.addChild(label); }
  });
  if (calibration.overlaySettings.showAnchors) calibration.anchorPoints.forEach((anchor) => { const p = toView(anchor.point); const marker = new Graphics().circle(p.x, p.y, 5).fill(anchor.placed ? 0x8ef0a3 : 0xffcc66); layer.addChild(marker); });
  layer.alpha = calibration.overlaySettings.opacity;
  container.removeChildren(); container.addChild(layer);
}
