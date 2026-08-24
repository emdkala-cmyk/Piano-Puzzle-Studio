import { describe, expect, it } from "vitest";
import {
  MOTION_PATH_KINDS, createMotionPathParams, samplePathInto,
  DEFAULT_MOTION_PATH_SHAPING, type MutablePoint
} from "../motion-path";

const shaping = { ...DEFAULT_MOTION_PATH_SHAPING };
const out: MutablePoint = { x: 0, y: 0 };

describe("motion paths", () => {
  it("starts exactly on the key and ends exactly on the target", () => {
    for (const kind of MOTION_PATH_KINDS) {
      const p = createMotionPathParams(120, 700, 640, 220, { ...shaping, kind }, ["seed", kind], 60);
      samplePathInto(p, 0, out);
      expect([out.x, out.y]).toEqual([120, 700]);
      samplePathInto(p, 1, out);
      expect([out.x, out.y]).toEqual([640, 220]);
      samplePathInto(p, 1.5, out);   // clamped
      expect([out.x, out.y]).toEqual([640, 220]);
    }
  });

  it("is deterministic for the same seed and differs for another", () => {
    const a = createMotionPathParams(0, 0, 500, 500, shaping, ["s", "piece-1"], 60);
    const b = createMotionPathParams(0, 0, 500, 500, shaping, ["s", "piece-1"], 60);
    const c = createMotionPathParams(0, 0, 500, 500, shaping, ["s", "piece-2"], 60);
    expect(a).toEqual(b);
    expect(c.orbitPhase).not.toBe(a.orbitPhase);
  });

  it("leaves the straight line (not a linear path)", () => {
    const p = createMotionPathParams(0, 0, 1000, 0, { ...shaping, kind: "spiral" }, ["s", "p"], 60);
    let maxDeviation = 0;
    for (let i = 1; i < 100; i += 1) {
      samplePathInto(p, i / 100, out);
      maxDeviation = Math.max(maxDeviation, Math.abs(out.y));
    }
    expect(maxDeviation).toBeGreaterThan(20);
  });

  it("produces finite values everywhere", () => {
    for (const kind of MOTION_PATH_KINDS) {
      const p = createMotionPathParams(10, 10, 900, 400, { ...shaping, kind }, ["s", kind], 90);
      for (let i = 0; i <= 200; i += 1) {
        samplePathInto(p, i / 200, out);
        expect(Number.isFinite(out.x) && Number.isFinite(out.y)).toBe(true);
      }
    }
  });
});
