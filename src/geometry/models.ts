export type GeometryMode = "grid" | "voronoi" | "delaunay" | "hybrid";
export interface Point { x: number; y: number }
export interface Bounds { x: number; y: number; width: number; height: number }
export interface TextureRegion { x: number; y: number; width: number; height: number; u0: number; v0: number; u1: number; v1: number }
export interface GeometryPiece {
  id: string; polygon: Point[]; centroid: Point; bounds: Bounds; area: number;
  textureRegion: TextureRegion; priority: number; layer: number; targetPosition: Point;
}
export interface ImportanceMap { width: number; height: number; values: number[]; average: number }
export interface GeometryResult { mode: GeometryMode; width: number; height: number; pieces: GeometryPiece[]; importanceMap: ImportanceMap }
