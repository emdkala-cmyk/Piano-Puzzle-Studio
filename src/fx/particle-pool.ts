import { Particle, ParticleContainer, Texture } from "pixi.js";
import { MAX_ACTIVE_PARTICLES } from "./fx-types";
import type { Point } from "../geometry/models";

export interface ParticleState {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  lifetime: number;
  alpha: number;
  scale: number;
  color: number;
}

interface ParticleSlot {
  state: ParticleState;
  visual: Particle;
}

export class ParticlePool {
  readonly layer: ParticleContainer<Particle>;
  private readonly slots: ParticleSlot[] = [];
  private readonly maxParticles: number;
  private droppedParticles = 0;

  constructor(maxParticles = MAX_ACTIVE_PARTICLES) {
    this.maxParticles = Math.max(1, Math.min(MAX_ACTIVE_PARTICLES, Math.floor(maxParticles)));
    this.layer = new ParticleContainer({ dynamicProperties: { position: true, rotation: true, color: true } });
    const texture = Texture.WHITE;
    for (let i = 0; i < this.maxParticles; i += 1) {
      const visual = new Particle({ texture, anchorX: 0.5, anchorY: 0.5, alpha: 0 });
      this.slots.push({
        visual,
        state: { active: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, lifetime: 0, alpha: 0, scale: 1, color: 0xffffff }
      });
    }
  }

  acquire(position: Point, velocity: Point, lifetime: number, color: number, scale: number): ParticleState | undefined {
    const slot = this.slots.find((candidate) => !candidate.state.active);
    if (!slot) {
      this.droppedParticles += 1;
      return undefined;
    }
    const state = slot.state;
    Object.assign(state, { active: true, x: position.x, y: position.y, vx: velocity.x, vy: velocity.y, age: 0, lifetime, alpha: 1, scale, color });
    Object.assign(slot.visual, { x: state.x, y: state.y, scaleX: scale, scaleY: scale, color, alpha: 1 });
    this.layer.addParticle(slot.visual);
    return state;
  }

  update(deltaSeconds: number): void {
    for (const slot of this.slots) {
      const state = slot.state;
      if (!state.active) continue;
      state.age += deltaSeconds * 1000;
      if (state.age >= state.lifetime) {
        state.active = false;
        slot.visual.alpha = 0;
        this.layer.removeParticle(slot.visual);
        continue;
      }
      state.x += state.vx * deltaSeconds;
      state.y += state.vy * deltaSeconds;
      state.vx *= 0.985;
      state.vy *= 0.985;
      state.alpha = 1 - state.age / state.lifetime;
      state.scale *= 0.995;
      slot.visual.x = state.x;
      slot.visual.y = state.y;
      slot.visual.alpha = state.alpha;
      slot.visual.scaleX = state.scale;
      slot.visual.scaleY = state.scale;
      slot.visual.color = state.color;
    }
  }

  clear(): void {
    for (const slot of this.slots) {
      slot.state.active = false;
      slot.visual.alpha = 0;
    }
    this.layer.removeParticles();
    this.droppedParticles = 0;
  }

  get activeCount(): number {
    return this.slots.reduce((count, slot) => count + (slot.state.active ? 1 : 0), 0);
  }

  get droppedCount(): number {
    return this.droppedParticles;
  }

  dispose(): void {
    this.clear();
    this.layer.destroy();
  }
}
