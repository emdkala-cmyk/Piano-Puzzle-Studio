import { Container, Sprite, Texture } from "pixi.js";
import type { Point } from "../geometry/models";
import type { FxTextureId } from "./fx-asset-types";
import type { FxAssetPipeline } from "./asset-pipeline";
import {
  clamp,
  FxSmokeBehavior,
  FxSmokeLayer,
  MAX_ACTIVE_SMOKE,
  smoothstep
} from "./fx-types";
import { SeededRandom } from "./seeded-random";

interface SmokeLayerProfile {
  scaleMultiplier: number;
  lifetimeMultiplier: number;
  alphaMultiplier: number;
  drag: number;
  turbulence: number;
  turbulenceFrequency: number;
  rise: number;
  spin: number;
  fadeInEnd: number;
  fadeOutStart: number;
}

const LAYER_PROFILES: Record<FxSmokeLayer, SmokeLayerProfile> = {
  core: {
    scaleMultiplier: 0.78,
    lifetimeMultiplier: 0.78,
    alphaMultiplier: 0.62,
    drag: 0.95,
    turbulence: 1.15,
    turbulenceFrequency: 3.8,
    rise: 5.2,
    spin: 0.6,
    fadeInEnd: 0.1,
    fadeOutStart: 0.58
  },
  volume: {
    scaleMultiplier: 1.08,
    lifetimeMultiplier: 1,
    alphaMultiplier: 0.42,
    drag: 0.72,
    turbulence: 0.75,
    turbulenceFrequency: 2.4,
    rise: 3.4,
    spin: 0.35,
    fadeInEnd: 0.14,
    fadeOutStart: 0.54
  },
  residue: {
    scaleMultiplier: 1.36,
    lifetimeMultiplier: 1.2,
    alphaMultiplier: 0.26,
    drag: 1.15,
    turbulence: 0.52,
    turbulenceFrequency: 1.8,
    rise: 2.1,
    spin: 0.2,
    fadeInEnd: 0.18,
    fadeOutStart: 0.48
  }
};

const TEXTURES_BY_LAYER: Record<FxSmokeLayer, readonly FxTextureId[]> = {
  core: ["smoke-wisp-01", "smoke-wisp-02"],
  volume: ["smoke-cloud-01", "smoke-wisp-02"],
  residue: ["smoke-wisp-01", "smoke-cloud-01"]
};

interface SmokeState {
  active: boolean;
  layer: FxSmokeLayer;
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
  radius: number;
  color: number;
  seed: number;
  phase: number;
  flowPhase: number;
  flowStrength: number;
  depth: number;
  rotation: number;
  spin: number;
  drag: number;
  turbulence: number;
  turbulenceFrequency: number;
  rise: number;
  fadeInEnd: number;
  fadeOutStart: number;
  flipX: boolean;
  textureId: FxTextureId;
}

interface SmokeSlot {
  state: SmokeState;
  visual: Sprite;
}

/**
 * Fixed-capacity, preallocated Sprite pool for layered smoke. All visual
 * instances are created once in the constructor and reused by acquire().
 */
export class SmokeController {
  readonly layer = new Container();
  private readonly slots: SmokeSlot[] = [];
  private readonly maxPuffs: number;
  private texturePipeline: FxAssetPipeline | undefined;
  private random = new SeededRandom("piano-puzzle-smoke");
  private nextSlotIndex = 0;
  private activePuffs = 0;
  private droppedPuffs = 0;
  private readonly activeByLayer: Record<FxSmokeLayer, number> = { core: 0, volume: 0, residue: 0 };
  private readonly lastTextureByLayer: Record<FxSmokeLayer, FxTextureId | undefined> = {
    core: undefined,
    volume: undefined,
    residue: undefined
  };

  constructor(maxPuffs = MAX_ACTIVE_SMOKE) {
    this.layer.sortableChildren = true;
    this.maxPuffs = Math.max(1, Math.min(MAX_ACTIVE_SMOKE, Math.floor(maxPuffs)));
    for (let i = 0; i < this.maxPuffs; i += 1) {
      const visual = new Sprite(Texture.WHITE);
      visual.anchor.set(0.5);
      visual.visible = false;
      this.layer.addChild(visual);
      this.slots.push({
        state: {
          active: false,
          layer: "volume",
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          age: 0,
          lifetime: 0,
          alpha: 0,
          baseAlpha: 0,
          scale: 0,
          baseScale: 1,
          radius: 1,
          color: 0xffffff,
          seed: 0,
          phase: 0,
          flowPhase: 0,
          flowStrength: 1,
          depth: 1,
          rotation: 0,
          spin: 0,
          drag: 1,
          turbulence: 0,
          turbulenceFrequency: 1,
          rise: 0,
          fadeInEnd: 0.12,
          fadeOutStart: 0.55,
          flipX: false,
          textureId: "smoke-cloud-01"
        },
        visual
      });
    }
  }

