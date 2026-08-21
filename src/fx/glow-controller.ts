import { Container, Graphics } from "pixi.js";
import type { Point } from "../geometry/models";
import { clamp, smoothstep, type VisualFxConfig } from "./fx-types";

interface GlowState {
  position: Point;
  color: number;
  age: number;
  lifetime: number;
  alpha: number;
  radius: number;
}

export class GlowController {
  readonly layer = new Container();
  private readonly glows: GlowState[] = [];

  add(position: Point, color: number, intensity: number, durationMs: number, radius = 24): void {
    this.glows.push({
      position: { ...position },
      color,
      age: 0,
      lifetime: Math.max(40, durationMs),
      alpha: clamp(intensity),
      radius
    });
  }

  update(deltaMs: number): void {
    for (let i = this.glows.length - 1; i >= 0; i -= 1) {
      const glow = this.glows[i];
      glow.age += deltaMs;
      if (glow.age >= glow.lifetime) {
        this.glows.splice(i, 1);
        continue;
      }
      const fade = 1 - smoothstep(0, glow.lifetime, glow.age);
      const graphic = this.layer.children[i] as Graphics | undefined;
      if (graphic) {
        graphic.clear().circle(glow.position.x, glow.position.y, glow.radius * (1 + glow.age / glow.lifetime * 0.35)).fill({ color: glow.color, alpha: glow.alpha * fade * 0.45 });
      } else {
        this.layer.addChild(new Graphics().circle(glow.position.x, glow.position.y, glow.radius).fill({ color: glow.color, alpha: glow.alpha * fade * 0.45 }));
      }
    }
    while (this.layer.children.length > this.glows.length) this.layer.removeChildAt(this.layer.children.length - 1);
  }

  clear(): void {
    this.glows.length = 0;
    this.layer.removeChildren();
  }

  get activeCount(): number {
    return this.glows.length;
  }

  dispose(): void {
    this.clear();
    this.layer.destroy({ children: true });
  }
}
