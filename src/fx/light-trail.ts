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
  private maxTrailPoints = 80;
  private lifetimeMs = 1200;

  constructor() {
    this.layer.addChild(this.glowLayer, this.coreLayer);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  clear(): void {
    this.trails.clear();
    this.glowLayer.clear();
    this.coreLayer.clear();
  }

  startTrail(id: string, color: number, intensity: number, startPos: { x: number; y: number }, width = 12, glowLayers = 3): void {
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

    const { color, intensity, width } = trail;
    const totalLength = this.calculateTrailLength(points);
    if (totalLength < 1) return;

    for (let layer = trail.glowLayers; layer >= 0; layer--) {
      const layerWidth = width * (1 + layer * 0.8);
      const layerAlpha = intensity * (layer === 0 ? 0.9 : 0.15 / (layer * 0.8));
      this.drawTrailLayer(trail, layerWidth, layerAlpha, totalLength);
    }

    this.drawCoreLine(trail, totalLength);
  }

  private drawTrailLayer(
    trail: ActiveTrail,
    baseWidth: number,
    baseAlpha: number,
    totalLength: number
  ): void {
    const points = trail.points;
    const graphics = this.glowLayer;
    let accumulatedLength = 0;

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];

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

  private drawCoreLine(trail: ActiveTrail, totalLength: number): void {
    const points = trail.points;
    const graphics = this.coreLayer;
    let accumulatedLength = 0;

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];

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

      const coreWidth = Math.max(1, trail.width * 0.25 * this.calculateWidthMultiplier(startT, endT));

      graphics.moveTo(prev.x, prev.y);
      graphics.lineTo(curr.x, curr.y);
      graphics.stroke({
        color: 0xffffff,
        width: coreWidth,
        alpha: alpha * 0.95,
        cap: "round" as any,
        join: "round" as any
      });

      accumulatedLength += segmentLength;
    }
  }

  private calculateAgeFade(age: number): number {
    if (age < 100) {
      return age / 100;
    }
    const fadeStart = this.lifetimeMs * 0.6;
    if (age > fadeStart) {
      return 1 - (age - fadeStart) / (this.lifetimeMs - fadeStart);
    }
    return 1;
  }

  private calculatePositionFade(startT: number, endT: number): number {
    const fadeZone = 0.15;
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
    return 0.6 + 0.4 * (1 - distFromCenter * distFromCenter);
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
