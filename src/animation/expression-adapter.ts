import type { NoteExpression } from "../expression/models";
import type { PieceAnimation } from "./models";

const MIN_TRAVEL_DURATION_MS = 60;

export function applyExpressionToAnimation(animation: PieceAnimation, expression: NoteExpression | undefined): PieceAnimation {
  if (!expression) return animation;
  const motion = expression.motionProfile;
  const startTimeMs = animation.startTimeMs + motion.delayMs;
  const durationMs = Math.max(MIN_TRAVEL_DURATION_MS, animation.durationMs + motion.travelDurationMs);
  const endTimeMs = startTimeMs + durationMs + motion.arrivalHoldMs;
  return {
    ...animation,
    startTimeMs,
    endTimeMs,
    durationMs,
    delayMs: animation.delayMs + motion.delayMs,
    motion
  };
}
