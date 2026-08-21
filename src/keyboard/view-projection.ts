import type { Calibration, Point } from "./models";

export interface ViewProjection { scale: number; offsetX: number; offsetY: number }

export function computeViewProjection(calibration: Calibration, viewWidth: number, viewHeight: number): ViewProjection {
  const scale = Math.min(viewWidth / calibration.sourceWidth, viewHeight / calibration.sourceHeight);
  return { scale, offsetX: (viewWidth - calibration.sourceWidth * scale) / 2, offsetY: (viewHeight - calibration.sourceHeight * scale) / 2 };
}
export function toViewPoint(point: Point, projection: ViewProjection): Point {
  return { x: projection.offsetX + point.x * projection.scale, y: projection.offsetY + point.y * projection.scale };
}
export function toSourcePoint(point: Point, projection: ViewProjection): Point {
  return { x: (point.x - projection.offsetX) / projection.scale, y: (point.y - projection.offsetY) / projection.scale };
}
