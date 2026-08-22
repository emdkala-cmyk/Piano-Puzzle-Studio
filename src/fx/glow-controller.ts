import { Container, Sprite, Texture } from "pixi.js";
import type { Point } from "../geometry/models";
import { clamp, smoothstep } from "./fx-types";
import type { FxAssetPipeline } from "./asset-pipeline";

interface GlowState {
  active: boolean;
  x: number;
  y: number;
  color: number;
  age: number;
  lifetime: number;
  alpha: number;
  radius: number;
  rotation: number;
  spin: number;
}

interface GlowSlot {
  state: GlowState;
  visual: Sprite;
}

const MAX_GLOWS = 96;

/**
 * Sprite-based glow pool. Glow is deliberately kept separate from the
 * particle pool so note hits cannot evict smoke or trail slots.
 */
export class GlowController {
  readonly layer = new Container();
  private readonly slots: GlowSlot[] = [];
  private texturePipeline: FxAssetPipeline | undefined;
  private activeGlows = 0;
  private nextSlotIndex = 0;

  constructor(maxGlows = MAX_GLOWS) {
    const capacity = Math.max(1, Math.min(MAX_GLOWS, Math.floor(maxGlows)));
    for (let index = 0; index < capacity; index += 1) {
      const visual = new Sprite(Texture.WHITE);
      visual.anchor.set(0.5);
      visual.visible = false;
      visual.blendMode = "screen";
      this.layer.addChild(visual);
      this.slots.push({
        visual,
        state: {
          active: false,
          x: 0,
          y: 0,
          color: 0xffffff,
          age: 0,
          lifetime: 0,
          alpha: 0,
          radius: 1,
          rotation: 0,
          spin: 0
        }
      });
    }
  }

  setTexturePipeline(pipeline: FxAssetPipeline): void {
    this.texturePipeline = pipeline;
  }

  add(position: Point, color: number, intensity: number, durationMs: number, radius = 24): void {
    let slot: GlowSlot | undefined;
    for (let offset = 0; offset < this.slots.length; offset += 1) {
      const index = (this.nextSlotIndex + offset) % this.slots.length;
      if (!this.slots[index].state.active) {
        slot = this.slots[index];
        this.nextSlotIndex = (index + 1) % this.slots.length;
        break;
      }
    }
    if (!slot) return;

    const state = slot.state;
    state.active = true;
    state.x = position.x;
    state.y = position.y;
    state.color = color;
    state.age = 0;
    state.lifetime = Math.max(40, durationMs);
    state.alpha = clamp(intensity);
    state.radius = Math.max(4, radius);
    state.rotation = 0;
    state.spin = (state.x * 0.002 + state.y * 0.001) % 0.8 - 0.4;

    slot.visual.texture = this.texturePipeline?.getTexture("soft-bokeh") ?? Texture.WHITE;
    slot.visual.position.set(state.x, state.y);
    slot.visual.tint = state.color;
    slot.visual.alpha = state.alpha * 0.55;
    slot.visual.visible = true;
    this.activeGlows += 1;
  }

  update(deltaMs: number): void {
    for (const slot of this.slots) {
      const state = slot.state;
      if (!state.active) continue;
      state.age += Math.max(0, deltaMs);
      if (state.age >= state.lifetime) {
        this.release(slot);
        continue;
      }
      const progress = state.age / state.lifetime;
      const fade = Math.pow(1 - smoothstep(0, 1, progress), 1.08);
      const breathing = 1 + Math.sin(progress * Math.PI * 2 + state.x * 0.01) * 0.08;
      const radius = state.radius * (0.72 + progress * 0.5) * breathing;
      const textureExtent = Math.max(1, slot.visual.texture.width, slot.visual.texture.height);
      const scale = radius * 2 / textureExtent;
      state.rotation += state.spin * Math.min(0.05, deltaMs / 1000);
      slot.visual.position.set(state.x, state.y);
      slot.visual.scale.set(scale, scale);
      slot.visual.rotation = state.rotation;
      slot.visual.tint = state.color;
      slot.visual.alpha = state.alpha * fade * 0.62;
    }
  }

  clear(): void {
    for (const slot of this.slots) {
      slot.state.active = false;
      slot.state.age = 0;
      slot.state.alpha = 0;
      slot.visual.visible = false;
      slot.visual.alpha = 0;
    }
    this.activeGlows = 0;
    this.nextSlotIndex = 0;
  }

  get activeCount(): number {
    return this.activeGlows;
  }

  dispose(): void {
    this.clear();
    this.layer.destroy({ children: true });
  }

  private release(slot: GlowSlot): void {
    const state = slot.state;
    if (!state.active) return;
    state.active = false;
    state.age = 0;
    state.alpha = 0;
    slot.visual.visible = false;
    slot.visual.alpha = 0;
    this.activeGlows = Math.max(0, this.activeGlows - 1);
  }
}
