import type { Point, GeometryPiece } from "../geometry/models";
import type { MidiMappingResult, PuzzlePieceAssignment } from "../puzzle/puzzle-event-models";
import type { ExpressionResult, MotionProfile } from "../expression/models";

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
  /** When true, pieces spawn from random edge positions instead of piano-key positions. */
  randomSpawn: boolean;
  /** When true, animation start-times are shuffled so pieces arrive in random order. */
  randomOrder: boolean;
  /** Controls how far pieces swing off the straight-line path (0 = straight, 1 = strong curve). */
  pathCurvature: number;
  /** When true, pieces appear frosted/glassy while the puzzle is incomplete. */
  glassEnabled: boolean;
  /** Alpha multiplier for piece artwork while puzzle is incomplete (0 = invisible, 1 = fully opaque). */
  glassOpacity: number;
  /** Duration in ms of the completion glow burst. */
  completionGlowDurationMs: number;
  /** Intensity multiplier for the completion glow. */
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
  spawnPosition: Point;
  targetPosition: Point;
  currentPosition: Point;
  /** Quadratic Bézier control point for curved motion paths. */
  controlPoint: Point;
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
}

export interface AnimationTimeline {
  animations: PieceAnimation[];
  totalDurationMs: number;
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
  randomSpawn: true,
  randomOrder: true,
  pathCurvature: 0.6,
  glassEnabled: true,
  glassOpacity: 0.35,
  completionGlowDurationMs: 800,
  completionGlowIntensity: 1.0
};

export function normalizeAnimationTiming(value?: Partial<AnimationTimingSettings>): AnimationTimingSettings {
  return { ...DEFAULT_ANIMATION_TIMING, ...value, animationSpeed: Math.max(0.1, value?.animationSpeed ?? DEFAULT_ANIMATION_TIMING.animationSpeed) };
}

export type AssignmentLookup = Map<string, PuzzlePieceAssignment>;
