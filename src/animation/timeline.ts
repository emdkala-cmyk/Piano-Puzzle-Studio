import type { GeometryPiece, Point } from "../geometry/models";
import type { MappedNoteEvent } from "../midi/event-models";
import type { AnimationSource, AnimationTimeline, PieceAnimation } from "./models";
import { normalizeAnimationTiming } from "./models";
import { travelDuration } from "./piece-animation";
import { applyExpressionToAnimation } from "./expression-adapter";
import { createMotionPathParams, type MotionPathShaping } from "./motion-path";
import { scheduleRevealOrder, type RevealSlot } from "./reveal-scheduler";
import { SeededRandom, hashSeed } from "../fx/seeded-random";

/**
 * Deterministic sub-pixel jitter around the key so simultaneous notes on the
 * same key do not emit from a mathematically identical point. The offset is a
 * few px at most, so the origin is still unmistakably ON the key.
 */
function jitteredKeyPoint(
  spawnPoint: Point,
  jitterPx: number,
  seedParts: readonly (string | number)[]
): Point {
  if (jitterPx <= 0) return spawnPoint;
  const rng = new SeededRandom(hashSeed(...seedParts, "spawn"));
  return { x: spawnPoint.x + rng.signed(jitterPx), y: spawnPoint.y + rng.signed(jitterPx) };
}

function controlPointOf(path: { controlX: number; controlY: number }): Point {
  return { x: path.controlX, y: path.controlY };
}

export function buildAnimationTimeline(source: AnimationSource): AnimationTimeline {
  const settings = normalizeAnimationTiming(source.timing);
  const eventById = new Map<string, MappedNoteEvent>(
    source.mapping.events.map((event) => [event.id, event])
  );
  const pieceById = new Map<string, GeometryPiece>(
    source.pieces.map((piece) => [piece.id, piece])
  );

  /* ---------------------------------------------------------------- *
   * Pass 1 — collect animatable slots.
   *
   * A note is animatable ONLY if it has a projected key point. There is no
   * bounding-box fallback any more: the origin of an effect is always the
   * real piano key, never a random edge.
   * ---------------------------------------------------------------- */
  const slots: RevealSlot[] = [];
  let skippedWithoutKey = 0;

  for (let index = 0; index < source.mapping.assignments.length; index += 1) {
    const assignment = source.mapping.assignments[index];
    const event = eventById.get(assignment.noteEventId);
    const piece = pieceById.get(assignment.pieceId);
    if (!event || !piece) continue;
    if (!event.spawnPoint) { skippedWithoutKey += 1; continue; }
    slots.push({
      assignmentId: assignment.id,
      noteEventId: event.id,
      startTimeMs: event.startTimeMs,
      pieceId: assignment.pieceId,
      orderIndex: index
    });
  }

  /* ---------------------------------------------------------------- *
   * Pass 2 — randomize ARRIVAL ORDER only.
   *
   * The scheduler permutes which piece each musical slot delivers. Note
   * start-times are never modified, so the sound-to-visual binding holds:
   * the effect still erupts from the correct key at the correct instant.
   * ---------------------------------------------------------------- */
  const schedule = scheduleRevealOrder(slots, pieceById, {
    mode: settings.revealOrderMode,
    seed: hashSeed(settings.pathSeed, source.mapping.generatedAt, slots.length),
    zoneRows: settings.revealZoneRows,
    zoneCols: settings.revealZoneCols
  });

  /* ---------------------------------------------------------------- *
   * Pass 3 — build the animations.
   * ---------------------------------------------------------------- */
  const shaping: MotionPathShaping = {
    kind: settings.motionPathKind,
    curvature: settings.pathCurvature,
    orbitStrength: settings.orbitStrength,
    spiralStrength: settings.spiralStrength,
    waveStrength: settings.waveStrength,
    turbulence: settings.turbulence,
    overshootPx: settings.overshootPx
  };

  const animations: PieceAnimation[] = [];
  const perPieceEnd = new Map<string, number>();

  for (const slot of slots) {
    const event = eventById.get(slot.noteEventId);
    const piece = pieceById.get(slot.pieceId);
    if (!event || !piece || !event.spawnPoint) continue;

    // ORIGIN: the real projected piano key of THIS note.
    const spawnPosition = jitteredKeyPoint(
      event.spawnPoint,
      settings.spawnJitterPx,
      [settings.pathSeed, slot.assignmentId]
    );

    const durationMs = travelDuration(event, settings);
    let startTimeMs = event.startTimeMs + settings.preHitDelayMs;

    if (settings.overlapMode === "queue") {
      startTimeMs = Math.max(startTimeMs, perPieceEnd.get(piece.id) ?? 0);
    }
    if (settings.overlapMode === "replace") {
      for (const item of animations) {
        if (item.pieceId === piece.id && item.startTimeMs >= startTimeMs) item.state = "cancelled";
      }
    }

    // TARGET: the piece's own targetPosition. Untouched, exactly as before.
    const motionPath = createMotionPathParams(
      spawnPosition.x,
      spawnPosition.y,
      piece.targetPosition.x,
      piece.targetPosition.y,
      shaping,
      [settings.pathSeed, slot.assignmentId, piece.id],
      event.midiNote
    );

    const endTimeMs = startTimeMs + durationMs + settings.postHitHoldMs;
    perPieceEnd.set(piece.id, endTimeMs);

    const base: PieceAnimation = {
      id: `animation-${slot.assignmentId}`,
      assignmentId: slot.assignmentId,
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
      controlPoint: controlPointOf(motionPath),
      motionPath,
      revealStartProgress: settings.revealStartProgress,
      travelRevealCeiling: settings.travelRevealCeiling,
      arrivalRevealDurationMs: settings.arrivalRevealDurationMs,
      currentPosition: spawnPosition,
      rotation: 0,
      scale: 1,
      opacity: 1,
      zIndex: piece.layer,
      easing: settings.easing,
      completed: false,
      visible: false
    };

    animations.push(
      applyExpressionToAnimation(base, source.expression?.noteExpressions.get(slot.assignmentId))
    );
  }

  let totalDurationMs = source.mapping.events.reduce(
    (max, event) => Math.max(max, event.startTimeMs + event.durationMs),
    0
  );
  for (const animation of animations) {
    if (animation.endTimeMs > totalDurationMs) totalDurationMs = animation.endTimeMs;
  }

  return {
    animations,
    totalDurationMs,
    revealOrderReassigned: schedule.reassigned,
    skippedWithoutKey
  };
}
