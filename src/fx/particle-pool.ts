import { Container, Sprite, Texture } from "pixi.js";
import { clamp, MAX_ACTIVE_PARTICLES, smoothstep } from "./fx-types";
import type { Point } from "../geometry/models";
import type { FxTextureId } from "./fx-asset-types";
import type { FxAssetPipeline } from "./asset-pipeline";
import { SeededRandom } from "./seeded-random";

export interface ParticleState {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  lifetime: number;
  alpha: number;
  baseAlpha: number;
  scale: number;
  baseScale: number;
  color: number;
  rotation: number;
  spin: number;
  phase: number;
  drag: number;
  fadeInEnd: number;
  fadeOutStart: number;
  flipX: boolean;
  textureId: FxTextureId;
}

interface ParticleSlot {
  state: ParticleState;
  visual: Sprite;
}

/**
 * Fixed-capacity Sprite pool. Every Sprite is created once in the constructor
 * and reused; spawn never creates a display object or a Graphics instance.
 */
export class ParticlePool {
  readonly layer = new Container();
  private readonly slots: ParticleSlot[] = [];
  private readonly maxParticles: number;
  private texturePipeline: FxAssetPipeline | undefined;
  private random = new SeededRandom("piano-puzzle-particles");
  private nextSlotIndex = 0;
  private activeParticles = 0;
  private droppedParticles = 0;

  constructor(maxParticles = MAX_ACTIVE_PARTICLES) {
    this.maxParticles = Math.max(1, Math.min(MAX_ACTIVE_PARTICLES, Math.floor(maxParticles)));
    for (let i = 0; i < this.maxParticles; i += 1) {
      const visual = new Sprite(Texture.WHITE);
      visual.anchor.set(0.5);
      visual.visible = false;
      this.layer.addChild(visual);
      this.slots.push({
        visual,
        state: {
          active: false,
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          age: 0,
          lifetime: 0,
          alpha: 0,
          baseAlpha: 0,
          scale: 1,
          baseScale: 1,
          color: 0xffffff,
          rotation: 0,
          spin: 0,
          phase: 0,
          drag: 1.2,
          fadeInEnd: 0.08,
          fadeOutStart: 0.58,
          flipX: false,
          textureId: "dust-mote"
        }
      });
    }
  }

  setTexturePipeline(pipeline: FxAssetPipeline): void {
    this.texturePipeline = pipeline;
  }

  setSeed(seed: string | number): void {
    this.random = new SeededRandom(seed);
  }

  acquire(position: Point, velocity: Point, lifetime: number, color: number, scale: number, textureId: FxTextureId = "dust-mote", alpha = 1): ParticleState | undefined {
    let slot: ParticleSlot | undefined;
    for (let offset = 0; offset < this.slots.length; offset += 1) {
      const index = (this.nextSlotIndex + offset) % this.slots.length;
      const candidate = this.slots[index];
      if (!candidate.state.active) {
        slot = candidate;
        this.nextSlotIndex = (index + 1) % this.slots.length;
        break;
      }
    }
    if (!slot) {
      this.droppedParticles += 1;
      return undefined;
    }
    const state = slot.state;
    state.active = true;
    state.x = position.x;
    state.y = position.y;
    state.vx = velocity.x;
    state.vy = velocity.y;
    state.age = 0;
    state.lifetime = Math.max(1, lifetime);
    state.baseAlpha = clamp(alpha);
    state.alpha = state.baseAlpha;
    state.baseScale = Math.max(0.01, scale);
    state.scale = state.baseScale;
    state.color = color;
    state.rotation = this.random.range(0, Math.PI * 2);
    state.spin = this.random.signed(textureId === "light-streak" ? 1.4 : 3.8);
    state.phase = this.random.range(0, Math.PI * 2);
    state.drag = textureId === "light-streak" ? 0.55 : textureId === "soft-bokeh" ? 0.85 : 1.45;
    state.fadeInEnd = textureId === "light-streak" ? 0.04 : textureId === "soft-bokeh" ? 0.12 : 0.08;
    state.fadeOutStart = textureId === "soft-bokeh" ? 0.48 : 0.58;
    state.flipX = this.random.nextFloat() > 0.5;
    state.textureId = textureId;
    slot.visual.texture = this.texturePipeline?.getTexture(textureId) ?? Texture.WHITE;
    slot.visual.position.set(state.x, state.y);
    slot.visual.scale.set(state.flipX ? -state.scale : state.scale, state.scale);
    slot.visual.rotation = state.rotation;
    slot.visual.tint = state.color;
    slot.visual.alpha = state.alpha;
    slot.visual.blendMode = textureId === "light-streak" || textureId === "soft-bokeh" ? "screen" : "normal";
    slot.visual.visible = true;
    this.activeParticles += 1;
    return state;
  }

  update(deltaSeconds: number): void {
    for (const slot of this.slots) {
      const state = slot.state;
      if (!state.active) continue;
      state.age += deltaSeconds * 1000;
      if (state.age >= state.lifetime) {
        this.release(slot);
        continue;
      }
      state.x += state.vx * deltaSeconds;
      state.y += state.vy * deltaSeconds;
      const drag = Math.exp(-state.drag * deltaSeconds);
      state.vx *= drag;
      state.vy *= drag;
      const progress = state.age / state.lifetime;
      const fadeIn = smoothstep(0, state.fadeInEnd, progress);
      const fadeOut = 1 - smoothstep(state.fadeOutStart, 1, progress);
      state.alpha = state.baseAlpha * Math.pow(Math.max(0, fadeIn * fadeOut), 0.78);
      state.scale = state.baseScale * (1 + Math.sin(state.phase + progress * Math.PI * 2) * 0.07) * (1 - progress * 0.12);
      state.rotation += state.spin * deltaSeconds;
      slot.visual.position.set(state.x, state.y);
      slot.visual.alpha = state.alpha;
      slot.visual.scale.set(state.flipX ? -state.scale : state.scale, state.scale);
      slot.visual.rotation = state.rotation;
      slot.visual.tint = state.color;
      slot.visual.blendMode = state.textureId === "light-streak" || state.textureId === "soft-bokeh" ? "screen" : "normal";
    }
  }

  clear(): void {
    for (const slot of this.slots) {
      slot.state.active = false;
      slot.state.age = 0;
      slot.state.alpha = 0;
      slot.state.scale = 0;
      slot.visual.visible = false;
      slot.visual.alpha = 0;
    }
    this.activeParticles = 0;
    this.droppedParticles = 0;
    this.nextSlotIndex = 0;
  }

  get activeCount(): number {
    return this.activeParticles;
  }

  get droppedCount(): number {
    return this.droppedParticles;
  }

  get capacity(): number {
    return this.maxParticles;
  }

  dispose(): void {
    this.clear();
    this.layer.destroy({ children: true });
  }

  private release(slot: ParticleSlot): void {
    if (!slot.state.active) return;
    slot.state.active = false;
    slot.state.age = 0;
    slot.state.alpha = 0;
    slot.state.scale = 0;
    slot.visual.visible = false;
    slot.visual.alpha = 0;
    this.activeParticles = Math.max(0, this.activeParticles - 1);
  }
}
