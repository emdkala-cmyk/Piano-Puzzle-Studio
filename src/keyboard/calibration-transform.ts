import type { Point, Transform } from "./models";
export const identityTransform = (): Transform => ({
  translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0, perspective: 0,
  topLeft: { x: 0, y: 0 }, topRight: { x: 1, y: 0 }, bottomLeft: { x: 0, y: 1 }, bottomRight: { x: 1, y: 1 }
});
export function applyTransform(point: Point, transform: Transform, width: number, height: number): Point {
  const x = point.x * width, y = point.y * height;
  const sx = x * transform.scaleX, sy = y * transform.scaleY;
  const skewed = { x: sx + Math.tan(transform.skewX) * sy, y: sy + Math.tan(transform.skewY) * sx };
  const c = Math.cos(transform.rotation), s = Math.sin(transform.rotation);
  return { x: (skewed.x * c - skewed.y * s) + transform.translateX, y: (skewed.x * s + skewed.y * c) + transform.translateY };
}
