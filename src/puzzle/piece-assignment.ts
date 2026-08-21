import type { GeometryPiece } from "../geometry/models";
import type { MappedNoteEvent } from "../midi/event-models";
import type { PieceMappingMode, PuzzlePieceAssignment } from "./puzzle-event-models";
import { selectNearestPiece } from "./piece-selection";
import { selectSequentialPieces, type SequenceCursor } from "./sequence-assignment";

export interface SequenceAssignmentState { cursor: SequenceCursor; usedPieceIds: Set<string>; cycle: boolean }

export function assignPieces(event: MappedNoteEvent, pieces: GeometryPiece[], mode: PieceMappingMode, sequenceState?: SequenceAssignmentState, remainingEvents = 1): PuzzlePieceAssignment[] {
  if (!pieces.length || !event.spawnPoint) return [];
  if (mode === "deterministic-sequence" && sequenceState) {
    const selectedPieces = selectSequentialPieces(sequenceState.cursor, sequenceState.usedPieceIds, remainingEvents, sequenceState.cycle);
    return selectedPieces.map((piece) => {
      const distance = Math.hypot(piece.centroid.x - event.spawnPoint!.x, piece.centroid.y - event.spawnPoint!.y);
      return { id: `assignment-${event.id}-${piece.id}`, noteEventId: event.id, midiNote: event.midiNote, pieceId: piece.id, mappingMode: mode, distance, assignedAt: Date.now(), reason: "Deterministic reveal order across puzzle pieces", valid: true };
    });
  }
  const selectedPiece = selectNearestPiece(event.spawnPoint, pieces)?.piece;
  if (!selectedPiece) return [];
  const distance = Math.hypot(selectedPiece.centroid.x - event.spawnPoint.x, selectedPiece.centroid.y - event.spawnPoint.y);
  const reason = mode === "nearest-centroid" ? "Nearest projected spawn point to piece centroid" : `Deterministic fallback for ${mode}`;
  return [{ id: `assignment-${event.id}-${selectedPiece.id}`, noteEventId: event.id, midiNote: event.midiNote, pieceId: selectedPiece.id, mappingMode: mode, distance, assignedAt: Date.now(), reason, valid: true }];
}
