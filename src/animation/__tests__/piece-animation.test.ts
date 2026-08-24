import { describe, expect, it } from "vitest";
import { writeAnimationFrame } from "../piece-animation";
import { createBlankFrame } from "../frame-pool";
import { createMotionPathParams, DEFAULT_MOTION_PATH_SHAPING } from "../motion-path";
import type { PieceAnimation } from "../models";

function animation(): PieceAnimation {
  const spawn = { x: 100, y: 800 };
  const target = { x: 600, y: 200 };
  const motionPath = createMotionPathParams(
    spawn.x, spawn.y, target.x, target.y, DEFAULT_MOTION_PATH_SHAPING, ["s", "a-1"], 60
  );
  return {
    id: "animation-a-1", assignmentId: "a-1", pieceId: "piece-1", midiNote: 60,
    startTimeMs: 1000, endTimeMs: 1620, durationMs: 500, delayMs: 0,
    progress: 0, state: "scheduled",
    spawnPosition: spawn, targetPosition: target, currentPosition: spawn,
    controlPoint: { x: motionPath.controlX, y: motionPath.controlY }, motionPath,
    revealStartProgress: 0.82, travelRevealCeiling: 0.28, arrivalRevealDurationMs: 620,
    rotation: 0, scale: 1, opacity: 1, zIndex: 0, easing: "easeOut",
    completed: false, visible: false
  };
}

describe("frame evaluation", () => {
  it("spawns on the key, not somewhere random", () => {
    const frame = writeAnimationFrame(animation(), 900, createBlankFrame());
    expect(frame.currentPosition).toEqual({ x: 100, y: 800 });
    expect(frame.visible).toBe(false);
  });

  it("keeps the artwork hidden while travelling", () => {
    const a = animation();
    const frame = createBlankFrame();
    for (const t of [1050, 1150, 1250, 1350]) {
      writeAnimationFrame(a, t, frame);
      expect(frame.state).toBe("moving");
      expect(frame.revealProgress).toBeLessThanOrEqual(a.travelRevealCeiling + 1e-9);
    }
  });

  it("lands exactly on target and completes the reveal after arrival", () => {
    const a = animation();
    const frame = createBlankFrame();
    writeAnimationFrame(a, 1500, frame);
    expect(frame.currentPosition).toEqual({ x: 600, y: 200 });
    expect(frame.state).toBe("arrived");
    writeAnimationFrame(a, 1500 + a.arrivalRevealDurationMs, frame);
    expect(frame.revealProgress).toBeCloseTo(1, 5);
  });

  it("reuses the same frame object (no allocation per tick)", () => {
    const a = animation();
    const frame = createBlankFrame();
    const position = frame.currentPosition;
    for (let t = 1000; t < 1500; t += 16) {
      const returned = writeAnimationFrame(a, t, frame);
      expect(returned).toBe(frame);
      expect(returned.currentPosition).toBe(position);
    }
  });

  it("is deterministic for seek and replay", () => {
    const a = animation();
    const forward = createBlankFrame();
    const seeked = createBlankFrame();
    for (let t = 1000; t <= 1400; t += 16) writeAnimationFrame(a, t, forward);
    writeAnimationFrame(a, 1400, seeked);
    expect(seeked.currentPosition).toEqual(forward.currentPosition);
  });
});
