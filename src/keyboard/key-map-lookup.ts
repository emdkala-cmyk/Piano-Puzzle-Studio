import type { Calibration, PianoKey, Point } from "./models";
import { computeAnchorCorrections, projectPoint } from "./key-projection";
import type { Bounds } from "../geometry/models";

export interface ProjectedKeyMapEntry extends PianoKey {
  projectedPolygon: Point[]; projectedBounds: Bounds; projectedCenterPoint: Point; projectedSpawnPoint: Point; projectedImpactPoint: Point;
}
export function getKeyByMidiNote(midiNote: number, calibration: Calibration): ProjectedKeyMapEntry | undefined {
  const key = calibration.keyMap.find((item) => item.midiNote === midiNote); if (!key) return undefined;
  const corrections = computeAnchorCorrections(calibration);
  const project = (point: Point): Point => projectPoint(calibration, point, corrections);
  const polygon = [{ x: key.normalizedX, y: key.normalizedY }, { x: key.normalizedX + key.normalizedWidth, y: key.normalizedY }, { x: key.normalizedX + key.normalizedWidth, y: key.normalizedY + key.normalizedHeight }, { x: key.normalizedX, y: key.normalizedY + key.normalizedHeight }].map(project);
  const xs = polygon.map((p) => p.x), ys = polygon.map((p) => p.y);
  return { ...key, projectedPolygon: polygon, projectedBounds: { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }, projectedCenterPoint: project(key.centerPoint), projectedSpawnPoint: project(key.spawnPoint), projectedImpactPoint: project(key.centerPoint) };
}
export function getKeyByNoteName(name: string, calibration: Calibration): ProjectedKeyMapEntry | undefined { return calibration.keyMap.find((key) => key.noteName === name) ? getKeyByMidiNote(calibration.keyMap.find((key) => key.noteName === name)!.midiNote, calibration) : undefined; }
