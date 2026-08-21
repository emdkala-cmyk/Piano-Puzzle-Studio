import type { AnchorPoint, Calibration, PianoKey, Point } from "./models";
import { applyHomography, computeHomography, type Matrix3 } from "./homography";
import { BLACK_KEY_RATIO, BLACK_KEY_WIDTH_RATIO } from "./piano-layout";

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

export interface KeyBoundsX { left: number; right: number }

function whiteNeighbors(whites: PianoKey[], midiNote: number): { prev?: PianoKey; next?: PianoKey } {
  const index = whites.findIndex((key) => key.midiNote === midiNote);
  return { prev: index > 0 ? whites[index - 1] : undefined, next: index >= 0 && index < whites.length - 1 ? whites[index + 1] : undefined };
}

export function resolveManualKeyBoundsX(calibration: Calibration): Map<number, KeyBoundsX> {
  const bounds = new Map<number, KeyBoundsX>();
  const raw = calibration.manualKeyPoints;
  if (!raw) return bounds;
  const whites = calibration.keyMap.filter((key) => key.keyType === "white");
  const whiteX = new Map<number, number>();
  whites.forEach((key) => { const p = raw[key.midiNote]; if (p) whiteX.set(key.midiNote, p.x); });

  whites.forEach((key) => {
    const cx = whiteX.get(key.midiNote);
    if (cx === undefined) return;
    const { prev, next } = whiteNeighbors(whites, key.midiNote);
    const prevX = prev ? whiteX.get(prev.midiNote) : undefined;
    const nextX = next ? whiteX.get(next.midiNote) : undefined;
    const leftGap = prevX !== undefined ? cx - prevX : undefined;
    const rightGap = nextX !== undefined ? nextX - cx : undefined;
    if (leftGap === undefined && rightGap === undefined) {
      const fallback = baseProject(calibration, key.rightEdge).x - baseProject(calibration, key.leftEdge).x;
      bounds.set(key.midiNote, { left: cx - fallback / 2, right: cx + fallback / 2 });
      return;
    }
    const left = leftGap !== undefined ? cx - leftGap / 2 : cx - (rightGap as number) / 2;
    const right = rightGap !== undefined ? cx + rightGap / 2 : cx + (leftGap as number) / 2;
    bounds.set(key.midiNote, { left, right });
  });

  calibration.keyMap.forEach((key) => {
    if (key.keyType !== "black") return;
    const nextWhite = whites.find((white) => white.midiNote > key.midiNote);
    const nextIndex = nextWhite ? whites.indexOf(nextWhite) : -1;
    const prevWhite = nextIndex > 0 ? whites[nextIndex - 1] : nextIndex === -1 ? whites[whites.length - 1] : undefined;
    const prevX = prevWhite ? whiteX.get(prevWhite.midiNote) : undefined;
    const nextX = nextWhite ? whiteX.get(nextWhite.midiNote) : undefined;
    if (prevX === undefined || nextX === undefined) return;
    const ratio = BLACK_KEY_RATIO[key.midiNote % 12] ?? 0.5;
    const center = prevX + ratio * (nextX - prevX);
    const width = BLACK_KEY_WIDTH_RATIO * (nextX - prevX);
    bounds.set(key.midiNote, { left: center - width / 2, right: center + width / 2 });
  });

  return bounds;
}

export interface KeyProjectionContext { corrections: AnchorCorrection[]; manualBoundsX: Map<number, KeyBoundsX> }

export function buildKeyProjectionContext(calibration: Calibration): KeyProjectionContext {
  return { corrections: computeAnchorCorrections(calibration), manualBoundsX: resolveManualKeyBoundsX(calibration) };
}

export function projectKeyPolygon(calibration: Calibration, key: PianoKey, ctx: KeyProjectionContext): Point[] {
  const corners = [
    { x: key.normalizedX, y: key.normalizedY },
    { x: key.normalizedX + key.normalizedWidth, y: key.normalizedY },
    { x: key.normalizedX + key.normalizedWidth, y: key.normalizedY + key.normalizedHeight },
    { x: key.normalizedX, y: key.normalizedY + key.normalizedHeight }
  ].map((p) => projectPoint(calibration, p, ctx.corrections));
  const bounds = ctx.manualBoundsX.get(key.midiNote);
  if (!bounds) return corners;
  const xs = [bounds.left, bounds.right, bounds.right, bounds.left];
  return corners.map((p, i) => ({ x: xs[i], y: p.y }));
}

export function projectKeyCenter(calibration: Calibration, key: PianoKey, ctx: KeyProjectionContext): Point {
  const base = projectPoint(calibration, key.centerPoint, ctx.corrections);
  const bounds = ctx.manualBoundsX.get(key.midiNote);
  return bounds ? { x: (bounds.left + bounds.right) / 2, y: base.y } : base;
}

export function projectKeySpawn(calibration: Calibration, key: PianoKey, ctx: KeyProjectionContext): Point {
  const base = projectPoint(calibration, key.spawnPoint, ctx.corrections);
  const bounds = ctx.manualBoundsX.get(key.midiNote);
  return bounds ? { x: (bounds.left + bounds.right) / 2, y: base.y } : base;
}
