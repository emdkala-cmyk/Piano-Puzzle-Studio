/**
 * Ribbon / trail renderer using PixiJS Graphics — multi-layer glow.
 *
 * Instead of a single sharp polygon, draws 4 concentric layers:
 *   1. Outer haze (3× width, very faint)
 *   2. Soft glow (2× width, semi-transparent)
 *   3. Body (1× width, moderate alpha)
 *   4. Bright core (0.3× width, intense)
 *
 * This creates a soft, cotton-like light trail instead of a sharp line.
 */

import { Container, Graphics, type PointData } from "pixi.js";

/** Glow layer definition: [widthMultiplier, alphaMultiplier] */
const GLOW_LAYERS: [number, number][] = [
  [3.0, 0.06],   // outer haze — very wide, very faint
  [2.0, 0.15],   // soft glow — wide, semi-transparent
  [1.0, 0.45],   // body — normal width, visible
  [0.3, 0.75],   // bright core — thin, intense
];

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
   * Rebuild the ribbon for this frame — multi-layer glow.
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

    const alpha = Math.max(0, Math.min(1, tintAlpha));

    // Build left/right vertices for each glow layer width
    const pos = this.posData;

    // Compute perpendiculars once (they're the same for all layers)
    const perpXArr = new Float32Array(n);
    const perpYArr = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = points[i];
      let px = 0, py = 0;
      if (i < n - 1) {
        const dx = points[i + 1].x - p.x;
        const dy = points[i + 1].y - p.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        px = -dy / len;
        py = dx / len;
      } else if (i > 0) {
        const dx = p.x - points[i - 1].x;
        const dy = p.y - points[i - 1].y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        px = -dy / len;
        py = dx / len;
      }
      perpXArr[i] = px;
      perpYArr[i] = py;
    }

    // Draw each glow layer
    for (const [widthMult, alphaMult] of GLOW_LAYERS) {
      // Compute vertices for this width multiplier
      for (let i = 0; i < n; i++) {
        const p = points[i];
        const hw = (widths[i] ?? 4) * widthMult;
        const vi = i * 4;
        pos[vi + 0] = p.x + perpXArr[i] * hw;  // left x
        pos[vi + 1] = p.y + perpYArr[i] * hw;  // left y
        pos[vi + 2] = p.x - perpXArr[i] * hw;  // right x
        pos[vi + 3] = p.y - perpYArr[i] * hw;  // right y
      }

      // Draw triangle-strip as quads
      for (let i = 0; i < n - 1; i++) {
        const vi = i * 4;
        const a = Math.max(0, Math.min(1, alphas[i] ?? 0));
        const aNext = Math.max(0, Math.min(1, alphas[i + 1] ?? 0));
        const finalAlpha = alpha * alphaMult * Math.max(a, aNext);
        if (finalAlpha < 0.005) continue;

        g.poly([
          pos[vi + 0], pos[vi + 1],
          pos[vi + 2], pos[vi + 3],
          pos[vi + 6], pos[vi + 7],
          pos[vi + 4], pos[vi + 5],
        ]);
        g.fill({ color, alpha: finalAlpha });
      }
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
