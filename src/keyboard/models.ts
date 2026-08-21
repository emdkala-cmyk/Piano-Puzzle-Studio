export type ViewType = "top" | "top-angle" | "three-quarter" | "side" | "custom";
export type KeyboardType = "88-key" | "76-key" | "61-key" | "49-key" | "custom";
export type KeyType = "white" | "black";
export type AnchorKind = "leftKeyboardEdge" | "rightKeyboardEdge" | "topKeyboardEdge" | "bottomKeyboardEdge" | "leftC" | "centerC" | "rightC" | "centerOfKeyboard" | "C2" | "C3" | "C4" | "C5" | "C6" | "custom";

export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; width: number; height: number }
export interface Transform {
  translateX: number; translateY: number; scaleX: number; scaleY: number;
  rotation: number; skewX: number; skewY: number; perspective: number;
  topLeft: Point; topRight: Point; bottomLeft: Point; bottomRight: Point;
}
export interface PianoKey {
  midiNote: number; noteName: string; keyType: KeyType; octave: number;
  normalizedX: number; normalizedY: number; normalizedWidth: number; normalizedHeight: number;
  spawnPoint: Point; centerPoint: Point; topEdge: Point; bottomEdge: Point; leftEdge: Point; rightEdge: Point;
  projectedPolygon?: Point[]; projectedCenterPoint?: Point; projectedSpawnPoint?: Point;
}
export interface AnchorPoint { id: string; kind: AnchorKind; point: Point; label: string; midiNote?: number; projectedPoint?: Point; error?: number; placed?: boolean }
export interface OverlaySettings {
  opacity: number; lineColor: string; fillColor: string; lineWidth: number;
  showWhiteKeys: boolean; showBlackKeys: boolean; showNoteLabels: boolean;
  showMidiNumbers: boolean; showAnchors: boolean; showSafeArea: boolean;
  showGrid: boolean; showSpawnPoints: boolean; showCenterPoints: boolean;
  wireframe: boolean;
}
export interface CameraSettings { liveCameraEnabled: boolean; videoAssetId?: string; referenceFrameTime: number; opacity: number; mirrorX: boolean; mirrorY: boolean; locked: boolean }
export interface Calibration {
  id: string; name: string; viewType: ViewType; keyboardType: KeyboardType;
  noteRange: { first: number; last: number }; referenceWidth: number; referenceHeight: number;
  sourceWidth: number; sourceHeight: number; keyboardBounds: Rect; anchorPoints: AnchorPoint[];
  keyMap: PianoKey[]; transform: Transform; overlaySettings: OverlaySettings;
  cameraSettings: CameraSettings; createdAt: string; updatedAt: string; version: string;
  homography?: import("./homography").Matrix3;
}
