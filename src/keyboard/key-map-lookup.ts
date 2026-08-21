import type { Calibration, PianoKey, Point } from "./models";
import { buildKeyProjectionContext, projectKeyCenter, projectKeyPolygon, projectKeySpawn } from "./key-projection";
import type { Bounds } from "../geometry/models";

export interface ProjectedKeyMapEntry extends PianoKey {
  projectedPolygon: Point[]; projectedBounds: Bounds; projectedCenterPoint: Point; projectedSpawnPoint: Point; projectedImpactPoint: Point;
}
export function getKeyByMidiNote(midiNote: number, calibration: Calibration): ProjectedKeyMapEntry | undefined {
  const key = calibration.keyMap.find((item) => item.midiNote === midiNote); if (!key) return undefined;
  const ctx = buildKeyProjectionContext(calibration);
  const polygon = projectKeyPolygon(calibration, key, ctx);
  const centerPoint = projectKeyCenter(calibration, key, ctx);
  const xs = polygon.map((p) => p.x), ys = polygon.map((p) => p.y);
  return { ...key, projectedPolygon: polygon, projectedBounds: { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }, projectedCenterPoint: centerPoint, projectedSpawnPoint: projectKeySpawn(calibration, key, ctx), projectedImpactPoint: centerPoint };
}
export function getKeyByNoteName(name: string, calibration: Calibration): ProjectedKeyMapEntry | undefined { return calibration.keyMap.find((key) => key.noteName === name) ? getKeyByMidiNote(calibration.keyMap.find((key) => key.noteName === name)!.midiNote, calibration) : undefined; }
