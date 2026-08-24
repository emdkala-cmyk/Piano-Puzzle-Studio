import type { Point } from "../geometry/models";
import type { PieceAnimationFrame } from "../animation/models";

export type VisualFxPalette = "artwork" | "gold" | "neon" | "pitch-gradient" | "fire" | "ice" | "rainbow" | "custom";
export type VisualFxPreset = "stardust-stream" | "cinematic-orbit" | "smoke-ember" | "golden-dust" | "neon-ribbon" | "vortex-fire" | "galaxy-swirl" | "ethereal-white" | "minimal" | "pink-nebula" | "sparkle-burst" | "firework-streaks" | "purple-vortex" | "ice-crystal" | "fire-dance" | "dreamy-pastel";
export type FxPathStyle = "sequential" | "random" | "spiral" | "reverse" | "scattered";
export type FxParticleMotion = "curved" | "spiral" | "linear" | "orbital" | "random-wobble";
export type FxSmokeLayer = "core" | "volume" | "residue";
export type FxSmokeBehavior = "neutral" | "bass" | "high";

export interface VisualFxConfig {
  enabled: boolean;
  glowEnabled: boolean;
  particlesEnabled: boolean;
  lockImpactEnabled: boolean;
  glowIntensity: number;
  glowDurationMs: number;
  trailEnabled: boolean;
  trailLength: number;
  particleDensity: number;
  particleLifetimeMs: number;
  impactIntensity: number;
  palette: VisualFxPalette;
  preset: VisualFxPreset;
  smokeEnabled: boolean;
  smokeDensity: number;
  smokeLayerCount: number;
  smokeEmissionIntervalMs: number;
  smokeFrameBudget: number;
  particleFrameBudget: number;
  bassThreshold: number;
  highThreshold: number;
  particleSize: number;
  pathCurvature: number;
  revealDurationMs: number;
pathStyle: FxPathStyle;
  particleMotion: FxParticleMotion;
  customColor: string;
keyboardGlowEnabled: boolean;
  keyboardGlowIntensity: number;
  lightTrailEnabled: boolean;
  lightTrailWidth: number;
  lightTrailGlowLayers: number;
  lightTrailLifetimeMs: number;
  lightTrailCoreBrightness: number;
  /** Duration of the glow + impact burst when a piece locks into place. */
  lockFadeDurationMs: number;
  /** How quickly the light trail decays after the piece leaves (0.1=fast, 1=slow). */
  trailFadeSpeed: number;
  /** Duration of the lock impact ring/shockwave effect. */
  impactDurationMs: number;
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
  activeSmoke: number;
  maxActiveSmoke: number;
  activeGlows: number;
  activeImpacts: number;
  droppedParticles: number;
  droppedSmoke: number;
  droppedByPoolCapacity: number;
  droppedByFrameBudget: number;
  droppedByInvalidEvent: number;
  droppedByInactiveState: number;
  emittedParticles: number;
  emittedSmoke: number;
  particleFrameBudget: number;
  smokeFrameBudget: number;
  smokeLayerCount: number;
  lastFxEvent: string;
  estimatedFps: number;
  transformMismatchCount: number;
}

export const MAX_ACTIVE_PARTICLES = 5000;
export const MAX_ACTIVE_SMOKE = 640;
export const NATURAL_SMOKE_LAYER_COUNT = 3;
export const MAX_SMOKE_SPAWNS_PER_FRAME = 40;
export const MAX_PARTICLE_SPAWNS_PER_FRAME = 600;