  setTexturePipeline(pipeline: FxAssetPipeline): void {
    this.texturePipeline = pipeline;
  }

  setSeed(seed: string | number): void {
    this.random = new SeededRandom(seed);
    this.lastTextureByLayer.core = undefined;
    this.lastTextureByLayer.volume = undefined;
    this.lastTextureByLayer.residue = undefined;
  }

  acquire(
    position: Point,
    velocity: Point,
    lifetime: number,
    color: number,
    radius: number,
    alpha: number,
    layer: FxSmokeLayer = "volume",
    behavior: FxSmokeBehavior = "neutral",
    dragMultiplier = 1,
    turbulenceMultiplier = 1,
    behaviorMultiplier = 1
  ): SmokeState | undefined {
    let slot: SmokeSlot | undefined;
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
      this.droppedPuffs += 1;
      return undefined;
    }

    const profile = LAYER_PROFILES[layer];
    const behaviorScale = behavior === "bass" ? 1.18 : behavior === "high" ? 0.78 : 1;
    const behaviorLifetime = behavior === "bass" ? 1.18 : behavior === "high" ? 0.76 : 1;
    const behaviorDrag = behavior === "bass" ? 1.22 : behavior === "high" ? 0.78 : 1;
    const behaviorTurbulence = behavior === "bass" ? 0.72 : behavior === "high" ? 1.4 : 1;
    const behaviorRise = behavior === "bass" ? 0.62 : behavior === "high" ? 1.32 : 1;
    const state = slot.state;

    state.active = true;
    state.layer = layer;
    state.x = position.x;
    state.y = position.y;
    state.vx = velocity.x;
    state.vy = velocity.y;
    state.age = 0;
    state.lifetime = Math.max(120, lifetime * profile.lifetimeMultiplier * behaviorLifetime * this.random.range(0.86, 1.18));
    state.radius = Math.max(2, radius);
    state.baseScale = Math.max(0.01, state.radius / 64 * profile.scaleMultiplier * behaviorScale * behaviorMultiplier * this.random.range(0.86, 1.18));
    state.scale = state.baseScale;
    state.baseAlpha = clamp(alpha * profile.alphaMultiplier * behaviorMultiplier * this.random.range(0.82, 1.16));
    state.alpha = state.baseAlpha;
    state.color = color;
    state.seed = this.random.range(0, Math.PI * 2);
    state.phase = this.random.range(0, Math.PI * 2);
    state.flowPhase = this.random.range(0, Math.PI * 2);
    state.flowStrength = this.random.range(0.72, 1.24);
    state.depth = this.random.range(0.72, 1.28);
    state.rotation = this.random.range(0, Math.PI * 2);
    state.spin = this.random.signed(profile.spin);
    state.drag = profile.drag * behaviorDrag * dragMultiplier * this.random.range(0.88, 1.14);
    state.turbulence = profile.turbulence * behaviorTurbulence * turbulenceMultiplier * this.random.range(0.86, 1.18);
    state.turbulenceFrequency = profile.turbulenceFrequency * this.random.range(0.88, 1.12);
    state.rise = profile.rise * behaviorRise * this.random.range(0.86, 1.16);
    state.fadeInEnd = profile.fadeInEnd;
    state.fadeOutStart = profile.fadeOutStart;
    state.flipX = this.random.nextFloat() > 0.5;
    state.textureId = this.pickTexture(layer);

