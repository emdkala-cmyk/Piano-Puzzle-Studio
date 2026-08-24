import { describe, expect, it } from "vitest";
import { scheduleRevealOrder, type RevealSlot } from "../reveal-scheduler";
import type { GeometryPiece } from "../../geometry/models";

function piece(id: string, x: number, y: number): GeometryPiece {
  return {
    id, polygon: [], centroid: { x, y }, bounds: { x, y, width: 10, height: 10 },
    area: 100, textureRegion: { x, y, width: 10, height: 10, u0: 0, v0: 0, u1: 1, v1: 1 },
    priority: 0, layer: 0, targetPosition: { x, y }
  };
}

function fixture(count: number) {
  const pieces = new Map<string, GeometryPiece>();
  const slots: RevealSlot[] = [];
  for (let i = 0; i < count; i += 1) {
    const id = `piece-${i}`;
    pieces.set(id, piece(id, (i % 10) * 100, Math.floor(i / 10) * 100));
    slots.push({ assignmentId: `a-${i}`, noteEventId: `n-${i}`, startTimeMs: i * 250, pieceId: id, orderIndex: i });
  }
  return { pieces, slots };
}

const opts = { mode: "scattered" as const, seed: "test", zoneRows: 3, zoneCols: 3 };

describe("reveal scheduler", () => {
  it("never modifies note start-times", () => {
    const { pieces, slots } = fixture(60);
    const before = slots.map((s) => s.startTimeMs);
    scheduleRevealOrder(slots, pieces, opts);
    expect(slots.map((s) => s.startTimeMs)).toEqual(before);
  });

  it("is a bijection: no piece lost, none duplicated", () => {
    const { pieces, slots } = fixture(60);
    const before = slots.map((s) => s.pieceId).sort();
    scheduleRevealOrder(slots, pieces, opts);
    expect(slots.map((s) => s.pieceId).sort()).toEqual(before);
  });

  it("actually scatters instead of going row by row", () => {
    const { pieces, slots } = fixture(60);
    const stats = scheduleRevealOrder(slots, pieces, opts);
    expect(stats.reassigned).toBeGreaterThan(30);

    // consecutive arrivals should mostly change vertical zone
    let zoneChanges = 0;
    for (let i = 1; i < slots.length; i += 1) {
      const a = pieces.get(slots[i - 1].pieceId)!.targetPosition.y;
      const b = pieces.get(slots[i].pieceId)!.targetPosition.y;
      if (Math.abs(a - b) > 100) zoneChanges += 1;
    }
    expect(zoneChanges).toBeGreaterThan(slots.length * 0.5);
  });

  it("is deterministic across runs (seek / replay / export parity)", () => {
    const first = fixture(60);
    const second = fixture(60);
    scheduleRevealOrder(first.slots, first.pieces, opts);
    scheduleRevealOrder(second.slots, second.pieces, opts);
    expect(first.slots.map((s) => s.pieceId)).toEqual(second.slots.map((s) => s.pieceId));
  });

  it("musical mode is a no-op", () => {
    const { pieces, slots } = fixture(20);
    const before = slots.map((s) => s.pieceId);
    scheduleRevealOrder(slots, pieces, { ...opts, mode: "musical" });
    expect(slots.map((s) => s.pieceId)).toEqual(before);
  });
});
