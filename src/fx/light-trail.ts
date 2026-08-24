import { Container, Graphics } from "pixi.js";

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

export class LightTrailController {
  readonly layer = new Container();
  private glowLayer = new Graphics();
  private coreLayer = new Graphics();
  private trails = new Map<string, ActiveTrail>();
  private paused = false;
  private maxTrailPoints = 120;
  private lifetimeMs = 1400;
  private fadeSpeed = 0.55;

  constructor() {
    this.layer.addChild(this.glowLayer, this.coreLayer);
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
    this.glowLayer.clear();
    this.coreLayer.clear();
  }

  startTrail(id: string, color: number, intensity: number, startPos: { x: number; y: number }, width = 14, glowLayers = 3): void {
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

    if (trail.points.length > this.maxTrailPoints) {
      trail.points.splice(0, trail.points.length - this.maxTrailPoints);
    }
  }

  endTrail(id: string): void {
    const trail = this.trails.get(id);
    if (trail) {
      trail.points.forEach(p => {
        if (p.age === 0) p.age = 1;
      });
    }
  }

  update(deltaMs: number): void {
    this.glowLayer.clear();
    this.coreLayer.clear();

    if (this.paused) return;

    const trailsToRemove: string[] = [];

    for (const [id, trail] of this.trails) {
      for (const point of trail.points) {
        point.age += deltaMs;
      }

      trail.points = trail.points.filter(p => p.age < this.lifetimeMs);

      if (trail.points.length < 2) {
        if (trail.points.length === 0 || trail.points[0].age > this.lifetimeMs) {
          trailsToRemove.push(id);
        }
        continue;
      }

      this.drawGlowingTrail(trail);
    }

    for (const id of trailsToRemove) {
      this.trails.delete(id);
    }
  }

  private drawGlowingTrail(trail: ActiveTrail): void {
    const points = trail.points;
    if (points.length < 2) return;

    const totalLength = this.calculateTrailLength(points);
    if (totalLength < 1) return;

    // Draw glow layers (outer to inner)
    for (let layer = trail.glowLayers; layer >= 0; layer--) {
      const layerWidth = trail.width * (1 + layer * 1.2);
      const layerAlpha = trail.intensity * (layer === 0 ? 0.85 : 0.12 / (layer * 0.6));
      this.drawSmoothTrailLayer(trail, layerWidth, layerAlpha, totalLength);
    }

    // Draw bright core
    this.drawSmoothCoreLine(trail, totalLength);
  }

  private drawSmoothTrailLayer(
    trail: ActiveTrail,
    baseWidth: number,
    baseAlpha: number,
    totalLength: number
  ): void {
    const points = trail.points;
    const graphics = this.glowLayer;

    // Interpolate smooth curve using Catmull-Rom
    const curvePoints = this.interpolateCatmullRom(points, 8);

    let accumulatedLength = 0;

    for (let i = 1; i < curvePoints.length; i++) {
      const prev = curvePoints[i - 1];
      const curr = curvePoints[i];

      const segmentLength = Math.hypot(curr.x - prev.x, curr.y - prev.y);
      if (segmentLength < 0.1) continue;

      const startT = accumulatedLength / totalLength;
      const endT = (accumulatedLength + segmentLength) / totalLength;

      const ageFade = this.calculateAgeFade(curr.age);
      const positionFade = this.calculatePositionFade(startT, endT);
      const alpha = baseAlpha * ageFade * positionFade;

      if (alpha < 0.01) {
        accumulatedLength += segmentLength;
        continue;
      }

      const widthMultiplier = this.calculateWidthMultiplier(startT, endT);
      const width = baseWidth * widthMultiplier;

      graphics.moveTo(prev.x, prev.y);
      graphics.lineTo(curr.x, curr.y);
      graphics.stroke({
        color: trail.color,
        width: width,
        alpha: alpha,
        cap: "round" as any,
        join: "round" as any
      });

      accumulatedLength += segmentLength;
    }
  }

  private drawSmoothCoreLine(trail: ActiveTrail, totalLength: number): void {
    const points = trail.points;
    const graphics = this.coreLayer;

    // Interpolate smooth curve
    const curvePoints = this.interpolateCatmullRom(points, 8);

    let accumulatedLength = 0;

    for (let i = 1; i < curvePoints.length; i++) {
      const prev = curvePoints[i - 1];
      const curr = curvePoints[i];

      const segmentLength = Math.hypot(curr.x - prev.x, curr.y - prev.y);
      if (segmentLength < 0.1) continue;

      const startT = accumulatedLength / totalLength;
      const endT = (accumulatedLength + segmentLength) / totalLength;

      const ageFade = this.calculateAgeFade(curr.age);
      const positionFade = this.calculatePositionFade(startT, endT);
      const alpha = trail.intensity * ageFade * positionFade;

      if (alpha < 0.01) {
        accumulatedLength += segmentLength;
        continue;
      }

      const coreWidth = Math.max(1.5, trail.width * 0.2 * this.calculateWidthMultiplier(startT, endT));

      graphics.moveTo(prev.x, prev.y);
      graphics.lineTo(curr.x, curr.y);
      graphics.stroke({
        color: 0xffffff,
        width: coreWidth,
        alpha: alpha * 0.92,
        cap: "round" as any,
        join: "round" as any
      });

      accumulatedLength += segmentLength;
    }
  }

  /**
   * Catmull-Rom spline interpolation for smooth curves
   */
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
          age: age
        });
      }
    }

    // Add the last point
    result.push(points[points.length - 1]);

    return result;
  }

  private catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
    const t2 = t * t;
    const t3 = t2 * t;

    return 0.5 * (
      (2 * p1) +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
  }

  private calculateAgeFade(age: number): number {
    if (age < 80) {
      return age / 80;
    }
    // fadeSpeed controls when the fade begins: 0.1 = fade starts at 10% of lifetime (fast fade),
    // 1.0 = fade starts at 100% (stays bright until nearly gone)
    const fadeStart = this.lifetimeMs * this.fadeSpeed;
    if (age > fadeStart) {
      const fade = 1 - (age - fadeStart) / (this.lifetimeMs - fadeStart);
      return fade * fade; // Smooth quadratic fade
    }
    return 1;
  }

  private calculatePositionFade(startT: number, endT: number): number {
    const fadeZone = 0.12;
    let fade = 1;

    if (startT < fadeZone) {
      fade *= startT / fadeZone;
    }

    if (endT > 1 - fadeZone) {
      fade *= (1 - endT) / fadeZone;
    }

    return Math.max(0, Math.min(1, fade));
  }

  private calculateWidthMultiplier(startT: number, endT: number): number {
    const midT = (startT + endT) / 2;
    const distFromCenter = Math.abs(midT - 0.5) * 2;
    // Smooth bell curve - wider in middle, thinner at ends
    return 0.5 + 0.5 * Math.exp(-2 * distFromCenter * distFromCenter);
  }

  private calculateTrailLength(points: TrailPoint[]): number {
    let length = 0;
    for (let i = 1; i < points.length; i++) {
      length += Math.hypot(
        points[i].x - points[i - 1].x,
        points[i].y - points[i - 1].y
      );
    }
    return length;
  }

  dispose(): void {
    this.clear();
    this.layer.destroy({ children: false });
  }
}
