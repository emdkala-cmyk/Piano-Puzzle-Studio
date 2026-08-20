import type { GeometryPiece } from "../geometry/models";
import type { MappedNoteEvent } from "../midi/event-models";
import type { PieceMappingMode, PuzzlePieceAssignment } from "./puzzle-event-models";
import { selectNearestPiece } from "./piece-selection";
export function assignPieces(event: MappedNoteEvent, pieces: GeometryPiece[], mode: PieceMappingMode): PuzzlePieceAssignment[] {
  if (!pieces.length || !event.spawnPoint) return [];
  const selected = selectNearestPiece(event.spawnPoint, pieces); if (!selected) return [];
  return [{ id: `assignment-${event.id}-${selected.piece.id}`, noteEventId: event.id, midiNote: event.midiNote, pieceId: selected.piece.id, mappingMode: mode, distance: selected.distance, assignedAt: Date.now(), reason: mode === "nearest-centroid" ? "Nearest projected spawn point to piece centroid" : `Deterministic fallback for ${mode}`, valid: true }];
}
