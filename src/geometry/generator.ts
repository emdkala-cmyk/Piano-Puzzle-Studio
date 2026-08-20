import type { Bounds, GeometryMode, GeometryPiece, GeometryResult, ImportanceMap, Point } from "./models";
import { buildImportanceMap, importanceAt } from "./importance";

const polygonArea = (p: Point[]) => Math.abs(p.reduce((sum, point, i) => { const next = p[(i + 1) % p.length]; return sum + point.x * next.y - next.x * point.y; }, 0) / 2);
const centroid = (p: Point[]): Point => ({ x: p.reduce((s, v) => s + v.x, 0) / p.length, y: p.reduce((s, v) => s + v.y, 0) / p.length });
const bounds = (p: Point[]): Bounds => { const xs = p.map(v => v.x), ys = p.map(v => v.y); return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }; };
const clip = (polygon: Point[], axis: "x" | "y", value: number, keepGreater: boolean) => {
  const result: Point[] = []; const inside = (p: Point) => keepGreater ? p[axis] >= value : p[axis] <= value;
  for (let i = 0; i < polygon.length; i += 1) { const a = polygon[i], b = polygon[(i + 1) % polygon.length]; const ai = inside(a), bi = inside(b);
    if (ai) result.push(a);
    if (ai !== bi) { const t = (value - a[axis]) / (b[axis] - a[axis]); result.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); }
  } return result;
};
function gridPolygons(width: number, height: number, columns: number, rows: number): Point[][] {
  const pieces: Point[][] = []; for (let y = 0; y < rows; y += 1) for (let x = 0; x < columns; x += 1) {
    const x0 = width * x / columns, x1 = width * (x + 1) / columns, y0 = height * y / rows, y1 = height * (y + 1) / rows;
    pieces.push([{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]);
  } return pieces;
}
function voronoiPolygons(width: number, height: number, columns: number, rows: number): Point[][] {
  const cells: Point[][] = []; const points = gridPolygons(width, height, columns, rows).map(centroid);
  points.forEach((site, index) => { let poly: Point[] = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
    points.forEach((other, j) => { if (j === index) return; const nx = other.x - site.x, ny = other.y - site.y; const mid = { x: (site.x + other.x) / 2, y: (site.y + other.y) / 2 }; if (Math.abs(nx) > Math.abs(ny)) poly = clip(poly, "x", mid.x, nx > 0); else poly = clip(poly, "y", mid.y, ny > 0); }); if (poly.length >= 3) cells.push(poly);
  }); return cells;
}
function makePiece(poly: Point[], index: number, width: number, height: number, map: ImportanceMap): GeometryPiece {
  const c = centroid(poly); const b = bounds(poly); const priority = importanceAt(map, c, width, height);
  return { id: `piece-${index + 1}`, polygon: poly, centroid: c, bounds: b, area: polygonArea(poly), textureRegion: { x: b.x, y: b.y, width: b.width, height: b.height, u0: b.x / width, v0: b.y / height, u1: (b.x + b.width) / width, v1: (b.y + b.height) / height }, priority, layer: priority > 0.66 ? 2 : priority > 0.4 ? 1 : 0, targetPosition: c };
}
export function generateGeometry(source: HTMLImageElement, mode: GeometryMode, density = 8): GeometryResult {
  const width = source.naturalWidth, height = source.naturalHeight, map = buildImportanceMap(source);
  const columns = Math.max(2, density), rows = Math.max(2, Math.round(density * height / width));
  let polygons = mode === "voronoi" ? voronoiPolygons(width, height, columns, rows) : mode === "delaunay" ? gridPolygons(width, height, columns, rows).flatMap((p) => [[p[0], p[1], p[2]], [p[0], p[2], p[3]]]) : gridPolygons(width, height, columns, rows);
  if (mode === "hybrid") {
    polygons = gridPolygons(width, height, columns, rows).flatMap((p) => {
      if (importanceAt(map, centroid(p), width, height) <= map.average + 0.12) return [p];
      const c = centroid(p);
      const top = { x: (p[0].x + p[1].x) / 2, y: p[0].y };
      const right = { x: p[1].x, y: (p[1].y + p[2].y) / 2 };
      const bottom = { x: (p[2].x + p[3].x) / 2, y: p[2].y };
      const left = { x: p[0].x, y: (p[0].y + p[3].y) / 2 };
      return [[p[0], top, c, left], [top, p[1], right, c], [c, right, p[2], bottom], [left, c, bottom, p[3]]];
    });
  }
  return { mode, width, height, pieces: polygons.map((p, i) => makePiece(p, i, width, height, map)), importanceMap: map };
}
