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

export type PlacementAlignX = "left" | "center" | "right";
export type PlacementAlignY = "top" | "center" | "bottom";

export interface PianoPlacementConfig {
  alignX: PlacementAlignX;
  alignY: PlacementAlignY;
  zoom: number;
  panX: number;
  panY: number;
}

export const DEFAULT_PIANO_PLACEMENT: PianoPlacementConfig = { alignX: "center", alignY: "bottom", zoom: 1, panX: 0, panY: 0 };

export type ArtworkPlacementConfig = PianoPlacementConfig;
export const DEFAULT_ARTWORK_PLACEMENT: ArtworkPlacementConfig = { alignX: "center", alignY: "center", zoom: 1, panX: 0, panY: 0 };

export function computeAlignedPlacement(sourceWidth: number, sourceHeight: number, region: Bounds, config: PianoPlacementConfig): RegionPlacement {
  if (!sourceWidth || !sourceHeight) return { offsetX: 0, offsetY: 0, scale: 1 };
  const baseScale = Math.min(region.width / sourceWidth, region.height / sourceHeight);
  const scale = baseScale * Math.max(0.1, config.zoom || 1);
  const scaledWidth = sourceWidth * scale, scaledHeight = sourceHeight * scale;
  const offsetX = (config.alignX === "left" ? 0 : config.alignX === "right" ? region.width - scaledWidth : (region.width - scaledWidth) / 2) + config.panX;
  const offsetY = (config.alignY === "top" ? 0 : config.alignY === "bottom" ? region.height - scaledHeight : (region.height - scaledHeight) / 2) + config.panY;
  return { offsetX, offsetY, scale };
}

export function drawPlacementPreview(canvas: HTMLCanvasElement, source: HTMLImageElement, region: Bounds, config: PianoPlacementConfig): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const canvasScale = Math.min(canvas.width / region.width, canvas.height / region.height);
  const boxX = (canvas.width - region.width * canvasScale) / 2, boxY = (canvas.height - region.height * canvasScale) / 2;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#10152b"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const placement = computeAlignedPlacement(source.naturalWidth, source.naturalHeight, region, config);
  ctx.save();
  ctx.beginPath();
  ctx.rect(boxX, boxY, region.width * canvasScale, region.height * canvasScale);
  ctx.clip();
  ctx.drawImage(source, boxX + placement.offsetX * canvasScale, boxY + placement.offsetY * canvasScale, source.naturalWidth * placement.scale * canvasScale, source.naturalHeight * placement.scale * canvasScale);
  ctx.restore();
  ctx.strokeStyle = "rgba(85,217,255,0.85)"; ctx.lineWidth = 1.5;
  ctx.strokeRect(boxX, boxY, region.width * canvasScale, region.height * canvasScale);
}
