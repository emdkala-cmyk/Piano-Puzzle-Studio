import type { EasingName } from "../animation/models";

export interface MotionProfile {
  /** Delta (ms) applied on top of the baseline travelDuration() already computed in piece-animation.ts — not an absolute value. */
  travelDurationMs: number;
  delayMs: number;
  arrivalHoldMs: number;
  scaleStart: number;
  scalePeak: number;
  scaleEnd: number;
  rotationStart: number;
  rotationEnd: number;
  opacityStart: number;
  opacityPeak: number;
  opacityEnd: number;
  easing: EasingName;
}

export interface VisualProfile {
  intensity: number;
  layerBoost: number;
  zIndexBoost: number;
  reservedForGlow: number;
  reservedForParticles: number;
  reservedForTrail: number;
  reservedForShockwave: number;
}

export interface NoteExpression {
  id: string;
  assignmentId: string;
  noteEventId: string;
  midiNote: number;
  velocity: number;
  normalizedVelocity: number;
  originalDurationMs: number;
  effectiveDurationMs: number;
  normalizedDuration: number;
  noteOnTimeMs: number;
  noteOffTimeMs: number;
  sustainActiveAtNoteOff: boolean;
  sustainReleaseTimeMs?: number;
  sustainedUntilMs?: number;
  chordId?: string;
  chordSize: number;
  chordIndex: number;
  energy: number;
  emphasis: number;
  motionProfile: MotionProfile;
  visualProfile: VisualProfile;
}

export interface ChordExpression {
  chordId: string;
  startTimeMs: number;
  noteCount: number;
  averageVelocity: number;
  maxVelocity: number;
  totalEnergy: number;
  normalizedChordSize: number;
  chordEmphasis: number;
  spreadDelayMs: number;
  centerBias: number;
}

export interface ExpressionDiagnostics {
  noteCount: number;
  sustainedNoteCount: number;
  chordCount: number;
  averageEnergy: number;
  maxEnergy: number;
  skippedEvents: number;
  warnings: string[];
}

export interface ExpressionResult {
  noteExpressions: Map<string, NoteExpression>;
  chordExpressions: Map<string, ChordExpression>;
  diagnostics: ExpressionDiagnostics;
}

export interface VelocityExpressionSettings {
  influence: number;
  travelInfluenceMs: number;
  scaleInfluence: number;
  opacityInfluence: number;
  rotationInfluence: number;
}

export interface DurationExpressionSettings {
  influence: number;
  minArrivalHoldMs: number;
  maxArrivalHoldMs: number;
}

export interface SustainExpressionSettings {
  enabled: boolean;
  ccThreshold: number;
  holdMultiplier: number;
  opacityMultiplier: number;
  energyDecayMultiplier: number;
}

export interface ChordExpressionSettings {
  enabled: boolean;
  spreadMs: number;
  emphasisInfluence: number;
}

export interface ExpressionSettings {
  enabled: boolean;
  debugVisible: boolean;
  velocity: VelocityExpressionSettings;
  duration: DurationExpressionSettings;
  sustain: SustainExpressionSettings;
  chord: ChordExpressionSettings;
}
