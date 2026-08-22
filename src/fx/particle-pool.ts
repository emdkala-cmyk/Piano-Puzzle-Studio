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
  turbulence: number;
  turbulenceFrequency: number;
  rise: number;
  fadeInEnd: number;
  fadeOutStart: number;
  flipX: boolean;
  textureId: FxTextureId;
  colorShift: number;
  endColor: number;
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
          turbulence: 0,
          turbulenceFrequency: 1,
          rise: 0,
          fadeInEnd: 0.08,
          fadeOutStart: 0.58,
          flipX: false,
          textureId: "dust-mote",
          colorShift: 0.1,
          endColor: 0xffffff
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
    state.drag = textureId === "light-streak" ? 0.35 : textureId === "soft-bokeh" ? 0.55 : textureId === "glow-orb" ? 0.6 : 0.9;
    state.turbulence = textureId === "sharp-dot"
      ? 5.5 + this.random.signed(1.5)
      : textureId === "glow-orb"
        ? 4.0 + this.random.signed(1.2)
        : textureId === "warm-orb" || textureId === "ice-orb"
          ? 3.5 + this.random.signed(1)
          : 2.5 + this.random.signed(0.8);
    state.turbulenceFrequency = textureId === "sharp-dot"
      ? 4.5 + this.random.signed(1)
      : textureId === "glow-orb"
        ? 3.5 + this.random.signed(0.8)
        : 2.8 + this.random.signed(0.6);
    state.rise = textureId === "sharp-dot" || textureId === "glow-orb" ? -4.0 + this.random.signed(1.5) : -1.0 + this.random.signed(0.5);
    // Longer visible lifetime - particles stay bright longer
    state.fadeInEnd = textureId === "light-streak"
      ? 0.02
      : textureId === "glow-orb"
        ? 0.04
        : textureId === "sharp-dot"
          ? 0.015
          : 0.05;
    state.fadeOutStart = textureId === "glow-orb"
      ? 0.5
      : textureId === "sharp-dot"
        ? 0.68
        : 0.58;
    state.flipX = this.random.nextFloat() > 0.5;
    state.textureId = textureId;
    state.colorShift = this.random.range(0.08, 0.18);
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    state.endColor = (Math.min(255, Math.round(r * 0.7 + 80)) << 16) | (Math.min(255, Math.round(g * 0.6 + 60)) << 8) | Math.min(255, Math.round(b * 0.5 + 40));
    slot.visual.texture = this.texturePipeline?.getTexture(textureId) ?? Texture.WHITE;
    slot.visual.position.set(state.x, state.y);
    slot.visual.scale.set(state.flipX ? -state.scale : state.scale, state.scale);
    if (textureId === "light-streak") {
      state.rotation = Math.atan2(velocity.y, velocity.x) + this.random.signed(0.24);
    }
    slot.visual.rotation = state.rotation;
    slot.visual.tint = state.color;
    slot.visual.alpha = state.alpha;
    slot.visual.blendMode = blendModeForParticle(textureId);
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
      const turbulencePhase = state.phase + progress * state.turbulenceFrequency * Math.PI * 2;
      // Multi-layer orbital motion for organic flow
      const orbitalX = Math.sin(turbulencePhase * 0.6 + state.phase * 1.4) * state.turbulence * 0.4
        + Math.sin(turbulencePhase * 1.7 + state.phase * 0.6) * state.turbulence * 0.12;
      const orbitalY = Math.cos(turbulencePhase * 0.5 + state.phase * 1.1) * state.turbulence * 0.32
        + Math.cos(turbulencePhase * 1.3 + state.phase * 0.8) * state.turbulence * 0.1;
      state.vx += Math.sin(turbulencePhase) * state.turbulence * deltaSeconds + orbitalX * deltaSeconds;
      state.vy += Math.cos(turbulencePhase * 0.83 + state.phase * 0.7) * state.turbulence * 0.68 * deltaSeconds + state.rise * deltaSeconds + orbitalY * deltaSeconds;
      const fadeIn = smoothstep(0, state.fadeInEnd, progress);
      const fadeOut = 1 - smoothstep(state.fadeOutStart, 1, progress);
      state.alpha = state.baseAlpha * Math.pow(Math.max(0, fadeIn * fadeOut), 0.42); // Brighter fade curve
      const sizePulse = 1 + Math.sin(progress * Math.PI * 2.2 + state.phase * 2) * 0.18 + Math.sin(progress * Math.PI * 4.5 + state.phase * 3) * 0.08;
      state.scale = state.baseScale * sizePulse * (1 + progress * 0.2); // Grow slightly over lifetime for bloom effect
      state.rotation += state.spin * deltaSeconds;
      // Color shift over lifetime - shift toward warmer/brighter
      const colorT = Math.min(1, progress * state.colorShift * 5);
      const sr = (state.color >> 16) & 0xff;
      const sg = (state.color >> 8) & 0xff;
      const sb = state.color & 0xff;
      const er = (state.endColor >> 16) & 0xff;
      const eg = (state.endColor >> 8) & 0xff;
      const eb = state.endColor & 0xff;
      const cr = Math.round(sr + (er - sr) * colorT);
      const cg = Math.round(sg + (eg - sg) * colorT);
      const cb = Math.round(sb + (eb - sb) * colorT);
      const currentColor = (cr << 16) | (cg << 8) | cb;
      slot.visual.position.set(state.x, state.y);
      slot.visual.alpha = state.alpha;
      slot.visual.scale.set(state.flipX ? -state.scale : state.scale, state.scale);
      slot.visual.rotation = state.rotation;
      slot.visual.tint = currentColor;
      slot.visual.blendMode = blendModeForParticle(state.textureId);
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

function blendModeForParticle(textureId: FxTextureId): "add" | "screen" | "normal" {
  if (textureId === "soft-orb"
    || textureId === "glow-orb"
    || textureId === "sharp-dot"
    || textureId === "warm-orb"
    || textureId === "ice-orb"
    || textureId === "ember-small"
    || textureId === "spark-cross"
    || textureId === "dust-mote"
    || textureId === "micro-spark"
    || textureId === "spark-field"
    || textureId === "micro-streak"
    || textureId === "particle-cluster") return "add";
  if (textureId === "light-streak" || textureId === "soft-bokeh") return "screen";
  return "screen";
}
