import type { PieceAnimationFrame } from "./models";
import { createIdentityMotionPath } from "./motion-path";

const ORIGIN = Object.freeze({ x: 0, y: 0 });
const IDENTITY_PATH = createIdentityMotionPath();

/**
 * A frame object that is written in place every tick.
 *
 * `currentPosition` is owned by the frame (mutable). Every other Point field is
 * a reference borrowed from the PieceAnimation, so writing a frame allocates
 * nothing at all.
 *
 * Contract for consumers: a frame is valid only until the next evaluate() call.
 * Do not retain it across ticks. Copy what you need.
 */
export function createBlankFrame(): PieceAnimationFrame {
  return {
    id: "",
    assignmentId: "",
    pieceId: "",
    midiNote: 0,
    startTimeMs: 0,
    endTimeMs: 0,
    durationMs: 0,
    delayMs: 0,
    progress: 0,
    state: "idle",
    spawnPosition: ORIGIN,
    targetPosition: ORIGIN,
    currentPosition: { x: 0, y: 0 },
    controlPoint: ORIGIN,
    motionPath: IDENTITY_PATH,
    revealStartProgress: 0.82,
    travelRevealCeiling: 0.28,
    arrivalRevealDurationMs: 620,
    rotation: 0,
    scale: 1,
    opacity: 1,
    zIndex: 0,
    easing: "easeOut",
    completed: false,
    visible: false,
    revealProgress: 0,
    elapsedMs: 0
  };
}

/** Grows on demand, never shrinks. Reused across the whole session. */
export class PieceFramePool {
  private readonly frames: PieceAnimationFrame[] = [];

  ensure(count: number): void {
    while (this.frames.length < count) this.frames.push(createBlankFrame());
  }

  at(index: number): PieceAnimationFrame {
    return this.frames[index];
  }

  get capacity(): number {
    return this.frames.length;
  }
}