    slot.visual.texture = this.texturePipeline?.getTexture(state.textureId) ?? Texture.WHITE;
    slot.visual.position.set(state.x, state.y);
    slot.visual.rotation = state.rotation;
    slot.visual.scale.set(state.flipX ? -state.scale : state.scale, state.scale);
    slot.visual.tint = state.color;
    slot.visual.alpha = state.alpha;
    slot.visual.blendMode = layer === "volume" ? "normal" : "screen";
    slot.visual.zIndex = layer === "core" ? 1 : layer === "volume" ? 2 : 3;
    slot.visual.visible = true;
    this.activePuffs += 1;
    this.activeByLayer[layer] += 1;
    return state;
  }

  update(deltaSeconds: number): void {
    const delta = Math.min(0.05, Math.max(0, deltaSeconds));
    for (const slot of this.slots) {
      const state = slot.state;
      if (!state.active) continue;
      state.age += delta * 1000;
      if (state.age >= state.lifetime) {
        this.release(slot);
        continue;
      }

      const progress = state.age / state.lifetime;
      const turbulenceX = Math.sin(state.phase + progress * state.turbulenceFrequency * 6.28318) * state.turbulence;
      const turbulenceY = Math.cos(state.seed * 1.37 + progress * state.turbulenceFrequency * 5.1) * state.turbulence * 0.72;
      const spatialX = state.x * 0.008 + state.seed * 3.7 + state.age * 0.00042;
      const spatialY = state.y * 0.009 + state.flowPhase * 2.1 - state.age * 0.00031;
      const curlX = (Math.sin(spatialY) * 0.7 + Math.cos(spatialX * 1.31) * 0.3) * state.flowStrength * state.turbulence;
      const curlY = (Math.cos(spatialX) * 0.68 - Math.sin(spatialY * 1.17) * 0.32) * state.flowStrength * state.turbulence;
      const drag = Math.exp(-state.drag * delta);
      state.vx = state.vx * drag + (turbulenceX + curlX * 0.9) * delta;
      state.vy = state.vy * drag + (turbulenceY + curlY * 0.82) * delta - state.rise * delta;
      state.x += state.vx * delta;
      state.y += state.vy * delta;

      const fadeIn = smoothstep(0, state.fadeInEnd, progress);
      const fadeOut = 1 - smoothstep(state.fadeOutStart, 1, progress);
      const alphaCurve = Math.pow(Math.max(0, fadeIn * fadeOut), 0.68);
      const growth = 0.74 + progress * 1.48;
      const breathing = 1 + Math.sin(state.phase + progress * 5.2) * 0.08 + Math.sin(state.flowPhase + progress * 2.6) * 0.035;
      state.scale = state.baseScale * growth * breathing * (0.94 + state.depth * 0.06);
      state.alpha = state.baseAlpha * alphaCurve * (0.94 + Math.sin(state.flowPhase + progress * 3.1) * 0.06);
      state.rotation += state.spin * delta;

      slot.visual.position.set(state.x, state.y);
      slot.visual.scale.set(state.flipX ? -state.scale : state.scale, state.scale);
      slot.visual.rotation = state.rotation;
      slot.visual.alpha = state.alpha;
      slot.visual.tint = state.color;
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
    this.activePuffs = 0;
    this.droppedPuffs = 0;
    this.nextSlotIndex = 0;
    this.activeByLayer.core = 0;
    this.activeByLayer.volume = 0;
    this.activeByLayer.residue = 0;
    this.lastTextureByLayer.core = undefined;
    this.lastTextureByLayer.volume = undefined;
    this.lastTextureByLayer.residue = undefined;
  }

  get activeCount(): number {
    return this.activePuffs;
  }

  get droppedCount(): number {
    return this.droppedPuffs;
  }

  get capacity(): number {
    return this.maxPuffs;
  }

  get layerCount(): number {
    return 3;
  }

  getLayerActiveCount(layer: FxSmokeLayer): number {
    return this.activeByLayer[layer];
  }

  dispose(): void {
    this.clear();
    this.layer.destroy({ children: true });
  }

  private pickTexture(layer: FxSmokeLayer): FxTextureId {
    const candidates = TEXTURES_BY_LAYER[layer];
    let index = Math.floor(this.random.nextFloat() * candidates.length);
    const previous = this.lastTextureByLayer[layer];
    if (candidates.length > 1 && candidates[index] === previous) index = (index + 1) % candidates.length;
    const textureId = candidates[index];
    this.lastTextureByLayer[layer] = textureId;
    return textureId;
  }

  private release(slot: SmokeSlot): void {
    const state = slot.state;
    if (!state.active) return;
    state.active = false;
    state.age = 0;
    state.alpha = 0;
    state.scale = 0;
    this.activePuffs = Math.max(0, this.activePuffs - 1);
    this.activeByLayer[state.layer] = Math.max(0, this.activeByLayer[state.layer] - 1);
    slot.visual.visible = false;
    slot.visual.alpha = 0;
  }
}
