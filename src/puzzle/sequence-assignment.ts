import type { GeometryPiece } from "../geometry/models";

export interface SequenceCursor {
  order: GeometryPiece[];
}

export function createSequenceCursor(pieces: GeometryPiece[]): SequenceCursor {
  return { order: [...pieces].sort((a, b) => a.id.localeCompare(b.id)) };
}

/**
 * Distributes all pieces in `cursor` across `remainingEvents` note events so that every piece is
 * revealed by exactly the last event, regardless of how piece count compares to note count: each
 * call reveals ceil(remainingPieces / remainingEvents) new pieces (a running-deficit split), so a
 * surplus of pieces bursts a few per note instead of running out of notes before all pieces show,
 * and a surplus of notes leaves later notes with nothing new to reveal (falling back to `cycle`).
 */
export function selectSequentialPieces(cursor: SequenceCursor, usedPieceIds: Set<string>, remainingEvents: number, cycle: boolean): GeometryPiece[] {
  if (!cursor.order.length || remainingEvents <= 0) return [];
  const remainingPieces = cursor.order.length - usedPieceIds.size;
  if (remainingPieces <= 0) {
    if (!cycle) return [];
    usedPieceIds.clear();
  }
  const target = Math.max(1, Math.ceil((cursor.order.length - usedPieceIds.size) / remainingEvents));
  const revealed: GeometryPiece[] = [];
  for (const piece of cursor.order) {
    if (revealed.length >= target) break;
    if (!usedPieceIds.has(piece.id)) { usedPieceIds.add(piece.id); revealed.push(piece); }
  }
  return revealed;
}
