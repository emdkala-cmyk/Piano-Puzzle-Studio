import type { Point } from "../geometry/models";
import type { MappedNoteEvent } from "../midi/event-models";
import type { AnimationTimingSettings, PieceAnimation, PieceAnimationFrame } from "./models";
import { ease } from "./easing";

export function travelDuration(event: MappedNoteEvent, settings: AnimationTimingSettings): number {
  const velocity = Math.max(0, Math.min(1, event.normalizedVelocity));
  const noteFactor = Math.max(0, Math.min(1, event.durationMs / 2000));
  const raw = settings.baseTravelDurationMs - velocity * settings.velocityInfluence + noteFactor * settings.durationInfluence * settings.baseTravelDurationMs;
  return Math.max(settings.minTravelDurationMs, Math.min(settings.maxTravelDurationMs, raw));
}

export function evaluateAnimation(animation: PieceAnimation, timeMs: number): PieceAnimationFrame {
  const elapsedMs = timeMs - animation.startTimeMs;
  if (animation.state === "cancelled") return { ...animation, progress: 0, currentPosition: animation.spawnPosition, state: "cancelled", visible: false, completed: false, elapsedMs };
  if (elapsedMs < 0) return { ...animation, progress: 0, currentPosition: animation.spawnPosition, state: "scheduled", visible: false, completed: false, elapsedMs };
  if (elapsedMs >= animation.durationMs) return { ...animation, progress: 1, currentPosition: animation.targetPosition, state: "arrived", visible: true, completed: true, elapsedMs };
  const progress = ease(elapsedMs / animation.durationMs, animation.easing);
  const currentPosition: Point = { x: animation.spawnPosition.x + (animation.targetPosition.x - animation.spawnPosition.x) * progress, y: animation.spawnPosition.y + (animation.targetPosition.y - animation.spawnPosition.y) * progress };
  return { ...animation, progress, currentPosition, state: "moving", visible: true, completed: false, elapsedMs };
}
