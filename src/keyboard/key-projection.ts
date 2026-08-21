import type { AnchorPoint, Calibration, PianoKey, Point } from "./models";
import { applyHomography, computeHomography, type Matrix3 } from "./homography";

const UNIT_SQUARE: Point[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

export function computeCornerHomography(calibration: Calibration): Matrix3 {
  return computeHomography(UNIT_SQUARE, [calibration.transform.topLeft, calibration.transform.topRight, calibration.transform.bottomRight, calibration.transform.bottomLeft]);
}
function baselineHomography(calibration: Calibration): Matrix3 {
  return calibration.homography ?? computeCornerHomography(calibration);
}
export function baseProject(calibration: Calibration, point: Point, matrix: Matrix3 = baselineHomography(calibration)): Point {
  const p = applyHomography(point, matrix);
  return { x: p.x * calibration.sourceWidth, y: p.y * calibration.sourceHeight };
}
export function anchorReferencePoint(anchor: Pick<AnchorPoint, "kind" | "midiNote">, keyMap: PianoKey[]): Point | undefined {
  if (anchor.kind === "leftKeyboardEdge") return { x: 0, y: keyMap[0]?.centerPoint.y ?? 0.56 };
  if (anchor.kind === "rightKeyboardEdge") return { x: 1, y: keyMap[keyMap.length - 1]?.centerPoint.y ?? 0.56 };
  if (anchor.midiNote === undefined) return undefined;
  return keyMap.find((key) => key.midiNote === anchor.midiNote)?.centerPoint;
}

export interface AnchorCorrection { referenceX: number; delta: Point }

export function computeAnchorCorrections(calibration: Calibration, matrix: Matrix3 = baselineHomography(calibration)): AnchorCorrection[] {
  return calibration.anchorPoints
    .filter((anchor) => anchor.placed)
    .map((anchor) => {
      const ref = anchorReferencePoint(anchor, calibration.keyMap);
      if (!ref) return undefined;
      const base = baseProject(calibration, ref, matrix);
      return { referenceX: ref.x, delta: { x: anchor.point.x - base.x, y: anchor.point.y - base.y } };
    })
    .filter((c): c is AnchorCorrection => Boolean(c))
    .sort((a, b) => a.referenceX - b.referenceX);
}

function correctionAt(corrections: AnchorCorrection[], x: number): Point {
  if (!corrections.length) return { x: 0, y: 0 };
  if (x <= corrections[0].referenceX) return corrections[0].delta;
  const last = corrections[corrections.length - 1];
  if (x >= last.referenceX) return last.delta;
  for (let i = 0; i < corrections.length - 1; i += 1) {
    const a = corrections[i], b = corrections[i + 1];
    if (x <= b.referenceX) {
      const t = (x - a.referenceX) / (b.referenceX - a.referenceX || 1);
      return { x: a.delta.x + t * (b.delta.x - a.delta.x), y: a.delta.y + t * (b.delta.y - a.delta.y) };
    }
  }
  return last.delta;
}

export function projectPoint(calibration: Calibration, point: Point, corrections?: AnchorCorrection[]): Point {
  const matrix = baselineHomography(calibration);
  const base = baseProject(calibration, point, matrix);
  const c = correctionAt(corrections ?? computeAnchorCorrections(calibration, matrix), point.x);
  return { x: base.x + c.x, y: base.y + c.y };
}
