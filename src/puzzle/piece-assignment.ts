import type { GeometryPiece } from "../geometry/models";
import type { MappedNoteEvent } from "../midi/event-models";
import type { PieceMappingMode, PuzzlePieceAssignment } from "./puzzle-event-models";
import { selectNearestPiece } from "./piece-selection";
import { selectSequentialPiece, type SequenceCursor } from "./sequence-assignment";

export interface SequenceAssignmentState { cursor: SequenceCursor; usedPieceIds: Set<string>; cycle: boolean }

export function assignPieces(event: MappedNoteEvent, pieces: GeometryPiece[], mode: PieceMappingMode, sequenceState?: SequenceAssignmentState): PuzzlePieceAssignment[] {
  if (!pieces.length || !event.spawnPoint) return [];
  const selectedPiece = mode === "deterministic-sequence" && sequenceState
    ? selectSequentialPiece(sequenceState.cursor, sequenceState.usedPieceIds, sequenceState.cycle)
    : selectNearestPiece(event.spawnPoint, pieces)?.piece;
  if (!selectedPiece) return [];
  if (mode === "deterministic-sequence" && sequenceState) sequenceState.usedPieceIds.add(selectedPiece.id);
  const distance = Math.hypot(selectedPiece.centroid.x - event.spawnPoint.x, selectedPiece.centroid.y - event.spawnPoint.y);
  const reason = mode === "nearest-centroid" ? "Nearest projected spawn point to piece centroid" : mode === "deterministic-sequence" ? "Deterministic reveal order across puzzle pieces" : `Deterministic fallback for ${mode}`;
  return [{ id: `assignment-${event.id}-${selectedPiece.id}`, noteEventId: event.id, midiNote: event.midiNote, pieceId: selectedPiece.id, mappingMode: mode, distance, assignedAt: Date.now(), reason, valid: true }];
}
