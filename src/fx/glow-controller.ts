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
  innerAlpha: number;
}

interface GlowSlot {
  state: GlowState;
  visual: Sprite;
  inner: Sprite;
}

const MAX_GLOWS = 200;

/**
 * Triple-layer cinematic glow pool: a massive soft outer halo + mid glow + a bright core.
 * Produces the diffused, atmospheric light quality seen in After Effects
 * Optical Flares / Deep Glow plugins.
 */
export class GlowController {
  readonly layer = new Container();
  private readonly innerLayer = new Container();
  private readonly slots: GlowSlot[] = [];
  private texturePipeline: FxAssetPipeline | undefined;
  private activeGlows = 0;
  private nextSlotIndex = 0;

  constructor(maxGlows = MAX_GLOWS) {
    const capacity = Math.max(1, Math.min(MAX_GLOWS, Math.floor(maxGlows)));
    this.layer.addChild(this.innerLayer);
    for (let index = 0; index < capacity; index += 1) {
      const visual = new Sprite(Texture.WHITE);
      visual.anchor.set(0.5);
      visual.visible = false;
      visual.blendMode = "screen";
      this.layer.addChild(visual);

      const inner = new Sprite(Texture.WHITE);
      inner.anchor.set(0.5);
      inner.visible = false;
      inner.blendMode = "add";
      this.innerLayer.addChild(inner);

      this.slots.push({
        visual,
        inner,
        state: {
          active: false,
          x: 0, y: 0,
          color: 0xffffff,
          age: 0, lifetime: 0,
          alpha: 0, radius: 1,
          rotation: 0, spin: 0,
          innerAlpha: 1
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
    state.lifetime = Math.max(120, durationMs * 1.6);
    state.alpha = clamp(intensity * 1.0);
    state.radius = Math.max(20, radius * 6.5); // Much larger glow radius
    state.innerAlpha = clamp(intensity * 1.4);
    state.rotation = 0;
    state.spin = (state.x * 0.0015 + state.y * 0.001) % 0.5 - 0.25;

    // Outer soft halo
    slot.visual.texture = this.texturePipeline?.getTexture("soft-bokeh") ?? Texture.WHITE;
    slot.visual.position.set(state.x, state.y);
    slot.visual.tint = state.color;
    slot.visual.alpha = state.alpha * 0.6;
    slot.visual.visible = true;

    // Inner bright core
    slot.inner.texture = this.texturePipeline?.getTexture("soft-bokeh") ?? Texture.WHITE;
    slot.inner.position.set(state.x, state.y);
    slot.inner.tint = 0xffffff;
    slot.inner.alpha = state.innerAlpha * 0.85;
    slot.inner.visible = true;

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

      // Slow, dreamy fade curve - stays bright longer
      const fade = Math.pow(1 - smoothstep(0, 1, progress), 0.38);

      // Organic breathing with multiple harmonics
      const breathing =
        1
        + Math.sin(progress * Math.PI * 4.2 + state.x * 0.022) * 0.25
        + Math.sin(progress * Math.PI * 1.4 + state.y * 0.016) * 0.15
        + Math.sin(progress * Math.PI * 8.5) * 0.08;

      // Expand: starts small, blooms outward, then gently shrinks
      const expand = 0.25 + Math.sin(progress * Math.PI) * 1.1 + progress * 0.55;
      const outerRadius = state.radius * expand * breathing;
      const textureExtent = Math.max(1, slot.visual.texture.width, slot.visual.texture.height);
      const outerScale = outerRadius * 2 / textureExtent;

      // Inner core: stays small and bright, fades later
      const innerProgress = Math.max(0, (progress - 0.15) / 0.85);
      const innerFade = Math.pow(1 - smoothstep(0, 1, innerProgress), 0.3);
      const innerRadius = state.radius * 0.18 * (1 + Math.sin(progress * Math.PI * 5) * 0.2);
      const innerScale = innerRadius * 2 / textureExtent;

      state.rotation += state.spin * Math.min(0.035, deltaMs / 1000);

      // Outer halo - bigger, brighter
      slot.visual.position.set(state.x, state.y);
      slot.visual.scale.set(outerScale, outerScale);
      slot.visual.rotation = state.rotation;
      slot.visual.tint = state.color;
      slot.visual.alpha = state.alpha * fade * 0.55;

      // Inner bright core - much brighter
      slot.inner.position.set(state.x, state.y);
      slot.inner.scale.set(innerScale, innerScale);
      slot.inner.rotation = -state.rotation * 0.5;
      slot.inner.tint = 0xffffff;
      slot.inner.alpha = state.innerAlpha * innerFade * 0.85;
    }
  }

  clear(): void {
    for (const slot of this.slots) {
      slot.state.active = false;
      slot.state.age = 0;
      slot.state.alpha = 0;
      slot.visual.visible = false;
      slot.visual.alpha = 0;
      slot.inner.visible = false;
      slot.inner.alpha = 0;
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
    slot.inner.visible = false;
    slot.inner.alpha = 0;
    this.activeGlows = Math.max(0, this.activeGlows - 1);
  }
}
