import type { GeometryPiece, Point } from "../geometry/models";
export function selectNearestPiece(point: Point, pieces: GeometryPiece[]): { piece: GeometryPiece; distance: number } | undefined {
  if (!pieces.length) return undefined;
  return pieces.map((piece) => ({ piece, distance: Math.hypot(piece.centroid.x - point.x, piece.centroid.y - point.y) })).sort((a, b) => a.distance - b.distance || b.piece.priority - a.piece.priority || a.piece.layer - b.piece.layer || a.piece.id.localeCompare(b.piece.id))[0];
}
