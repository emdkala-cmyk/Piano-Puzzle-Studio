import { createPianoLayout, KEYBOARD_RANGES } from "./piano-layout";
import { identityTransform } from "./calibration-transform";
import { isValidQuadrilateral } from "./homography";
import { anchorReferencePoint, baseProject, computeCornerHomography } from "./key-projection";
import type { AnchorPoint, Calibration, KeyboardType, Point, ViewType } from "./models";
const keyboardLabels: Partial<Record<KeyboardType, string>> = { "88-key": "88-key Piano", "76-key": "76-key Korg Pa4X" };

export const overlayDefaults = { opacity: 0.48, lineColor: "#58dcff", fillColor: "#284a82", lineWidth: 1, showWhiteKeys: true, showBlackKeys: true, showNoteLabels: true, showMidiNumbers: false, showAnchors: true, showSafeArea: true, showGrid: false, showSpawnPoints: false, showCenterPoints: false, wireframe: false };
const anchorDefinitions: Array<[string, AnchorPoint["kind"], string, number?]> = [
  ["left-edge", "leftKeyboardEdge", "Left edge"], ["right-edge", "rightKeyboardEdge", "Right edge"],
  ["c2", "C2", "C2", 36], ["c3", "C3", "C3", 48], ["c4", "C4", "C4", 60], ["c5", "C5", "C5", 72], ["c6", "C6", "C6", 84]
];

export function createDefaultCalibration(width: number, height: number, keyboardType: KeyboardType = "88-key"): Calibration {
  const now = new Date().toISOString();
  const range = KEYBOARD_RANGES[keyboardType] ?? KEYBOARD_RANGES["88-key"]!;
  const keyMap = createPianoLayout(keyboardType, range.first, range.last);
  return { id: `cal-${keyboardType}`, name: keyboardLabels[keyboardType] ?? "Keyboard Calibration", viewType: "top", keyboardType, noteRange: { first: range.first, last: range.last }, referenceWidth: width, referenceHeight: height, sourceWidth: width, sourceHeight: height, keyboardBounds: { x: 0, y: height * .12, width, height: height * .88 }, anchorPoints: anchorDefinitions.map(([id, kind, label, midiNote]) => { const ref = anchorReferencePoint({ kind, midiNote }, keyMap) ?? { x: 0.5, y: 0.5 }; return { id, kind, label, midiNote, point: { x: ref.x * width, y: ref.y * height } }; }), keyMap, transform: identityTransform(), overlaySettings: overlayDefaults, cameraSettings: { liveCameraEnabled: false, referenceFrameTime: 0, opacity: 1, mirrorX: false, mirrorY: false, locked: false }, createdAt: now, updatedAt: now, version: "1.2.0" };
}
export function calibrationCorners(calibration: Calibration): Point[] { return [calibration.transform.topLeft, calibration.transform.topRight, calibration.transform.bottomRight, calibration.transform.bottomLeft]; }
export function calibrationIsValid(calibration: Calibration): boolean { return isValidQuadrilateral(calibrationCorners(calibration)); }
export function withHomography(calibration: Calibration): Calibration {
  return { ...calibration, homography: computeCornerHomography(calibration) };
}
export function updateAnchorDiagnostics(calibration: Calibration): Calibration {
  const matrix = calibration.homography ?? computeCornerHomography(calibration);
  const anchors = calibration.anchorPoints.map((anchor) => {
    const ref = anchorReferencePoint(anchor, calibration.keyMap);
    const projectedPoint = ref ? baseProject(calibration, ref, matrix) : undefined;
    const error = projectedPoint ? Math.hypot(projectedPoint.x - anchor.point.x, projectedPoint.y - anchor.point.y) : undefined;
    return { ...anchor, projectedPoint, error };
  });
  return { ...calibration, anchorPoints: anchors };
}
export function migrateCalibration(input: Calibration): Calibration {
  const keyboardType = input.keyboardType ?? "88-key";
  const next: Calibration = { ...createDefaultCalibration(input.sourceWidth || 1080, input.sourceHeight || 1920, keyboardType), ...input, version: "1.2.0", anchorPoints: input.anchorPoints?.length ? input.anchorPoints : createDefaultCalibration(input.sourceWidth || 1080, input.sourceHeight || 1920, keyboardType).anchorPoints };
  try { return updateAnchorDiagnostics(withHomography(next)); } catch { return next; }
}
export function viewTransform(view: ViewType, calibration: Calibration): Calibration {
  const transform = { ...calibration.transform };
  if (view === "top") Object.assign(transform, { perspective: 0, skewX: 0, skewY: 0, rotation: 0 });
  if (view === "top-angle") Object.assign(transform, { perspective: .12, skewY: -.08, rotation: 0 });
  if (view === "three-quarter") Object.assign(transform, { perspective: .2, skewY: -.16, rotation: -.04 });
  if (view === "side") Object.assign(transform, { perspective: .3, skewY: -.3, rotation: -.08 });
  return updateAnchorDiagnostics(withHomography({ ...calibration, viewType: view, transform }));
}
