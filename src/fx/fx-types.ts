import type { Point } from "../geometry/models";
import type { PieceAnimationFrame } from "../animation/models";

export type VisualFxPalette = "artwork" | "gold" | "neon" | "pitch-gradient";

export interface VisualFxConfig {
  enabled: boolean;
  glowEnabled: boolean;
  particlesEnabled: boolean;
  lightingEnabled: boolean;
  lockImpactEnabled: boolean;
  glowIntensity: number;
  glowDurationMs: number;
  trailEnabled: boolean;
  trailLength: number;
  particleDensity: number;
  particleLifetimeMs: number;
  impactIntensity: number;
  lightingIntensity: number;
  palette: VisualFxPalette;
}

export interface FxNoteEvent {
  id: string;
  midiNote: number;
  velocity: number;
  normalizedVelocity: number;
  position: Point;
  durationMs: number;
  playbackTimeMs: number;
}

export interface FxPieceLaunchEvent {
  pieceId: string;
  position: Point;
  targetPosition: Point;
  midiNote: number;
  intensity: number;
  playbackTimeMs: number;
}

export interface FxPieceLockEvent {
  pieceId: string;
  position: Point;
  midiNote: number;
  intensity: number;
  playbackTimeMs: number;
}

export interface FxDebugStats {
  activeParticles: number;
  maxActiveParticles: number;
  activeGlows: number;
  activeImpacts: number;
  droppedParticles: number;
  lastFxEvent: string;
  estimatedFps: number;
  transformMismatchCount: number;
}

export const MAX_ACTIVE_PARTICLES = 1200;

export const DEFAULT_VISUAL_FX_CONFIG: VisualFxConfig = {
  enabled: true,
  glowEnabled: true,
  particlesEnabled: true,
  lightingEnabled: true,
  lockImpactEnabled: true,
  glowIntensity: 0.35,
  glowDurationMs: 420,
  trailEnabled: true,
  trailLength: 0.3,
  particleDensity: 0.25,
  particleLifetimeMs: 350,
  impactIntensity: 0.35,
  lightingIntensity: 0.15,
  palette: "artwork"
};

export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function normalizeVisualFxConfig(value?: Partial<VisualFxConfig>): VisualFxConfig {
  const merged = { ...DEFAULT_VISUAL_FX_CONFIG, ...value };
  return {
    ...merged,
    glowIntensity: clamp(merged.glowIntensity),
    trailLength: clamp(merged.trailLength),
    particleDensity: clamp(merged.particleDensity),
    impactIntensity: clamp(merged.impactIntensity),
    lightingIntensity: clamp(merged.lightingIntensity),
    glowDurationMs: Math.max(40, Number.isFinite(merged.glowDurationMs) ? merged.glowDurationMs : DEFAULT_VISUAL_FX_CONFIG.glowDurationMs),
    particleLifetimeMs: Math.max(40, Number.isFinite(merged.particleLifetimeMs) ? merged.particleLifetimeMs : DEFAULT_VISUAL_FX_CONFIG.particleLifetimeMs)
  };
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export type FxAnimationFrame = Pick<PieceAnimationFrame, "pieceId" | "assignmentId" | "midiNote" | "state" | "currentPosition" | "targetPosition" | "progress" | "opacity">;
