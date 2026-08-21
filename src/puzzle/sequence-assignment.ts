import type { GeometryPiece } from "../geometry/models";

export interface SequenceCursor {
  order: GeometryPiece[];
}

export function createSequenceCursor(pieces: GeometryPiece[]): SequenceCursor {
  return { order: [...pieces].sort((a, b) => a.id.localeCompare(b.id)) };
}

export function selectSequentialPiece(cursor: SequenceCursor, usedPieceIds: Set<string>, cycle: boolean): GeometryPiece | undefined {
  if (!cursor.order.length) return undefined;
  const next = cursor.order.find((piece) => !usedPieceIds.has(piece.id));
  if (next) return next;
  if (cycle) { usedPieceIds.clear(); return cursor.order[0]; }
  return cursor.order[cursor.order.length - 1];
}
