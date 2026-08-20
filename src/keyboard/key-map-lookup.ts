import type { Calibration, PianoKey, Point } from "./models";
import { applyHomography, computeHomography } from "./homography";
import type { Bounds } from "../geometry/models";

export interface ProjectedKeyMapEntry extends PianoKey {
  projectedPolygon: Point[]; projectedBounds: Bounds; projectedCenterPoint: Point; projectedSpawnPoint: Point; projectedImpactPoint: Point;
}
export function getKeyByMidiNote(midiNote: number, calibration: Calibration): ProjectedKeyMapEntry | undefined {
  const key = calibration.keyMap.find((item) => item.midiNote === midiNote); if (!key) return undefined;
  const matrix = calibration.homography ?? computeHomography([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], [calibration.transform.topLeft, calibration.transform.topRight, calibration.transform.bottomRight, calibration.transform.bottomLeft]);
  const project = (point: Point): Point => { const p = applyHomography(point, matrix); return { x: p.x * calibration.sourceWidth, y: p.y * calibration.sourceHeight }; };
  const polygon = [{ x: key.normalizedX, y: key.normalizedY }, { x: key.normalizedX + key.normalizedWidth, y: key.normalizedY }, { x: key.normalizedX + key.normalizedWidth, y: key.normalizedY + key.normalizedHeight }, { x: key.normalizedX, y: key.normalizedY + key.normalizedHeight }].map(project);
  const xs = polygon.map((p) => p.x), ys = polygon.map((p) => p.y);
  return { ...key, projectedPolygon: polygon, projectedBounds: { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }, projectedCenterPoint: project(key.centerPoint), projectedSpawnPoint: project(key.spawnPoint), projectedImpactPoint: project(key.centerPoint) };
}
export function getKeyByNoteName(name: string, calibration: Calibration): ProjectedKeyMapEntry | undefined { return calibration.keyMap.find((key) => key.noteName === name) ? getKeyByMidiNote(calibration.keyMap.find((key) => key.noteName === name)!.midiNote, calibration) : undefined; }
