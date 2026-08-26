/**
 * Light-trail controller — GPU-accelerated.
 *
 * Previous implementation rebuilt ALL trail geometry every frame using
 * Graphics.clear()/moveTo/lineTo/stroke (CPU tessellation).
 *
 * This version uses GpuRibbon (MeshGeometry triangle-strip) so that:
 *   - CPU only writes a Float32Array position buffer each frame
 *   - GPU rasterises the triangles — zero stroke tessellation
 */

import { Container } from "pixi.js";
import { GpuRibbon } from "./gpu-ribbon";

interface TrailPoint {
  x: number;
  y: number;
  age: number;
}

interface ActiveTrail {
  id: string;
  color: number;
  intensity: number;
  points: TrailPoint[];
  startTimeMs: number;
  width: number;
  glowLayers: number;
}

const MAX_TRAIL_POINTS = 120;
const MAX_RIBBON_POINTS = MAX_TRAIL_POINTS * 8 + 1; // Catmull-Rom subdivisions

export class LightTrailController {
  readonly layer = new Container();

  /** One GPU ribbon for the outer glow, one for the bright core. */
  private readonly glowRibbon: GpuRibbon;
  private readonly coreRibbon: GpuRibbon;

  private trails = new Map<string, ActiveTrail>();
  private paused = false;
  private lifetimeMs = 1400;
  private fadeSpeed = 0.55;

