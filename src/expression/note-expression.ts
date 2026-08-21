import type { MappedNoteEvent } from "../midi/event-models";
import type { SustainEvent } from "../midi/models";
import type { PuzzlePieceAssignment } from "../puzzle/puzzle-event-models";
import type { ChordMemberInfo } from "./chord-expression";
import type { ExpressionSettings, MotionProfile, NoteExpression } from "./models";
import { computeVelocityDerived } from "./velocity";
import { computeDurationDerived } from "./duration";
import { computeSustainDerived } from "./sustain";

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export interface NoteExpressionInputs {
  assignment: PuzzlePieceAssignment;
  event: MappedNoteEvent;
  sustainEvents: SustainEvent[];
  timelineDurationMs: number;
  chordMemberInfo?: ChordMemberInfo;
  chordEmphasis?: number;
  settings: ExpressionSettings;
}

export function buildNoteExpression(inputs: NoteExpressionInputs): NoteExpression {
  const { assignment, event, sustainEvents, timelineDurationMs, chordMemberInfo, chordEmphasis, settings } = inputs;
  const noteOnTimeMs = event.startTimeMs;
  const noteOffTimeMs = event.startTimeMs + event.durationMs;

  const sustain = computeSustainDerived(event.trackIndex, noteOffTimeMs, sustainEvents, timelineDurationMs, settings.sustain);
  const effectiveDurationMs = sustain.sustainActiveAtNoteOff && sustain.sustainedUntilMs !== undefined
    ? Math.max(event.durationMs, (sustain.sustainedUntilMs - noteOnTimeMs) * settings.sustain.holdMultiplier)
    : event.durationMs;

  const velocityDerived = computeVelocityDerived(event.normalizedVelocity, settings.velocity);
  const durationDerived = computeDurationDerived(effectiveDurationMs, settings.duration);

  const energy = clamp01(velocityDerived.energy + (chordEmphasis ?? 0) * settings.chord.emphasisInfluence * 0.3);
  const emphasis = clamp01(0.5 * velocityDerived.energy + 0.5 * (chordEmphasis ?? 0));

  const baseArrivalHoldMs = durationDerived.arrivalHoldMs;
  const arrivalHoldMs = sustain.sustainActiveAtNoteOff
    ? Math.min(settings.duration.maxArrivalHoldMs * settings.sustain.holdMultiplier, baseArrivalHoldMs * settings.sustain.holdMultiplier)
    : baseArrivalHoldMs;

  const opacityPeak = sustain.sustainActiveAtNoteOff
    ? Math.min(1, velocityDerived.opacityPeak * settings.sustain.opacityMultiplier)
    : velocityDerived.opacityPeak;

  const motionProfile: MotionProfile = {
    travelDurationMs: velocityDerived.travelDurationDeltaMs,
    delayMs: chordMemberInfo?.delayMs ?? 0,
    arrivalHoldMs,
    scaleStart: velocityDerived.scaleStart,
    scalePeak: velocityDerived.scalePeak,
    scaleEnd: durationDerived.scaleEnd,
    rotationStart: 0,
    rotationEnd: velocityDerived.rotationEnd,
    opacityStart: velocityDerived.opacityStart,
    opacityPeak,
    opacityEnd: durationDerived.opacityEnd,
    easing: "easeOut"
  };

  return {
    id: `expr-${assignment.id}`,
    assignmentId: assignment.id,
    noteEventId: event.id,
    midiNote: event.midiNote,
    velocity: event.velocity,
    normalizedVelocity: event.normalizedVelocity,
    originalDurationMs: event.durationMs,
    effectiveDurationMs,
    normalizedDuration: durationDerived.normalizedDuration,
    noteOnTimeMs,
    noteOffTimeMs,
    sustainActiveAtNoteOff: sustain.sustainActiveAtNoteOff,
    sustainReleaseTimeMs: sustain.sustainReleaseTimeMs,
    sustainedUntilMs: sustain.sustainedUntilMs,
    chordId: chordMemberInfo?.chordId,
    chordSize: chordMemberInfo?.chordSize ?? 1,
    chordIndex: chordMemberInfo?.chordIndex ?? 0,
    energy,
    emphasis,
    motionProfile,
    visualProfile: {
      intensity: energy,
      layerBoost: chordMemberInfo ? 1 : 0,
      zIndexBoost: Math.round(energy * 4),
      reservedForGlow: 0,
      reservedForParticles: 0,
      reservedForTrail: 0,
      reservedForShockwave: 0
    }
  };
}