export const DEFAULT_VISUAL_FX_CONFIG: VisualFxConfig = {
  enabled: true,
  glowEnabled: true,
  particlesEnabled: true,
  lockImpactEnabled: true,
  glowIntensity: 0.55,
  glowDurationMs: 580,
  trailEnabled: true,
  trailLength: 0.72,
  particleDensity: 0.85,
  particleLifetimeMs: 550,
  impactIntensity: 0.35,
  palette: "artwork",
  preset: "stardust-stream",
  smokeEnabled: true,
  smokeDensity: 0.12,
  smokeLayerCount: NATURAL_SMOKE_LAYER_COUNT,
  smokeEmissionIntervalMs: 48,
  smokeFrameBudget: MAX_SMOKE_SPAWNS_PER_FRAME,
  particleFrameBudget: 520,
  bassThreshold: 48,
  highThreshold: 84,
  particleSize: 0.9,
  pathCurvature: 0.58,
  revealDurationMs: 620,
pathStyle: "sequential" as FxPathStyle,
  particleMotion: "curved" as FxParticleMotion,
  customColor: "#ff6600",
  keyboardGlowEnabled: true,
  keyboardGlowIntensity: 0.75,
  lightTrailEnabled: true,
  lightTrailWidth: 14,
  lightTrailGlowLayers: 3,
  lightTrailLifetimeMs: 700,
  lightTrailCoreBrightness: 0.95,
  lockFadeDurationMs: 320,
  trailFadeSpeed: 0.35,
  impactDurationMs: 420
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
    smokeDensity: clamp(merged.smokeDensity),
    smokeLayerCount: Math.max(1, Math.min(NATURAL_SMOKE_LAYER_COUNT, Math.round(Number.isFinite(merged.smokeLayerCount) ? merged.smokeLayerCount : NATURAL_SMOKE_LAYER_COUNT))),
    smokeEmissionIntervalMs: Math.max(24, Math.min(120, Number.isFinite(merged.smokeEmissionIntervalMs) ? merged.smokeEmissionIntervalMs : DEFAULT_VISUAL_FX_CONFIG.smokeEmissionIntervalMs)),
    smokeFrameBudget: Math.max(1, Math.min(MAX_SMOKE_SPAWNS_PER_FRAME, Math.round(Number.isFinite(merged.smokeFrameBudget) ? merged.smokeFrameBudget : DEFAULT_VISUAL_FX_CONFIG.smokeFrameBudget))),
    particleFrameBudget: Math.max(1, Math.min(MAX_PARTICLE_SPAWNS_PER_FRAME, Math.round(Number.isFinite(merged.particleFrameBudget) ? merged.particleFrameBudget : DEFAULT_VISUAL_FX_CONFIG.particleFrameBudget))),
    bassThreshold: Math.max(0, Math.min(127, Math.round(Number.isFinite(merged.bassThreshold) ? merged.bassThreshold : DEFAULT_VISUAL_FX_CONFIG.bassThreshold))),
    highThreshold: Math.max(0, Math.min(127, Math.round(Number.isFinite(merged.highThreshold) ? merged.highThreshold : DEFAULT_VISUAL_FX_CONFIG.highThreshold))),
    particleSize: Math.max(0.01, Math.min(2.5, Number.isFinite(merged.particleSize) ? merged.particleSize : DEFAULT_VISUAL_FX_CONFIG.particleSize)),
    pathCurvature: clamp(merged.pathCurvature),
    glowDurationMs: Math.max(40, Number.isFinite(merged.glowDurationMs) ? merged.glowDurationMs : DEFAULT_VISUAL_FX_CONFIG.glowDurationMs),
    particleLifetimeMs: Math.max(40, Number.isFinite(merged.particleLifetimeMs) ? merged.particleLifetimeMs : DEFAULT_VISUAL_FX_CONFIG.particleLifetimeMs),
    revealDurationMs: Math.max(120, Number.isFinite(merged.revealDurationMs) ? merged.revealDurationMs : DEFAULT_VISUAL_FX_CONFIG.revealDurationMs),
pathStyle: ["sequential", "random", "spiral", "reverse", "scattered"].includes(merged.pathStyle as string) ? merged.pathStyle as FxPathStyle : "sequential",
    particleMotion: ["curved", "spiral", "linear", "orbital", "random-wobble"].includes(merged.particleMotion as string) ? merged.particleMotion as FxParticleMotion : "curved",
    customColor: typeof merged.customColor === "string" ? merged.customColor : "#ff6600",
    keyboardGlowIntensity: clamp(merged.keyboardGlowIntensity),
    lightTrailWidth: Math.max(2, Math.min(40, Number.isFinite(merged.lightTrailWidth) ? merged.lightTrailWidth : DEFAULT_VISUAL_FX_CONFIG.lightTrailWidth)),
    lightTrailGlowLayers: Math.max(1, Math.min(5, Math.round(Number.isFinite(merged.lightTrailGlowLayers) ? merged.lightTrailGlowLayers : DEFAULT_VISUAL_FX_CONFIG.lightTrailGlowLayers))),
    lightTrailLifetimeMs: Math.max(200, Math.min(3000, Number.isFinite(merged.lightTrailLifetimeMs) ? merged.lightTrailLifetimeMs : DEFAULT_VISUAL_FX_CONFIG.lightTrailLifetimeMs)),
    lightTrailCoreBrightness: clamp(merged.lightTrailCoreBrightness),
    lockFadeDurationMs: Math.max(40, Math.min(3000, Number.isFinite(merged.lockFadeDurationMs) ? merged.lockFadeDurationMs : DEFAULT_VISUAL_FX_CONFIG.lockFadeDurationMs)),
    trailFadeSpeed: clamp(merged.trailFadeSpeed),
    impactDurationMs: Math.max(100, Math.min(2000, Number.isFinite(merged.impactDurationMs) ? merged.impactDurationMs : DEFAULT_VISUAL_FX_CONFIG.impactDurationMs))
  };
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export type FxAnimationFrame = Pick<PieceAnimationFrame, "pieceId" | "assignmentId" | "midiNote" | "state" | "currentPosition" | "targetPosition" | "progress" | "opacity">;