  constructor() {
    this.glowRibbon = new GpuRibbon(MAX_RIBBON_POINTS);
    this.coreRibbon = new GpuRibbon(MAX_RIBBON_POINTS);
    this.layer.addChild(this.glowRibbon.container, this.coreRibbon.container);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  configure(lifetimeMs: number, fadeSpeed: number): void {
    this.lifetimeMs = Math.max(100, lifetimeMs);
    this.fadeSpeed = Math.max(0.1, Math.min(1, fadeSpeed));
  }

  clear(): void {
    this.trails.clear();
    this.glowRibbon.clear();
    this.coreRibbon.clear();
  }

  startTrail(
    id: string,
    color: number,
    intensity: number,
    startPos: { x: number; y: number },
    width = 14,
    glowLayers = 3
  ): void {
    this.trails.set(id, {
      id,
      color,
      intensity,
      points: [{ x: startPos.x, y: startPos.y, age: 0 }],
      startTimeMs: Date.now(),
      width,
      glowLayers
    });
  }

  addPoint(id: string, x: number, y: number): void {
    const trail = this.trails.get(id);
    if (!trail) return;
    trail.points.push({ x, y, age: 0 });
    if (trail.points.length > MAX_TRAIL_POINTS) {
      trail.points.splice(0, trail.points.length - MAX_TRAIL_POINTS);
    }
  }

  endTrail(id: string): void {
    const trail = this.trails.get(id);
    if (trail) {
      for (const p of trail.points) {
        if (p.age === 0) p.age = 1;
      }
    }
  }

  update(deltaMs: number): void {
    if (this.paused) {
      this.glowRibbon.clear();
      this.coreRibbon.clear();
      return;
    }

    const trailsToRemove: string[] = [];

    // Build a combined ribbon from ALL trails
    const glowPoints: Array<{ x: number; y: number }> = [];
    const glowWidths: number[] = [];
    const glowAlphas: number[] = [];
    const corePoints: Array<{ x: number; y: number }> = [];
    const coreWidths: number[] = [];
    const coreAlphas: number[] = [];

    for (const [id, trail] of this.trails) {
      // Age points
      for (const point of trail.points) {
        point.age += deltaMs;
      }
      trail.points = trail.points.filter((p) => p.age < this.lifetimeMs);

      if (trail.points.length < 2) {
        if (trail.points.length === 0 || trail.points[0].age > this.lifetimeMs) {
          trailsToRemove.push(id);
        }
        continue;
      }

      // Catmull-Rom interpolation
      const curvePoints = this.interpolateCatmullRom(trail.points, 8);
      const totalLength = this.calculateTrailLength(curvePoints);

      if (totalLength < 1) continue;

      // === GLOW LAYER ===
      const glowWidth = trail.width * (1 + trail.glowLayers * 1.2);
      let accumulatedGlow = 0;
      for (let i = 0; i < curvePoints.length; i++) {
        const pt = curvePoints[i];
        const ageFade = this.calculateAgeFade(pt.age);
        let positionFade = 1;
        if (i < curvePoints.length) {
          const t = accumulatedGlow / totalLength;
          const fadeZone = 0.12;
          if (t < fadeZone) positionFade *= t / fadeZone;
          if (t > 1 - fadeZone) positionFade *= (1 - t) / fadeZone;
          positionFade = Math.max(0, Math.min(1, positionFade));
        }
        const alpha = trail.intensity * ageFade * positionFade * 0.35;
        const along = i / (curvePoints.length - 1);
        const widthMult = 0.5 + 0.5 * Math.exp(-2 * ((along - 0.5) * 2) ** 2);

        glowPoints.push({ x: pt.x, y: pt.y });
        glowWidths.push(glowWidth * widthMult);
        glowAlphas.push(alpha);

        if (i > 0) accumulatedGlow += Math.hypot(
          pt.x - curvePoints[i - 1].x,
          pt.y - curvePoints[i - 1].y
        );
      }

      // === CORE LAYER ===
      let accumulatedCore = 0;
      for (let i = 0; i < curvePoints.length; i++) {
        const pt = curvePoints[i];
        const ageFade = this.calculateAgeFade(pt.age);
        let positionFade = 1;
        if (i < curvePoints.length) {
          const t = accumulatedCore / totalLength;
          const fadeZone = 0.12;
          if (t < fadeZone) positionFade *= t / fadeZone;
          if (t > 1 - fadeZone) positionFade *= (1 - t) / fadeZone;
          positionFade = Math.max(0, Math.min(1, positionFade));
        }
        const alpha = trail.intensity * ageFade * positionFade * 0.92;
        const along = i / (curvePoints.length - 1);
        const widthMult = 0.5 + 0.5 * Math.exp(-2 * ((along - 0.5) * 2) ** 2);
        const coreWidth = Math.max(1.5, trail.width * 0.2 * widthMult);

        corePoints.push({ x: pt.x, y: pt.y });
        coreWidths.push(coreWidth);
        coreAlphas.push(alpha);

        if (i > 0) accumulatedCore += Math.hypot(
          pt.x - curvePoints[i - 1].x,
          pt.y - curvePoints[i - 1].y
        );
      }
    }

    // Upload to GPU
    if (glowPoints.length >= 2) {
      this.glowRibbon.update(glowPoints, glowWidths, glowAlphas, 0x4488cc, 1);
    } else {
      this.glowRibbon.clear();
    }

    if (corePoints.length >= 2) {
      this.coreRibbon.update(corePoints, coreWidths, coreAlphas, 0xffffff, 1);
    } else {
      this.coreRibbon.clear();
    }

    for (const id of trailsToRemove) {
      this.trails.delete(id);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Catmull-Rom interpolation                                           */
  /* ------------------------------------------------------------------ */

  private interpolateCatmullRom(points: TrailPoint[], subdivisions: number): TrailPoint[] {
    if (points.length < 2) return points;
    const result: TrailPoint[] = [];

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[Math.min(points.length - 1, i + 1)];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      for (let t = 0; t < subdivisions; t++) {
        const frac = t / subdivisions;
        const age = p1.age + (p2.age - p1.age) * frac;
        result.push({
          x: this.catmullRom(p0.x, p1.x, p2.x, p3.x, frac),
          y: this.catmullRom(p0.y, p1.y, p2.y, p3.y, frac),
          age
        });
      }
    }
    result.push(points[points.length - 1]);
    return result;
  }

  private catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (
      2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
  }

  private calculateAgeFade(age: number): number {
    if (age < 80) return age / 80;
    const fadeStart = this.lifetimeMs * this.fadeSpeed;
    if (age > fadeStart) {
      const fade = 1 - (age - fadeStart) / (this.lifetimeMs - fadeStart);
      return fade * fade;
    }
    return 1;
  }

  private calculateTrailLength(points: TrailPoint[]): number {
    let length = 0;
    for (let i = 1; i < points.length; i++) {
      length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    }
    return length;
  }

  dispose(): void {
    this.clear();
    this.layer.destroy({ children: false });
  }
}
