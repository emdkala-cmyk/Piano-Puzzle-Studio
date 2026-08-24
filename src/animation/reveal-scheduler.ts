import type { GeometryPiece } from "../geometry/models";
import { SeededRandom } from "../fx/seeded-random";

export type RevealOrderMode = "musical" | "scattered";

export interface RevealSlot {
  assignmentId: string;
  noteEventId: string;
  /** Musical time of the note. NEVER modified by the scheduler. */
  startTimeMs: number;
  /** Which piece this slot delivers. This is the ONLY field the scheduler writes. */
  pieceId: string;
  /** Stable tiebreaker so sorting is deterministic. */
  orderIndex: number;
}

export interface RevealScheduleOptions {
  mode: RevealOrderMode;
  seed: string | number;
  zoneRows: number;
  zoneCols: number;
}

export interface RevealScheduleStats {
  slots: number;
  reassigned: number;
  zonesUsed: number;
  distinctPieces: number;
}

/**
 * Randomize *arrival order* without ever touching note timing.
 *
 * Invariants (asserted by the unit tests):
 *  1. `startTimeMs` of every slot is untouched.
 *  2. The multiset of pieceIds before == after (bijection). No piece is lost,
 *     none is duplicated, so the finished image is identical.
 *  3. Consecutive slots come from different spatial zones whenever possible,
 *     which is what produces "one top, one bottom, one middle".
 *  4. Fully deterministic for a given seed -> seek / replay / export parity.
 */
export function scheduleRevealOrder(
  slots: RevealSlot[],
  pieceById: ReadonlyMap<string, GeometryPiece>,
  options: RevealScheduleOptions
): RevealScheduleStats {
  const distinctPieces = countDistinct(slots);
  if (options.mode === "musical" || slots.length < 2) {
    return { slots: slots.length, reassigned: 0, zonesUsed: 0, distinctPieces };
  }

  const rows = Math.max(1, Math.round(options.zoneRows));
  const cols = Math.max(1, Math.round(options.zoneCols));
  const zoneCount = rows * cols;
  const rng = new SeededRandom(options.seed);

  // Musical order defines the time slots we are filling.
  const order = slots.map((_, index) => index);
  order.sort((a, b) =>
    slots[a].startTimeMs - slots[b].startTimeMs || slots[a].orderIndex - slots[b].orderIndex
  );

  // --- bounds over the pieces actually referenced -------------------------
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const slot of slots) {
    const piece = pieceById.get(slot.pieceId);
    if (!piece) continue;
    const { x, y } = piece.targetPosition;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) {
    return { slots: slots.length, reassigned: 0, zonesUsed: 0, distinctPieces };
  }
  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);

  // --- bucket the pieceId multiset by zone --------------------------------
  const buckets: string[][] = [];
  for (let i = 0; i < zoneCount; i += 1) buckets.push([]);

  for (const index of order) {
    const slot = slots[index];
    const piece = pieceById.get(slot.pieceId);
    let zone = 0;
    if (piece) {
      const col = Math.min(cols - 1, Math.floor(((piece.targetPosition.x - minX) / spanX) * cols));
      const row = Math.min(rows - 1, Math.floor(((piece.targetPosition.y - minY) / spanY) * rows));
      zone = row * cols + col;
    }
    buckets[zone].push(slot.pieceId);
  }

  // Seeded shuffle inside each zone so runs differ but stay reproducible.
  for (const bucket of buckets) {
    for (let i = bucket.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng.nextFloat() * (i + 1));
      const tmp = bucket[i];
      bucket[i] = bucket[j];
      bucket[j] = tmp;
    }
  }

  // --- emit: always leave the zone we just used --------------------------
  let reassigned = 0;
  let zonesUsed = 0;
  for (const bucket of buckets) if (bucket.length) zonesUsed += 1;

  let lastZone = -1;
  for (const index of order) {
    const zone = pickZone(buckets, lastZone, rng);
    if (zone < 0) break;
    const pieceId = buckets[zone].pop() as string;
    if (slots[index].pieceId !== pieceId) reassigned += 1;
    slots[index].pieceId = pieceId;
    lastZone = zone;
  }

  return { slots: slots.length, reassigned, zonesUsed, distinctPieces };
}

/**
 * Choose the fullest non-empty zone, avoiding `avoidZone` when an alternative
 * exists. Draining the fullest zone first keeps the reveal spread even instead
 * of finishing one region and then moving on.
 */
function pickZone(buckets: string[][], avoidZone: number, rng: SeededRandom): number {
  let best = -1;
  let bestCount = 0;
  let fallback = -1;
  let fallbackCount = 0;

  for (let zone = 0; zone < buckets.length; zone += 1) {
    const count = buckets[zone].length;
    if (count === 0) continue;
    if (zone === avoidZone) {
      if (count > fallbackCount) { fallback = zone; fallbackCount = count; }
      continue;
    }
    // Seeded jitter breaks ties without breaking determinism.
    const weighted = count + rng.nextFloat() * 0.5;
    if (weighted > bestCount) { best = zone; bestCount = weighted; }
  }
  return best >= 0 ? best : fallback;
}

function countDistinct(slots: readonly RevealSlot[]): number {
  const seen = new Set<string>();
  for (const slot of slots) seen.add(slot.pieceId);
  return seen.size;
}
