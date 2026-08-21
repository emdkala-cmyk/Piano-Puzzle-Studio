import { Container, Graphics } from "pixi.js";
import type { Point } from "../geometry/models";
import { clamp, smoothstep } from "./fx-types";

interface ImpactState {
  position: Point;
  color: number;
  age: number;
  lifetime: number;
  intensity: number;
}

export class ImpactEffect {
  readonly layer = new Container();
  private readonly impacts: ImpactState[] = [];

  add(position: Point, color: number, intensity: number): void {
    this.impacts.push({ position: { ...position }, color, age: 0, lifetime: 220, intensity: clamp(intensity) });
  }

  update(deltaMs: number): void {
    for (let i = this.impacts.length - 1; i >= 0; i -= 1) {
      const impact = this.impacts[i];
      impact.age += deltaMs;
      if (impact.age >= impact.lifetime) {
        this.impacts.splice(i, 1);
        continue;
      }
      const progress = impact.age / impact.lifetime;
      const alpha = impact.intensity * (1 - smoothstep(0, 1, progress));
      const radius = 8 + progress * 26;
      const graphic = this.layer.children[i] as Graphics | undefined;
      if (graphic) graphic.clear().circle(impact.position.x, impact.position.y, radius).stroke({ color: impact.color, width: 1.5, alpha });
      else this.layer.addChild(new Graphics().circle(impact.position.x, impact.position.y, radius).stroke({ color: impact.color, width: 1.5, alpha }));
    }
    while (this.layer.children.length > this.impacts.length) this.layer.removeChildAt(this.layer.children.length - 1);
  }

  clear(): void {
    this.impacts.length = 0;
    this.layer.removeChildren();
  }

  get activeCount(): number {
    return this.impacts.length;
  }

  dispose(): void {
    this.clear();
    this.layer.destroy({ children: true });
  }
}
