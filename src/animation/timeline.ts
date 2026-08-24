import type { GeometryPiece, Point } from "../geometry/models";
import type { MappedNoteEvent } from "../midi/event-models";
import type { PuzzlePieceAssignment } from "../puzzle/puzzle-event-models";
import type { AnimationSource, AnimationTimeline, PieceAnimation } from "./models";
import { normalizeAnimationTiming } from "./models";
import { travelDuration } from "./piece-animation";
import { applyExpressionToAnimation } from "./expression-adapter";

/* ---------- seeded PRNG (mulberry32) for deterministic randomness ---------- */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function simpleHash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ---------- random spawn generation ---------- */

/** Generate a random spawn point around the edges of the bounding box. */
function randomEdgeSpawn(pieces: GeometryPiece[], rand: () => number): Point {
  if (!pieces.length) return { x: 0, y: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pieces) {
    const tx = p.targetPosition.x, ty = p.targetPosition.y;
    if (tx < minX) minX = tx;
    if (ty < minY) minY = ty;
    if (tx > maxX) maxX = tx;
    if (ty > maxY) maxY = ty;
  }
  const pad = 220;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const w = maxX - minX, h = maxY - minY;
  const edge = Math.floor(rand() * 4);
  switch (edge) {
    case 0: return { x: minX + rand() * w, y: minY - rand() * pad * 0.6 };       // top
    case 1: return { x: maxX + rand() * pad * 0.6, y: minY + rand() * h };       // right
    case 2: return { x: minX + rand() * w, y: maxY + rand() * pad * 0.6 };       // bottom
    default: return { x: minX - rand() * pad * 0.6, y: minY + rand() * h };      // left
  }
}

/** Compute a Bézier control point that pulls the path off the straight line. */
function computeControlPoint(
  from: Point,
  to: Point,
  curvature: number,
  rand: () => number
): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = -dy / dist;
  const ny = dx / dist;
  const side = rand() > 0.5 ? 1 : -1;
  const bend = dist * 0.32 * curvature * side * (0.6 + rand() * 0.8);
  return {
    x: (from.x + to.x) / 2 + nx * bend,
    y: (from.y + to.y) / 2 + ny * bend
  };
}

/* ---------- main ---------- */

export function buildAnimationTimeline(source: AnimationSource): AnimationTimeline {
  const settings = normalizeAnimationTiming(source.timing);
  const eventById = new Map(source.mapping.events.map((event) => [event.id, event]));
  const pieceById = new Map(source.pieces.map((piece) => [piece.id, piece]));

  // Shared PRNG seeded from assignments for deterministic randomness
  const seed = simpleHash(source.mapping.assignments.map(a => a.id).join(",") || "default");
  const rand = mulberry32(seed);

  // Collect raw animations first (to allow random re-ordering)
  const rawAnimations: PieceAnimation[] = [];
  const perPieceEnd = new Map<string, number>();

  for (const assignment of source.mapping.assignments) {
    const event = eventById.get(assignment.noteEventId);
    const piece = pieceById.get(assignment.pieceId);
    if (!event || !piece) continue;

    // Determine spawn position
    let spawnPosition: Point;
    if (settings.randomSpawn) {
      spawnPosition = randomEdgeSpawn(source.pieces, rand);
    } else {
      if (!event.spawnPoint) continue;
      spawnPosition = event.spawnPoint;
    }

    const durationMs = travelDuration(event, settings);
    let startTimeMs = event.startTimeMs + settings.preHitDelayMs;

    // Compute Bézier control point for curved motion
    const controlPoint = computeControlPoint(spawnPosition, piece.targetPosition, settings.pathCurvature, rand);

    if (settings.overlapMode === "queue") {
      startTimeMs = Math.max(startTimeMs, perPieceEnd.get(piece.id) ?? 0);
    }
    if (settings.overlapMode === "replace") {
      for (const item of rawAnimations) {
        if (item.pieceId === piece.id && item.startTimeMs >= startTimeMs) item.state = "cancelled";
      }
    }

    const endTimeMs = startTimeMs + durationMs + settings.postHitHoldMs;
    perPieceEnd.set(piece.id, endTimeMs);

    const base: PieceAnimation = {
      id: `animation-${assignment.id}`,
      assignmentId: assignment.id,
      pieceId: piece.id,
      midiNote: event.midiNote,
      startTimeMs,
      endTimeMs,
      durationMs,
      delayMs: settings.preHitDelayMs,
      progress: 0,
      state: "scheduled",
      spawnPosition,
      targetPosition: piece.targetPosition,
      controlPoint,
      currentPosition: spawnPosition,
      rotation: 0,
      scale: 1,
      opacity: 1,
      zIndex: piece.layer,
      easing: settings.easing,
      completed: false,
      visible: false
    };

    rawAnimations.push(applyExpressionToAnimation(base, source.expression?.noteExpressions.get(assignment.id)));
  }

  // Optionally randomize arrival order by shuffling start-times among animations.
  // This preserves the original MIDI timing distribution so the puzzle finishes
  // at the same time as the last note, but pieces arrive in random order.
  if (settings.randomOrder && rawAnimations.length > 1) {
    // Collect original start times
    const shuffledStarts = rawAnimations.map((a) => a.startTimeMs);
    // Fisher-Yates shuffle the start times
    for (let i = shuffledStarts.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffledStarts[i], shuffledStarts[j]] = [shuffledStarts[j], shuffledStarts[i]];
    }
    // Re-assign shuffled start times and recalculate end times
    for (let i = 0; i < rawAnimations.length; i++) {
      rawAnimations[i].startTimeMs = shuffledStarts[i];
      rawAnimations[i].endTimeMs = shuffledStarts[i] + rawAnimations[i].durationMs + settings.postHitHoldMs;
    }
  }

  const animations: PieceAnimation[] = rawAnimations;

  return {
    animations,
    totalDurationMs: Math.max(
      source.mapping.events.reduce((m, event) => Math.max(m, event.startTimeMs + event.durationMs), 0),
      ...animations.map((a) => a.endTimeMs),
      0
    )
  };
}
