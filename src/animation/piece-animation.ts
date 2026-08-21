import type { Point } from "../geometry/models";
import type { MappedNoteEvent } from "../midi/event-models";
import type { MotionProfile } from "../expression/models";
import type { AnimationTimingSettings, PieceAnimation, PieceAnimationFrame } from "./models";
import { ease } from "./easing";

export function travelDuration(event: MappedNoteEvent, settings: AnimationTimingSettings): number {
  const velocity = Math.max(0, Math.min(1, event.normalizedVelocity));
  const noteFactor = Math.max(0, Math.min(1, event.durationMs / 2000));
  const raw = settings.baseTravelDurationMs - velocity * settings.velocityInfluence + noteFactor * settings.durationInfluence * settings.baseTravelDurationMs;
  return Math.max(settings.minTravelDurationMs, Math.min(settings.maxTravelDurationMs, raw));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

interface MotionVisuals {
  scale: number;
  rotation: number;
  opacity: number;
}

function evaluateMotion(motion: MotionProfile, elapsedMs: number, durationMs: number): MotionVisuals {
  if (elapsedMs < 0) return { scale: motion.scaleStart, rotation: motion.rotationStart, opacity: motion.opacityStart };
  if (elapsedMs < durationMs) {
    const t = ease(durationMs > 0 ? elapsedMs / durationMs : 1, motion.easing);
    return { scale: lerp(motion.scaleStart, motion.scalePeak, t), rotation: lerp(motion.rotationStart, motion.rotationEnd, t), opacity: lerp(motion.opacityStart, motion.opacityPeak, t) };
  }
  const settleElapsedMs = elapsedMs - durationMs;
  if (settleElapsedMs < motion.arrivalHoldMs) {
    const t = ease(motion.arrivalHoldMs > 0 ? settleElapsedMs / motion.arrivalHoldMs : 1, motion.easing);
    return { scale: lerp(motion.scalePeak, motion.scaleEnd, t), rotation: lerp(motion.rotationEnd, 0, t), opacity: lerp(motion.opacityPeak, motion.opacityEnd, t) };
  }
  return { scale: motion.scaleEnd, rotation: 0, opacity: motion.opacityEnd };
}

export function evaluateAnimation(animation: PieceAnimation, timeMs: number): PieceAnimationFrame {
  const elapsedMs = timeMs - animation.startTimeMs;
  const motion = animation.motion;
  const visuals = motion ? evaluateMotion(motion, elapsedMs, animation.durationMs) : undefined;
  const scale = visuals?.scale ?? animation.scale;
  const rotation = visuals?.rotation ?? animation.rotation;
  const opacity = visuals?.opacity ?? animation.opacity;
  if (animation.state === "cancelled") return { ...animation, progress: 0, currentPosition: animation.spawnPosition, state: "cancelled", visible: false, completed: false, elapsedMs };
  if (elapsedMs < 0) return { ...animation, scale, rotation, opacity, progress: 0, currentPosition: animation.spawnPosition, state: "scheduled", visible: false, completed: false, elapsedMs };
  if (elapsedMs >= animation.durationMs) return { ...animation, scale, rotation, opacity, progress: 1, currentPosition: animation.targetPosition, state: "arrived", visible: true, completed: true, elapsedMs };
  const progress = ease(elapsedMs / animation.durationMs, animation.easing);
  const currentPosition: Point = { x: animation.spawnPosition.x + (animation.targetPosition.x - animation.spawnPosition.x) * progress, y: animation.spawnPosition.y + (animation.targetPosition.y - animation.spawnPosition.y) * progress };
  return { ...animation, scale, rotation, opacity, progress, currentPosition, state: "moving", visible: true, completed: false, elapsedMs };
}
