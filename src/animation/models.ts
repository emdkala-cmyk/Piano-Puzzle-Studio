import type { Point, GeometryPiece } from "../geometry/models";
import type { MidiMappingResult, PuzzlePieceAssignment } from "../puzzle/puzzle-event-models";
import type { ExpressionResult, MotionProfile } from "../expression/models";
import type { MotionPathKind, MotionPathParams } from "./motion-path";
import type { RevealOrderMode } from "./reveal-scheduler";

export type AnimationState = "idle" | "scheduled" | "moving" | "arrived" | "cancelled" | "hidden";
export type EasingName = "linear" | "easeIn" | "easeOut" | "easeInOut";
export type OverlapMode = "replace" | "queue" | "allow-overlap";
export type AnimationClockState = "stopped" | "playing" | "paused" | "completed";

export interface AnimationTimingSettings {
  baseTravelDurationMs: number;
  minTravelDurationMs: number;
  maxTravelDurationMs: number;
  preHitDelayMs: number;
  postHitHoldMs: number;
  durationInfluence: number;
  velocityInfluence: number;
  overlapMode: OverlapMode;
  easing: EasingName;
  animationSpeed: number;
  debugVisible: boolean;

  /**
   * @deprecated Origin is ALWAYS the projected piano key of the note.
   * Kept only so older project files keep loading. Has no effect.
   */
  randomSpawn: boolean;
  /**
   * @deprecated Start-times are never shuffled. Use `revealOrderMode`.
   * Kept only so older project files keep loading. Has no effect.
   */
  randomOrder: boolean;

  /** "scattered" randomizes which piece each note delivers, not when notes fire. */
  revealOrderMode: RevealOrderMode;
  revealZoneRows: number;
  revealZoneCols: number;
  /** Master seed for path shape + reveal order. Same seed => same render. */
  pathSeed: string;

  /** Controlled jitter around the key centre, in px. Never leaves the key. */
  spawnJitterPx: number;

  motionPathKind: MotionPathKind | "auto";
  pathCurvature: number;
  orbitStrength: number;
  spiralStrength: number;
  waveStrength: number;
  turbulence: number;
  overshootPx: number;

  /** Progress at which the piece may begin to hint at its shape (0..1). */
  revealStartProgress: number;
  /** Max dissolve progress allowed while still travelling (0..1). */
  travelRevealCeiling: number;
  /** How long the cinematic reveal takes after arrival. */
  arrivalRevealDurationMs: number;

  glassEnabled: boolean;
  glassOpacity: number;
  completionGlowDurationMs: number;
  completionGlowIntensity: number;
}

export interface PieceAnimation {
  id: string;
  assignmentId: string;
  pieceId: string;
  midiNote: number;
  startTimeMs: number;
  endTimeMs: number;
  durationMs: number;
  delayMs: number;
  progress: number;
  state: AnimationState;
  /** The real projected piano-key point of this note. */
  spawnPosition: Point;
  targetPosition: Point;
  currentPosition: Point;
  /** Quadratic Bézier control point. Kept for backward compatibility. */
  controlPoint: Point;
  /** Pre-computed multi-mode path. Sampled allocation-free every frame. */
  motionPath: MotionPathParams;
  revealStartProgress: number;
  travelRevealCeiling: number;
  arrivalRevealDurationMs: number;
  rotation: number;
  scale: number;
  opacity: number;
  zIndex: number;
  easing: EasingName;
  completed: boolean;
  visible: boolean;
  motion?: MotionProfile;
}

export interface PieceAnimationFrame extends PieceAnimation {
  elapsedMs: number;
  /** 0 = pure energy, 1 = fully revealed artwork. Drives the dissolve filter. */
  revealProgress: number;
}

export interface AnimationTimeline {
  animations: PieceAnimation[];
  totalDurationMs: number;
  /** Diagnostics for the debug panel. */
  revealOrderReassigned: number;
  skippedWithoutKey: number;
}

