import { Container, Sprite, Texture } from "pixi.js";
import type { Point } from "../geometry/models";
import { clamp, smoothstep } from "./fx-types";
import type { FxAssetPipeline } from "./asset-pipeline";

interface ImpactState {
  active: boolean;
  x: number;
  y: number;
  color: number;
  age: number;
  lifetime: number;
  intensity: number;
  rotation: number;
  spin: number;
}

interface ImpactSlot {
  state: ImpactState;
  visual: Sprite;
}

const MAX_IMPACTS = 64;

/**
 * Sprite-based lock pulse. This replaces per-event Graphics circles with a
 * reusable sparkle texture so lock-in reads as light, not as a UI ring.
 */
export class ImpactEffect {
  readonly layer = new Container();
  private readonly slots: ImpactSlot[] = [];
  private texturePipeline: FxAssetPipeline | undefined;
  private activeImpacts = 0;
  private nextSlotIndex = 0;

  constructor(maxImpacts = MAX_IMPACTS) {
    const capacity = Math.max(1, Math.min(MAX_IMPACTS, Math.floor(maxImpacts)));
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
          lifetime: 220,
          intensity: 0,
          rotation: 0,
          spin: 0
        }
      });
    }
  }

  setTexturePipeline(pipeline: FxAssetPipeline): void {
    this.texturePipeline = pipeline;
  }

  add(position: Point, color: number, intensity: number, durationMs = 220): void {
    let slot: ImpactSlot | undefined;
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
    state.lifetime = Math.max(80, durationMs);
    state.intensity = clamp(intensity);
    state.rotation = 0;
    state.spin = (state.x * 0.003 + state.y * 0.002) % 2.4 - 1.2;

    slot.visual.texture = this.texturePipeline?.getTexture("spark-cross") ?? Texture.WHITE;
    slot.visual.position.set(state.x, state.y);
    slot.visual.tint = state.color;
    slot.visual.alpha = state.intensity;
    slot.visual.visible = true;
    this.activeImpacts += 1;
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
      const alpha = state.intensity * Math.pow(1 - smoothstep(0, 1, progress), 0.72);
      const radius = 5 + progress * 28;
      const textureExtent = Math.max(1, slot.visual.texture.width, slot.visual.texture.height);
      const scale = radius * 2 / textureExtent;
      state.rotation += state.spin * Math.min(0.05, deltaMs / 1000);
      slot.visual.position.set(state.x, state.y);
      slot.visual.scale.set(scale, scale);
      slot.visual.rotation = state.rotation;
      slot.visual.tint = state.color;
      slot.visual.alpha = alpha;
    }
  }

  clear(): void {
    for (const slot of this.slots) {
      slot.state.active = false;
      slot.state.age = 0;
      slot.state.intensity = 0;
      slot.visual.visible = false;
      slot.visual.alpha = 0;
    }
    this.activeImpacts = 0;
    this.nextSlotIndex = 0;
  }

  get activeCount(): number {
    return this.activeImpacts;
  }

  dispose(): void {
    this.clear();
    this.layer.destroy({ children: true });
  }

  private release(slot: ImpactSlot): void {
    const state = slot.state;
    if (!state.active) return;
    state.active = false;
    state.age = 0;
    state.intensity = 0;
    slot.visual.visible = false;
    slot.visual.alpha = 0;
    this.activeImpacts = Math.max(0, this.activeImpacts - 1);
  }
}
