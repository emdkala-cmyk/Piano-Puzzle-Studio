import type { Bounds, GeometryResult, Point } from "../geometry/models";
import type { MappedNoteEvent } from "../midi/event-models";

export interface RegionPlacement {
  offsetX: number;
  offsetY: number;
  scale: number;
}

export function computeRegionPlacement(sourceWidth: number, sourceHeight: number, region: Bounds): RegionPlacement {
  if (!sourceWidth || !sourceHeight) return { offsetX: 0, offsetY: 0, scale: 1 };
  const scale = Math.min(region.width / sourceWidth, region.height / sourceHeight);
  const offsetX = (region.width - sourceWidth * scale) / 2;
  const offsetY = (region.height - sourceHeight * scale) / 2;
  return { offsetX, offsetY, scale };
}

export function projectPoint(point: Point, region: Bounds, placement: RegionPlacement): Point {
  return { x: region.x + placement.offsetX + point.x * placement.scale, y: region.y + placement.offsetY + point.y * placement.scale };
}

function projectBounds(bounds: Bounds, region: Bounds, placement: RegionPlacement): Bounds {
  const topLeft = projectPoint({ x: bounds.x, y: bounds.y }, region, placement);
  return { x: topLeft.x, y: topLeft.y, width: bounds.width * placement.scale, height: bounds.height * placement.scale };
}

export function projectGeometry(geometry: GeometryResult, region: Bounds, placement: RegionPlacement): GeometryResult {
  return {
    ...geometry,
    pieces: geometry.pieces.map((piece) => ({
      ...piece,
      polygon: piece.polygon.map((p) => projectPoint(p, region, placement)),
      centroid: projectPoint(piece.centroid, region, placement),
      bounds: projectBounds(piece.bounds, region, placement),
      targetPosition: projectPoint(piece.targetPosition, region, placement)
    }))
  };
}

export function projectSpawnPoints(events: MappedNoteEvent[], region: Bounds, placement: RegionPlacement): MappedNoteEvent[] {
  return events.map((event) => (event.spawnPoint ? { ...event, spawnPoint: projectPoint(event.spawnPoint, region, placement) } : event));
}

export function toAbsolutePlacement(region: Bounds, placement: RegionPlacement): RegionPlacement {
  return { offsetX: region.x + placement.offsetX, offsetY: region.y + placement.offsetY, scale: placement.scale };
}
