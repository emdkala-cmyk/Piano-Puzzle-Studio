import { Container, Sprite, Texture } from "pixi.js";
import { clamp, type VisualFxConfig } from "./fx-types";
import type { FxAssetPipeline } from "./asset-pipeline";

interface HighlightState {
  active: boolean;
  x: number;
  y: number;
  age: number;
  lifetime: number;
  alpha: number;
  scale: number;
  rotation: number;
  spin: number;
}

interface HighlightSlot {
  state: HighlightState;
  visual: Sprite;
}

const HIGHLIGHT_CAPACITY = 8;

export class LightingController {
  readonly layer = new Container();
  private readonly vignette: Sprite;
  private readonly highlights: HighlightSlot[] = [];
  private texturePipeline: FxAssetPipeline | undefined;
  private bassEnergy = 0;
  private highEnergy = 0;
  private paused = false;
  private width = 1080;
  private height = 1920;

  constructor() {
    this.vignette = new Sprite(createVignetteTexture());
    this.vignette.anchor.set(0);
    this.vignette.blendMode = "normal";
    this.layer.addChild(this.vignette);

    for (let index = 0; index < HIGHLIGHT_CAPACITY; index += 1) {
      const visual = new Sprite(Texture.WHITE);
      visual.anchor.set(0.5);
      visual.blendMode = "screen";
      visual.visible = false;
      this.layer.addChild(visual);
      this.highlights.push({
        visual,
        state: {
          active: false,
          x: 0,
          y: 0,
          age: 0,
          lifetime: 0,
          alpha: 0,
          scale: 1,
          rotation: 0,
          spin: 0
        }
      });
    }
  }

  setTexturePipeline(pipeline: FxAssetPipeline): void {
    this.texturePipeline = pipeline;
    const texture = pipeline.getTexture("soft-bokeh");
    for (const slot of this.highlights) slot.visual.texture = texture;
  }

  setSize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
  }

  noteOn(midiNote: number, velocity: number): void {
    if (midiNote < 48) this.bassEnergy = Math.min(1, this.bassEnergy + velocity * 0.5);
    if (midiNote >= 84) {
      this.highEnergy = Math.min(1, this.highEnergy + velocity * 0.35);
      this.spawnHighlight(midiNote, velocity);
    }
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  update(deltaSeconds: number, config: VisualFxConfig): void {
    const delta = Math.min(0.05, Math.max(0, deltaSeconds));
    if (!this.paused) {
      this.bassEnergy *= Math.pow(0.08, delta);
      this.highEnergy *= Math.pow(0.18, delta);
    }

    const enabled = config.lightingEnabled && config.enabled;
    const alpha = enabled
      ? config.lightingIntensity * clamp(0.16 + this.bassEnergy * 0.46 + this.highEnergy * 0.18, 0, 0.78)
      : 0;
    this.vignette.position.set(0, 0);
    this.vignette.width = this.width;
    this.vignette.height = this.height;
    this.vignette.tint = this.bassEnergy >= this.highEnergy ? 0x6b5570 : 0x8f7a55;
    this.vignette.alpha = alpha;

    for (const slot of this.highlights) {
      const state = slot.state;
      if (!state.active) continue;
      if (!this.paused) state.age += delta * 1000;
      if (state.age >= state.lifetime) {
        state.active = false;
        slot.visual.visible = false;
        continue;
      }
      const progress = state.age / state.lifetime;
      const fadeIn = Math.min(1, progress / 0.12);
      const fadeOut = 1 - Math.min(1, Math.max(0, (progress - 0.42) / 0.58));
      const pulse = 1 + Math.sin(progress * Math.PI * 4 + state.rotation) * 0.12;
      const textureExtent = Math.max(1, slot.visual.texture.width, slot.visual.texture.height);
      const scale = state.scale * pulse * (0.8 + progress * 0.48) * 96 / textureExtent;
      state.rotation += state.spin * delta;
      slot.visual.position.set(state.x, state.y);
      slot.visual.scale.set(scale, scale);
      slot.visual.rotation = state.rotation;
      slot.visual.alpha = enabled ? state.alpha * fadeIn * fadeOut * (0.35 + this.highEnergy * 0.55) : 0;
    }
  }

  clear(): void {
    this.bassEnergy = 0;
    this.highEnergy = 0;
    this.vignette.alpha = 0;
    for (const slot of this.highlights) {
      slot.state.active = false;
      slot.state.age = 0;
      slot.visual.visible = false;
      slot.visual.alpha = 0;
    }
  }

  dispose(): void {
    this.clear();
    if (this.vignette.texture !== Texture.WHITE) this.vignette.texture.destroy(true);
    this.layer.destroy({ children: true });
  }

  private spawnHighlight(midiNote: number, velocity: number): void {
    let slot: HighlightSlot | undefined;
    for (const candidate of this.highlights) {
      if (!candidate.state.active) {
        slot = candidate;
        break;
      }
    }
    if (!slot) slot = this.highlights[midiNote % this.highlights.length];

    const state = slot.state;
    state.active = true;
    state.x = this.width * (0.18 + ((midiNote % 19) / 18) * 0.64);
    state.y = this.height * (0.14 + (((midiNote * 7) % 23) / 22) * 0.46);
    state.age = 0;
    state.lifetime = 380 + velocity * 2.2;
    state.alpha = clamp(0.18 + velocity * 0.55);
    state.scale = 0.9 + velocity * 0.012;
    state.rotation = midiNote * 0.13;
    state.spin = 0.15 + (midiNote % 5) * 0.04;
    slot.visual.texture = this.texturePipeline?.getTexture("soft-bokeh") ?? Texture.WHITE;
    slot.visual.visible = true;
  }
}

function createVignetteTexture(): Texture {
  if (typeof document === "undefined") return Texture.WHITE;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) return Texture.WHITE;
  // Multi-layer cinematic vignette
  const gradient1 = context.createRadialGradient(256, 256, 40, 256, 256, 350);
  gradient1.addColorStop(0, "rgba(6, 10, 24, 0)");
  gradient1.addColorStop(0.4, "rgba(6, 10, 24, 0.02)");
  gradient1.addColorStop(0.65, "rgba(6, 10, 24, 0.15)");
  gradient1.addColorStop(0.85, "rgba(4, 7, 18, 0.45)");
  gradient1.addColorStop(1, "rgba(2, 4, 12, 0.82)");
  context.fillStyle = gradient1;
  context.fillRect(0, 0, 512, 512);
  // Subtle warm glow in center
  const gradient2 = context.createRadialGradient(256, 280, 0, 256, 280, 200);
  gradient2.addColorStop(0, "rgba(20, 15, 35, 0.12)");
  gradient2.addColorStop(0.5, "rgba(15, 10, 28, 0.05)");
  gradient2.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.globalCompositeOperation = "screen";
  context.fillStyle = gradient2;
  context.fillRect(0, 0, 512, 512);
  return Texture.from(canvas);
}
