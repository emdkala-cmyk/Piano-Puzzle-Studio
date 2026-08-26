/**
 * Ribbon / trail renderer using PixiJS Graphics.
 *
 * Simple and reliable — no custom GLSL shader needed.
 * CPU tessellates the triangle-strip each frame using Graphics.drawPolygon().
 * This is the "just works" fallback after the GPU shader approach broke on PixiJS v8.
 */

import { Container, Graphics, type PointData } from "pixi.js";

/* ------------------------------------------------------------------ */
/* GpuRibbon (Graphics-based)                                         */
/* ------------------------------------------------------------------ */

export class GpuRibbon {
  readonly container = new Container();

  private readonly gfx: Graphics;

  /** Pre-allocated: maxPoints × 2 vertices × 2 floats (x, y) */
  private readonly posData: Float32Array;
  private readonly maxPoints: number;
  private active = false;

  constructor(maxPoints: number) {
    this.maxPoints = maxPoints;
    const vertCount = maxPoints * 2;
    this.posData = new Float32Array(vertCount * 2);
    this.gfx = new Graphics();
    this.container.addChild(this.gfx);
    this.gfx.visible = false;
  }

  /**
   * Rebuild the ribbon for this frame.
   *
   * @param points  Centre-line points (at least 2).
   * @param widths  Half-width at each point.
   * @param alphas  Opacity at each point (0–1).
   * @param color   Tint colour (hex, e.g. 0x4499ff).
   * @param tintAlpha  Overall tint alpha multiplier (0–1).
   */
  update(
    points: PointData[],
    widths: number[],
    alphas: number[],
    color: number,
    tintAlpha = 1
  ): void {
    const n = Math.min(points.length, this.maxPoints);
    if (n < 2) {
      if (this.active) {
        this.gfx.visible = false;
        this.active = false;
      }
      return;
    }

    this.active = true;
    this.gfx.visible = true;

    const g = this.gfx;
    g.clear();

    // Convert hex color to components
    const r = (color >> 16) & 0xff;
    const gv = (color >> 8) & 0xff;
    const b = color & 0xff;
    const alpha = Math.max(0, Math.min(1, tintAlpha));

    // Build left/right vertices
    const pos = this.posData;
    for (let i = 0; i < n; i++) {
      const p = points[i];
      const hw = widths[i] ?? 4;

      // Perpendicular offset
      let perpX = 0;
      let perpY = 0;
      if (i < n - 1) {
        const dx = points[i + 1].x - p.x;
        const dy = points[i + 1].y - p.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        perpX = (-dy / len) * hw;
        perpY = (dx / len) * hw;
      } else if (i > 0) {
        const dx = p.x - points[i - 1].x;
        const dy = p.y - points[i - 1].y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        perpX = (-dy / len) * hw;
        perpY = (dx / len) * hw;
      }

      const vi = i * 4;
      // Left vertex
      pos[vi + 0] = p.x + perpX;
      pos[vi + 1] = p.y + perpY;
      // Right vertex
      pos[vi + 2] = p.x - perpX;
      pos[vi + 3] = p.y - perpY;
    }

    // Draw triangle-strip as individual quads (each quad = 2 triangles)
    for (let i = 0; i < n - 1; i++) {
      const vi = i * 4;
      const a = Math.max(0, Math.min(1, alphas[i] ?? 0));
      const aNext = Math.max(0, Math.min(1, alphas[i + 1] ?? 0));

      const finalAlpha = alpha * Math.max(a, aNext);
      if (finalAlpha < 0.01) continue;

      // Quad: left[i], right[i], right[i+1], left[i+1]
      const poly = [
        pos[vi + 0], pos[vi + 1],     // left[i]
        pos[vi + 2], pos[vi + 3],     // right[i]
        pos[vi + 6], pos[vi + 7],     // right[i+1]
        pos[vi + 4], pos[vi + 5],     // left[i+1]
      ];

      g.poly(poly);
      g.fill({ color, alpha: finalAlpha });
    }
  }

  clear(): void {
    this.active = false;
    this.gfx.visible = false;
    this.gfx.clear();
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
