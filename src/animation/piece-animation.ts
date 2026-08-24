import type { Point } from "../geometry/models";
import type { MappedNoteEvent } from "../midi/event-models";
import type { MotionProfile } from "../expression/models";
import type { AnimationTimingSettings, PieceAnimation, PieceAnimationFrame } from "./models";
import { ease } from "./easing";
import { samplePathInto } from "./motion-path";
import { createBlankFrame } from "./frame-pool";

export function travelDuration(event: MappedNoteEvent, settings: AnimationTimingSettings): number {
  const velocity = Math.max(0, Math.min(1, event.normalizedVelocity));
  const noteFactor = Math.max(0, Math.min(1, event.durationMs / 2000));
  const raw = settings.baseTravelDurationMs
    - velocity * settings.velocityInfluence
    + noteFactor * settings.durationInfluence * settings.baseTravelDurationMs;
  return Math.max(settings.minTravelDurationMs, Math.min(settings.maxTravelDurationMs, raw));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(0.0001, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const SPAWN_MIN_SCALE = 0.05;

/* ------------------------------------------------------------------ *
 * Motion visuals, written into scratch numbers instead of an object.
 * Module-level scratch is safe: evaluation is single-threaded and the
 * values are consumed before the next call.
 * ------------------------------------------------------------------ */
let scratchScale = 1;
let scratchRotation = 0;
let scratchOpacity = 1;

function evaluateMotionInto(motion: MotionProfile, elapsedMs: number, durationMs: number): void {
  if (elapsedMs < 0) {
    scratchScale = motion.scaleStart;
    scratchRotation = motion.rotationStart;
    scratchOpacity = motion.opacityStart;
    return;
  }
  if (elapsedMs < durationMs) {
    const t = ease(durationMs > 0 ? elapsedMs / durationMs : 1, motion.easing);
    scratchScale = lerp(motion.scaleStart, motion.scalePeak, t);
    scratchRotation = lerp(motion.rotationStart, motion.rotationEnd, t);
    scratchOpacity = lerp(motion.opacityStart, motion.opacityPeak, t);
    return;
  }
  const settleElapsedMs = elapsedMs - durationMs;
  if (settleElapsedMs < motion.arrivalHoldMs) {
    const t = ease(motion.arrivalHoldMs > 0 ? settleElapsedMs / motion.arrivalHoldMs : 1, motion.easing);
    scratchScale = lerp(motion.scalePeak, motion.scaleEnd, t);
    scratchRotation = lerp(motion.rotationEnd, 0, t);
    scratchOpacity = lerp(motion.opacityPeak, motion.opacityEnd, t);
    return;
  }
  scratchScale = motion.scaleEnd;
  scratchRotation = 0;
  scratchOpacity = motion.opacityEnd;
}

/**
 * Reveal curve. Keeps the artwork hidden while travelling: at most
 * `travelRevealCeiling` of the dissolve runs before arrival, and the rest
 * plays out over `arrivalRevealDurationMs` once the piece has locked in.
 */
function revealProgressFor(animation: PieceAnimation, progress: number, arrivalAgeMs: number): number {
  const ceiling = animation.travelRevealCeiling;
  if (arrivalAgeMs > 0) {
    const t = ease(Math.min(1, arrivalAgeMs / Math.max(1, animation.arrivalRevealDurationMs)), "easeInOut");
    return ceiling + (1 - ceiling) * t;
  }
  return smoothstep(animation.revealStartProgress, 1, progress) * ceiling;
}

/**
 * Write the state of `animation` at `timeMs` into `frame`.
 *
 * ZERO ALLOCATION. Every field is assigned; Point fields borrow the
 * animation's own (immutable) objects, and only `currentPosition` is mutated.
 * This is the function the render loop should call.
 */
export function writeAnimationFrame(
  animation: PieceAnimation,
  timeMs: number,
  frame: PieceAnimationFrame
): PieceAnimationFrame {
  // --- copy identity + config (scalars and shared refs, no allocation) ---
  frame.id = animation.id;
  frame.assignmentId = animation.assignmentId;
  frame.pieceId = animation.pieceId;
  frame.midiNote = animation.midiNote;
  frame.startTimeMs = animation.startTimeMs;
  frame.endTimeMs = animation.endTimeMs;
  frame.durationMs = animation.durationMs;
  frame.delayMs = animation.delayMs;
  frame.spawnPosition = animation.spawnPosition;
  frame.targetPosition = animation.targetPosition;
  frame.controlPoint = animation.controlPoint;
  frame.motionPath = animation.motionPath;
  frame.revealStartProgress = animation.revealStartProgress;
  frame.travelRevealCeiling = animation.travelRevealCeiling;
  frame.arrivalRevealDurationMs = animation.arrivalRevealDurationMs;
  frame.zIndex = animation.zIndex;
  frame.easing = animation.easing;
  frame.motion = animation.motion;

  const elapsedMs = timeMs - animation.startTimeMs;
  frame.elapsedMs = elapsedMs;

  const motion = animation.motion;
  if (motion) {
    evaluateMotionInto(motion, elapsedMs, animation.durationMs);
  } else {
    scratchScale = animation.scale;
    scratchRotation = animation.rotation;
    scratchOpacity = animation.opacity;
  }
  const baseScale = scratchScale;
  frame.rotation = scratchRotation;
  frame.opacity = scratchOpacity;

  // --- cancelled --------------------------------------------------------
  if (animation.state === "cancelled") {
    frame.state = "cancelled";
    frame.progress = 0;
    frame.currentPosition.x = animation.spawnPosition.x;
    frame.currentPosition.y = animation.spawnPosition.y;
    frame.scale = baseScale;
    frame.visible = false;
    frame.completed = false;
    frame.revealProgress = 0;
    return frame;
  }

  // --- not started yet: sit on the key ----------------------------------
  if (elapsedMs < 0) {
    frame.state = "scheduled";
    frame.progress = 0;
    frame.currentPosition.x = animation.spawnPosition.x;
    frame.currentPosition.y = animation.spawnPosition.y;
    frame.scale = baseScale;
    frame.visible = false;
    frame.completed = false;
    frame.revealProgress = 0;
    return frame;
  }

  // --- arrived: EXACT target, lock-in untouched -------------------------
  if (elapsedMs >= animation.durationMs) {
    frame.state = "arrived";
    frame.progress = 1;
    frame.currentPosition.x = animation.targetPosition.x;
    frame.currentPosition.y = animation.targetPosition.y;
    frame.scale = baseScale;
    frame.visible = true;
    frame.completed = true;
    frame.revealProgress = revealProgressFor(animation, 1, elapsedMs - animation.durationMs);
    return frame;
  }

  // --- travelling -------------------------------------------------------
  const linear = elapsedMs / animation.durationMs;
  const progress = ease(linear, animation.easing);
  const growth = SPAWN_MIN_SCALE + (1 - SPAWN_MIN_SCALE) * ease(linear, "easeOut");

  frame.state = "moving";
  frame.progress = progress;
  frame.scale = baseScale * growth;
  frame.visible = true;
  frame.completed = false;
  samplePathInto(animation.motionPath, progress, frame.currentPosition);
  frame.revealProgress = revealProgressFor(animation, progress, 0);
  return frame;
}

/**
 * Allocating wrapper kept for backward compatibility and for tests.
 * Prefer `writeAnimationFrame` inside the render loop.
 */
export function evaluateAnimation(animation: PieceAnimation, timeMs: number): PieceAnimationFrame {
  return writeAnimationFrame(animation, timeMs, createBlankFrame());
}
