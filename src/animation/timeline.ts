import type { GeometryPiece } from "../geometry/models";
import type { MappedNoteEvent } from "../midi/event-models";
import type { PuzzlePieceAssignment } from "../puzzle/puzzle-event-models";
import type { AnimationSource, AnimationTimeline, PieceAnimation } from "./models";
import { normalizeAnimationTiming } from "./models";
import { travelDuration } from "./piece-animation";
import { applyExpressionToAnimation } from "./expression-adapter";

function pseudoRandom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 10000) / 10000;
}

export function buildAnimationTimeline(source: AnimationSource): AnimationTimeline {
  const settings = normalizeAnimationTiming(source.timing);
  const eventById = new Map(source.mapping.events.map((event) => [event.id, event]));
  const pieceById = new Map(source.pieces.map((piece) => [piece.id, piece]));
  const animations: PieceAnimation[] = [];
  const perPieceEnd = new Map<string, number>();
  for (const assignment of source.mapping.assignments) {
    const event = eventById.get(assignment.noteEventId);
    const piece = pieceById.get(assignment.pieceId);
    if (!event || !piece || !event.spawnPoint) continue;
    const durationMs = travelDuration(event, settings);
    let startTimeMs = event.startTimeMs + settings.preHitDelayMs;
    if (settings.overlapMode === "queue") startTimeMs = Math.max(startTimeMs, perPieceEnd.get(piece.id) ?? 0);
    if (settings.overlapMode === "replace") {
      for (const item of animations) if (item.pieceId === piece.id && item.startTimeMs >= startTimeMs) item.state = "cancelled";
    }
    const endTimeMs = startTimeMs + durationMs + settings.postHitHoldMs;
    perPieceEnd.set(piece.id, endTimeMs);
    const dx = piece.targetPosition.x - event.spawnPoint.x;
    const dy = piece.targetPosition.y - event.spawnPoint.y;
    const dist = Math.hypot(dx, dy);
    const perpX = -dy / (dist || 1);
    const perpY = dx / (dist || 1);
    const side = pseudoRandom(assignment.id + "side") > 0.5 ? 1 : -1;
    const bendStrength = dist * (0.15 + pseudoRandom(assignment.id + "bend") * 0.35);
    const controlPoint = {
      x: event.spawnPoint.x + dx * (0.3 + pseudoRandom(assignment.id + "cx") * 0.4) + perpX * bendStrength * side,
      y: event.spawnPoint.y + dy * (0.3 + pseudoRandom(assignment.id + "cy") * 0.4) + perpY * bendStrength * side
    };
    const base: PieceAnimation = { id: `animation-${assignment.id}`, assignmentId: assignment.id, pieceId: piece.id, midiNote: event.midiNote, startTimeMs, endTimeMs, durationMs, delayMs: settings.preHitDelayMs, progress: 0, state: "scheduled", spawnPosition: event.spawnPoint, targetPosition: piece.targetPosition, currentPosition: event.spawnPoint, controlPoint, rotation: 0, scale: 1, opacity: 1, zIndex: piece.layer, easing: settings.easing, completed: false, visible: false };
    animations.push(applyExpressionToAnimation(base, source.expression?.noteExpressions.get(assignment.id)));
  }
  return { animations, totalDurationMs: Math.max(source.mapping.events.reduce((m, event) => Math.max(m, event.startTimeMs + event.durationMs), 0), ...animations.map((a) => a.endTimeMs), 0) };
}