export interface AnimationSource {
  mapping: MidiMappingResult;
  pieces: GeometryPiece[];
  timing: AnimationTimingSettings;
  expression?: ExpressionResult;
}

export const DEFAULT_ANIMATION_TIMING: AnimationTimingSettings = {
  baseTravelDurationMs: 520,
  minTravelDurationMs: 160,
  maxTravelDurationMs: 1100,
  preHitDelayMs: 0,
  postHitHoldMs: 120,
  durationInfluence: 0.25,
  velocityInfluence: 220,
  overlapMode: "allow-overlap",
  easing: "easeOut",
  animationSpeed: 1,
  debugVisible: true,

  randomSpawn: false,
  randomOrder: false,

  revealOrderMode: "scattered",
  revealZoneRows: 3,
  revealZoneCols: 3,
  pathSeed: "piano-puzzle",

  spawnJitterPx: 2.5,

  motionPathKind: "auto",
  pathCurvature: 0.6,
  orbitStrength: 0.45,
  spiralStrength: 0.55,
  waveStrength: 0.4,
  turbulence: 0.25,
  overshootPx: 14,

  revealStartProgress: 0.82,
  travelRevealCeiling: 0.28,
  arrivalRevealDurationMs: 620,

  glassEnabled: true,
  glassOpacity: 0.35,
  completionGlowDurationMs: 800,
  completionGlowIntensity: 1.0
};

function clamp01(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

export function normalizeAnimationTiming(
  value?: Partial<AnimationTimingSettings>
): AnimationTimingSettings {
  const merged = { ...DEFAULT_ANIMATION_TIMING, ...value };
  return {
    ...merged,
    animationSpeed: Math.max(0.1, merged.animationSpeed),
    revealOrderMode: merged.revealOrderMode === "musical" ? "musical" : "scattered",
    revealZoneRows: Math.max(1, Math.min(8, Math.round(merged.revealZoneRows))),
    revealZoneCols: Math.max(1, Math.min(8, Math.round(merged.revealZoneCols))),
    pathSeed: typeof merged.pathSeed === "string" && merged.pathSeed
      ? merged.pathSeed
      : DEFAULT_ANIMATION_TIMING.pathSeed,
    spawnJitterPx: Math.max(0, Math.min(12, Number.isFinite(merged.spawnJitterPx)
      ? merged.spawnJitterPx
      : DEFAULT_ANIMATION_TIMING.spawnJitterPx)),
    pathCurvature: clamp01(merged.pathCurvature, DEFAULT_ANIMATION_TIMING.pathCurvature),
    orbitStrength: clamp01(merged.orbitStrength, DEFAULT_ANIMATION_TIMING.orbitStrength),
    spiralStrength: clamp01(merged.spiralStrength, DEFAULT_ANIMATION_TIMING.spiralStrength),
    waveStrength: clamp01(merged.waveStrength, DEFAULT_ANIMATION_TIMING.waveStrength),
    turbulence: clamp01(merged.turbulence, DEFAULT_ANIMATION_TIMING.turbulence),
    overshootPx: Math.max(0, Math.min(80, Number.isFinite(merged.overshootPx)
      ? merged.overshootPx
      : DEFAULT_ANIMATION_TIMING.overshootPx)),
    revealStartProgress: clamp01(merged.revealStartProgress, DEFAULT_ANIMATION_TIMING.revealStartProgress),
    travelRevealCeiling: clamp01(merged.travelRevealCeiling, DEFAULT_ANIMATION_TIMING.travelRevealCeiling),
    arrivalRevealDurationMs: Math.max(80, Number.isFinite(merged.arrivalRevealDurationMs)
      ? merged.arrivalRevealDurationMs
      : DEFAULT_ANIMATION_TIMING.arrivalRevealDurationMs),
    // Hard-off: these two are the bugs we are fixing.
    randomSpawn: false,
    randomOrder: false
  };
}

export type AssignmentLookup = Map<string, PuzzlePieceAssignment>;
