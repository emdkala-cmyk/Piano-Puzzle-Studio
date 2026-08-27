import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { clamp } from "./fx-types";
import type { Point } from "../geometry/models";

export interface KeyGlowAnchor {
  midiNote: number;
  topPoint: Point;
  width: number;
}

interface ActiveKeyGlow {
  intensity: number;
  color: number;
  birthTime: number;
}

interface FogWisp {
  x: number;
  y: number;
  driftSpeed: number;
  life: number;
  maxLife: number;
  width: number;
  height: number;
  alpha: number;
  tint: number;
  turbulence: number;
  phase: number;
}

interface SparkleDot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  tint: number;
}

const GAUSS_STOPS: Array<[number, number]> = [
  [0.0, 0.0],
  [0.18, 0.015],
  [0.3, 0.07],
  [0.4, 0.24],
  [0.46, 0.55],
  [0.5, 1.0],
  [0.54, 0.55],
  [0.6, 0.24],
  [0.7, 0.07],
  [0.82, 0.015],
  [1.0, 0.0]
];

function makeBeamTexture(): Texture {
  const w = 512;
  const h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  for (const [stop, alpha] of GAUSS_STOPS) {
    grad.addColorStop(stop, `rgba(255,255,255,${alpha})`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const fade = ctx.createLinearGradient(0, 0, w, 0);
  fade.addColorStop(0, "rgba(0,0,0,0)");
  fade.addColorStop(0.08, "rgba(0,0,0,1)");
  fade.addColorStop(0.92, "rgba(0,0,0,1)");
  fade.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, w, h);

  return Texture.from(canvas);
}

function makeUpBeamTexture(): Texture {
  const w = 128;
  const h = 512;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  const grad = ctx.createLinearGradient(0, 0, w, 0);
  for (const [stop, alpha] of GAUSS_STOPS) {
    grad.addColorStop(stop, `rgba(255,255,255,${alpha})`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const fade = ctx.createLinearGradient(0, 0, 0, h);
  fade.addColorStop(0, "rgba(0,0,0,0)");
  fade.addColorStop(0.45, "rgba(0,0,0,0.55)");
  fade.addColorStop(0.8, "rgba(0,0,0,1)");
  fade.addColorStop(1, "rgba(0,0,0,1)");
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, w, h);

  return Texture.from(canvas);
}

function makeBlobTexture(): Texture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [stop, alpha] of GAUSS_STOPS) {
    grad.addColorStop(stop, `rgba(255,255,255,${alpha})`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(canvas);
}

export class KeyboardGlowController {
  readonly layer = new Container();

  private readonly ambientLayer = new Container();
  private readonly fogLayer = new Container();
  private readonly beamLayer = new Container();
  private readonly fxLayer = new Container();

  private readonly beamTex: Texture;
  private readonly upBeamTex: Texture;
  private readonly blobTex: Texture;

  private readonly hazeSprite: Sprite;
  private readonly glowSprite: Sprite;
  private readonly bandSprite: Sprite;
  private readonly coreSprite: Sprite;

  private readonly shimmerA: Sprite;
  private readonly shimmerB: Sprite;
  private readonly customFx: Graphics;

  private keyAnchors: KeyGlowAnchor[] = [];
  private activeGlows = new Map<number, ActiveKeyGlow>();

  private thickness = 4;
  private spread = 60;
  private softness = 0.7;
  private dissolveSpeed = 1.5;
  private pulseAmount = 0.4;
  private glowStyle: "default" | "wave" | "fire" | "particles" = "default";
  private isEnabled = true;

  private paused = false;
  private time = 0;
  private fogWisps: FogWisp[] = [];
  private sparkles: SparkleDot[] = [];
  private static readonly MAX_FOG = 70;
  private static readonly MAX_SPARKLES = 40;

  private readonly wispPool: Sprite[] = [];
  private readonly beamPool: Sprite[] = [];
  private readonly flarePool: Sprite[] = [];
  private readonly sparklePool: Sprite[] = [];

  private fogSpawnTimer = 0;
  private fogSpawnInterval = 0.12;

  constructor() {
    this.beamTex = makeBeamTexture();
    this.upBeamTex = makeUpBeamTexture();
    this.blobTex = makeBlobTexture();

    this.layer.addChild(this.ambientLayer);
    this.layer.addChild(this.fogLayer);
    this.layer.addChild(this.beamLayer);
    this.layer.addChild(this.fxLayer);

    const mk = (tex: Texture, tint: number, parent: Container): Sprite => {
      const s = new Sprite(tex);
      s.anchor.set(0.5, 0.5);
      s.tint = tint;
      s.blendMode = "add";
      s.roundPixels = true;
      parent.addChild(s);
      return s;
    };

    this.hazeSprite = mk(this.beamTex, 0x4d8fd6, this.ambientLayer);
    this.glowSprite = mk(this.beamTex, 0x9cc4ef, this.ambientLayer);
    this.bandSprite = mk(this.beamTex, 0xe8f4ff, this.ambientLayer);
    this.coreSprite = mk(this.beamTex, 0xffffff, this.ambientLayer);

    this.shimmerA = mk(this.blobTex, 0xffffff, this.ambientLayer);
    this.shimmerB = mk(this.blobTex, 0xcfe6ff, this.ambientLayer);
    this.customFx = new Graphics();
    this.fxLayer.addChild(this.customFx);

    // Hide all ambient sprites until setKeyAnchors positions them correctly
    this.hazeSprite.visible = false;
    this.glowSprite.visible = false;
    this.bandSprite.visible = false;
    this.coreSprite.visible = false;
    this.shimmerA.visible = false;
    this.shimmerB.visible = false;
  }

  setKeyAnchors(anchors: KeyGlowAnchor[]): void {
    // Always clear old particles — like note spawn points, the glow must be
    // 100% locked to the current piano position with zero ghost traces.
    this.fogWisps = [];
    this.sparkles = [];
    this.activeGlows.clear();

    this.keyAnchors = anchors.slice().sort((a, b) => a.topPoint.x - b.topPoint.x);
    this.renderBar(1.0, this.isEnabled);
  }

  applySettings(
    thickness: number,
    spread: number,
    softness: number,
    dissolveSpeed: number,
    pulseAmount: number,
    beamIntensity = 1.0,
    enabled = true,
    style?: "default" | "wave" | "fire" | "particles"
  ): void {
    this.thickness = clamp(thickness, 0.5, 20);
    this.spread = clamp(spread, 5, 250);
    this.softness = clamp(softness, 0, 1);
    this.dissolveSpeed = clamp(dissolveSpeed, 0.1, 8);
    this.pulseAmount = clamp(pulseAmount, 0, 1);
    this.isEnabled = enabled;
    if (style) this.glowStyle = style;
    void beamIntensity;
    this.renderBar(1.0, this.isEnabled);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  hitKeyByNote(midiNote: number, color: number, velocity: number): void {
    const intensity = clamp(0.4 + velocity * 0.6);
    const existing = this.activeGlows.get(midiNote);
    if (!existing || intensity > existing.intensity) {
      this.activeGlows.set(midiNote, { intensity, color, birthTime: this.time });
    }
    const anchor = this.keyAnchors.find((a) => a.midiNote === midiNote);
    if (anchor) {
      const burst = Math.floor(2 + intensity * 4);
      for (let i = 0; i < burst; i++) {
        this.spawnFogWisp(anchor.topPoint, anchor.width, color, intensity, true);
      }
      const sparkleCount = Math.floor(intensity * 3);
      for (let i = 0; i < sparkleCount; i++) {
        this.spawnSparkle(anchor.topPoint, anchor.width, color);
      }
    }
  }

  private spawnFogWisp(p: Point, width: number, color: number, intensity: number, burst: boolean): void {
    if (this.fogWisps.length >= KeyboardGlowController.MAX_FOG) return;

    const driftDir = Math.random() > 0.5 ? 1 : -1;
    const speed = burst ? 25 + Math.random() * 45 : 6 + Math.random() * 14;

    this.fogWisps.push({
      x: p.x + (Math.random() - 0.5) * width * 2,
      y: p.y - (burst ? Math.random() * 12 : 2 + Math.random() * this.spread * 0.12),
      driftSpeed: speed * driftDir,
      life: 0,
      maxLife: 2.2 + Math.random() * 3,
      width: 60 + Math.random() * 110 + (burst ? intensity * 70 : 0),
      height: (burst ? 14 : 9) + Math.random() * 16,
      alpha: (burst ? 0.1 : 0.05) + intensity * 0.08 + Math.random() * 0.05,
      tint: burst ? color : 0xbfd8f2,
      turbulence: 2 + Math.random() * 5,
      phase: Math.random() * Math.PI * 2
    });
  }

  private spawnSparkle(p: Point, width: number, color: number): void {
    if (this.sparkles.length >= KeyboardGlowController.MAX_SPARKLES) return;
    const angle = Math.random() * Math.PI * 2;
    const speed = 12 + Math.random() * 26;
    this.sparkles.push({
      x: p.x + (Math.random() - 0.5) * width,
      y: p.y - Math.random() * this.spread * 0.2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 12,
      life: 0,
      maxLife: 0.25 + Math.random() * 0.4,
      size: 1 + Math.random() * 2.5,
      tint: color
    });
  }

  private acquireSprite(pool: Sprite[], tex: Texture, parent: Container): Sprite {
    let s = pool.pop();
    if (!s) {
      s = new Sprite(tex);
      s.anchor.set(0.5, 0.5);
      s.blendMode = "add";
      s.roundPixels = true;
      parent.addChild(s);
    }
    s.texture = tex;
    s.visible = true;
    return s;
  }

  private renderBar(globalIntensity: number, enabled: boolean): void {
    if (!enabled || !this.isEnabled || this.keyAnchors.length < 2) {
      this.hazeSprite.visible = false;
      this.glowSprite.visible = false;
      this.bandSprite.visible = false;
      this.coreSprite.visible = false;
      this.shimmerA.visible = false;
      this.shimmerB.visible = false;
      return;
    }

    const t = this.time;
    const firstP = this.keyAnchors[0].topPoint;
    const lastP = this.keyAnchors[this.keyAnchors.length - 1].topPoint;
    const cy = firstP.y;
    const lineLen = Math.max(10, lastP.x - firstP.x);
    const cx = (firstP.x + lastP.x) / 2;

    const breathe = 1 - this.pulseAmount * 0.22 * (0.5 + 0.5 * Math.sin(t * 1.6));

    this.hazeSprite.visible = true;
    this.hazeSprite.position.set(cx, cy);
    this.hazeSprite.width = lineLen * 1.15;
    this.hazeSprite.height = Math.max(4, this.spread * 3.2 * breathe);
    this.hazeSprite.alpha = (0.12 + 0.22 * this.softness) * globalIntensity;

    this.glowSprite.visible = true;
    this.glowSprite.position.set(cx, cy);
    this.glowSprite.width = lineLen * 1.08;
    this.glowSprite.height = Math.max(3, this.spread * 1.2 * breathe);
    this.glowSprite.alpha = (0.28 + 0.35 * this.softness) * globalIntensity;

    this.bandSprite.visible = true;
    this.bandSprite.position.set(cx, cy);
    this.bandSprite.width = lineLen * 1.04;
    this.bandSprite.height = Math.max(2, this.thickness * 4.5 + 4);
    this.bandSprite.alpha = 0.65 * globalIntensity * breathe;

    this.coreSprite.visible = true;
    this.coreSprite.position.set(cx, cy);
    this.coreSprite.width = lineLen * 1.01;
    this.coreSprite.height = Math.max(1.2, this.thickness * 1.5 + 1.0);
    this.coreSprite.alpha = 0.98 * globalIntensity;

    // Hide default shimmers — customFx handles all style effects
    this.shimmerA.visible = false;
    this.shimmerB.visible = false;
    this.customFx.clear();

    if (this.glowStyle === "wave") {
      // ── WAVE: flowing sine wave with thick glowing strokes ──
      const segments = 60;
      const amp = this.thickness * 6 * breathe;
      const freq = 3.0;
      const speed = 2.5;
      // Outer haze wave
      this.customFx.moveTo(firstP.x, cy);
      for (let i = 1; i <= segments; i++) {
        const ratio = i / segments;
        const x = firstP.x + ratio * lineLen;
        const y = cy + Math.sin(ratio * Math.PI * freq + t * speed) * amp;
        this.customFx.lineTo(x, y);
      }
      this.customFx.stroke({ width: this.thickness * 4, color: 0x4488cc, alpha: 0.15 * globalIntensity });
      // Middle glow wave
      this.customFx.moveTo(firstP.x, cy);
      for (let i = 1; i <= segments; i++) {
        const ratio = i / segments;
        const x = firstP.x + ratio * lineLen;
        const y = cy + Math.sin(ratio * Math.PI * freq + t * speed) * amp * 0.8;
        this.customFx.lineTo(x, y);
      }
      this.customFx.stroke({ width: this.thickness * 2.5, color: 0x66bbee, alpha: 0.35 * globalIntensity });
      // Core bright wave
      this.customFx.moveTo(firstP.x, cy);
      for (let i = 1; i <= segments; i++) {
        const ratio = i / segments;
        const x = firstP.x + ratio * lineLen;
        const y = cy + Math.sin(ratio * Math.PI * freq + t * speed) * amp * 0.6;
        this.customFx.lineTo(x, y);
      }
      this.customFx.stroke({ width: this.thickness * 1.2, color: 0xaaddff, alpha: 0.7 * globalIntensity });
      // Second harmonic wave (offset)
      this.customFx.moveTo(firstP.x, cy);
      for (let i = 1; i <= segments; i++) {
        const ratio = i / segments;
        const x = firstP.x + ratio * lineLen;
        const y = cy + Math.sin(ratio * Math.PI * freq * 1.5 + t * speed * 0.7 + 1.0) * amp * 0.4;
        this.customFx.lineTo(x, y);
      }
      this.customFx.stroke({ width: this.thickness * 1.5, color: 0x88ccee, alpha: 0.25 * globalIntensity });

    } else if (this.glowStyle === "fire") {
      // ── FIRE: flames rising from the bar ──
      const flameCount = 40;
      for (let i = 0; i < flameCount; i++) {
        const ratio = (i + 0.5) / flameCount;
        const x = firstP.x + ratio * lineLen;
        const seed = i * 137.508;
        // Flickering flame height
        const flicker1 = Math.sin(t * 9 + seed) * 0.5 + 0.5;
        const flicker2 = Math.sin(t * 13 + seed * 1.7) * 0.3 + 0.7;
        const flameH = this.thickness * (8 + flicker1 * 18) * breathe * flicker2;
        const sway = Math.sin(t * 4 + seed * 0.5) * 3;
        // Outer flame (dark red)
        this.customFx.rect(x - 2 + sway * 0.5, cy - flameH * 0.8, 5, flameH * 0.9);
        this.customFx.fill({ color: 0xcc2200, alpha: 0.2 * globalIntensity * flicker1 });
        // Middle flame (orange)
        this.customFx.rect(x - 1.5 + sway * 0.3, cy - flameH * 0.6, 4, flameH * 0.7);
        this.customFx.fill({ color: 0xff6600, alpha: 0.4 * globalIntensity * flicker2 });
        // Inner flame (yellow)
        this.customFx.rect(x - 1 + sway * 0.2, cy - flameH * 0.35, 3, flameH * 0.45);
        this.customFx.fill({ color: 0xffcc00, alpha: 0.5 * globalIntensity * flicker1 });
        // Core (white-hot)
        this.customFx.rect(x - 0.5 + sway * 0.1, cy - flameH * 0.15, 2, flameH * 0.2);
        this.customFx.fill({ color: 0xffffff, alpha: 0.35 * globalIntensity * flicker2 });
      }
      // Ember sparks rising above flames
      for (let i = 0; i < 15; i++) {
        const seed = i * 73.13;
        const sparkX = firstP.x + ((Math.sin(seed + t * 0.8) * 0.5 + 0.5)) * lineLen;
        const sparkY = cy - 30 - Math.abs(Math.sin(seed * 1.3 + t * 1.2)) * this.spread * 1.5;
        const sparkSize = 1.5 + Math.sin(seed + t * 3) * 0.8;
        this.customFx.circle(sparkX, sparkY, sparkSize);
        this.customFx.fill({ color: 0xff8844, alpha: (0.3 + 0.2 * Math.sin(seed + t * 4)) * globalIntensity });
      }

    } else if (this.glowStyle === "particles") {
      // ── PARTICLES: glowing orbs floating upward ──
      const count = 50;
      for (let i = 0; i < count; i++) {
        const seed = i * 97.31;
        const speed = 0.3 + (i % 5) * 0.15;
        const drift = Math.sin(seed + t * speed) * lineLen * 0.5;
        const px = firstP.x + lineLen * 0.5 + drift;
        const riseSpeed = 0.4 + (i % 3) * 0.2;
        const py = cy - ((t * riseSpeed * 40 + seed * 7) % (this.spread * 2.5));
        const size = 2 + Math.sin(seed + t * 2) * 1.2;
        const alpha = (0.15 + 0.1 * Math.sin(seed * 2 + t)) * globalIntensity;
        // Outer glow
        this.customFx.circle(px, py, size * 3);
        this.customFx.fill({ color: 0x88bbff, alpha: alpha * 0.15 });
        // Mid glow
        this.customFx.circle(px, py, size * 1.8);
        this.customFx.fill({ color: 0xaaddff, alpha: alpha * 0.35 });
        // Core
        this.customFx.circle(px, py, size * 0.6);
        this.customFx.fill({ color: 0xffffff, alpha: alpha * 0.7 });
      }
      // Bright sparkles at random positions
      for (let i = 0; i < 20; i++) {
        const seed = i * 53.71 + 100;
        const sx = firstP.x + ((Math.sin(seed + t * 0.4) * 0.5 + 0.5)) * lineLen;
        const sy = cy - 10 - Math.abs(Math.cos(seed * 0.8 + t * 0.6)) * this.spread * 0.8;
        const flash = Math.sin(seed * 3 + t * 5) > 0.7 ? 1 : 0;
        if (flash) {
          this.customFx.circle(sx, sy, 2.5);
          this.customFx.fill({ color: 0xffffff, alpha: 0.6 * globalIntensity });
        }
      }

    } else {
      // ── DEFAULT: original shimmer blobs ──
      const shimmerPos = (t * 0.13) % 1.6 - 0.3;
      this.shimmerA.visible = true;
      this.shimmerA.position.set(firstP.x + shimmerPos * lineLen, cy);
      this.shimmerA.width = lineLen * 0.35;
      this.shimmerA.height = this.spread * 0.9;
      this.shimmerA.alpha = 0.12 * globalIntensity;

      const shimmer2Pos = 1.6 - ((t * 0.09 + 0.5) % 1.6);
      this.shimmerB.visible = true;
      this.shimmerB.position.set(firstP.x + shimmer2Pos * lineLen, cy);
      this.shimmerB.width = lineLen * 0.3;
      this.shimmerB.height = this.spread * 0.7;
      this.shimmerB.alpha = 0.08 * globalIntensity;
    }
  }

  update(deltaSeconds: number, enabled: boolean, globalIntensity: number): void {
    this.isEnabled = enabled;
    if (!this.paused) {
      this.time += deltaSeconds;

      for (const [note, state] of this.activeGlows.entries()) {
        state.intensity -= this.dissolveSpeed * deltaSeconds;
        if (state.intensity <= 0.005) this.activeGlows.delete(note);
      }

      this.fogSpawnTimer += deltaSeconds;
      if (this.keyAnchors.length >= 2 && this.fogSpawnTimer >= this.fogSpawnInterval) {
        this.fogSpawnTimer = 0;
        const firstP = this.keyAnchors[0].topPoint;
        const lastP = this.keyAnchors[this.keyAnchors.length - 1].topPoint;
        const rx = firstP.x + Math.random() * (lastP.x - firstP.x);
        this.fogWisps.push({
          x: rx,
          y: firstP.y - 2 - Math.random() * this.spread * 0.15,
          driftSpeed: (5 + Math.random() * 11) * (Math.random() > 0.5 ? 1 : -1),
          life: 0,
          maxLife: 2.5 + Math.random() * 3.5,
          width: 80 + Math.random() * 140,
          height: 10 + Math.random() * 18,
          alpha: 0.04 + Math.random() * 0.05,
          tint: 0xbfd8f2,
          turbulence: 1.5 + Math.random() * 4,
          phase: Math.random() * Math.PI * 2
        });
      }

      for (let i = this.fogWisps.length - 1; i >= 0; i--) {
        const w = this.fogWisps[i];
        w.life += deltaSeconds;
        if (w.life >= w.maxLife) { this.fogWisps.splice(i, 1); continue; }
        w.x += w.driftSpeed * deltaSeconds;
        w.y += Math.sin(this.time * 0.9 + w.phase) * w.turbulence * deltaSeconds;
        w.width *= 1 + 0.12 * deltaSeconds;
        w.height *= 1 + 0.08 * deltaSeconds;
      }

      for (let i = this.sparkles.length - 1; i >= 0; i--) {
        const sp = this.sparkles[i];
        sp.life += deltaSeconds;
        if (sp.life >= sp.maxLife) { this.sparkles.splice(i, 1); continue; }
        sp.x += sp.vx * deltaSeconds;
        sp.y += sp.vy * deltaSeconds;
        sp.vy += 22 * deltaSeconds;
      }
    }

    for (const s of this.wispPool) s.visible = false;
    for (const s of this.beamPool) s.visible = false;
    for (const s of this.flarePool) s.visible = false;
    for (const s of this.sparklePool) s.visible = false;

    this.renderBar(globalIntensity, enabled);

    if (!enabled || !this.isEnabled || this.keyAnchors.length < 2) return;

    for (const w of this.fogWisps) {
      const lifeRatio = w.life / w.maxLife;
      const fadeIn = Math.min(1, lifeRatio * 5);
      const fadeOut = Math.max(0, 1 - Math.pow(lifeRatio, 1.6));
      const a = w.alpha * fadeIn * fadeOut * globalIntensity;
      if (a <= 0.003) continue;

      const s = this.acquireSprite(this.wispPool, this.blobTex, this.fogLayer);
      s.position.set(w.x, w.y);
      s.width = w.width;
      s.height = w.height;
      s.tint = w.tint;
      s.alpha = a;
    }

    for (const anchor of this.keyAnchors) {
      const state = this.activeGlows.get(anchor.midiNote);
      if (!state || state.intensity <= 0.01) continue;

      const p = anchor.topPoint;
      const kw = anchor.width;
      const alpha = clamp(state.intensity * globalIntensity, 0, 1);
      const age = this.time - state.birthTime;
      const attack = Math.min(1, age * 8);
      const beamH = this.spread * (1.2 + state.intensity * 0.8);
      const sway = Math.sin(age * 2.2 + anchor.midiNote) * kw * 0.15;

      const beam = this.acquireSprite(this.beamPool, this.upBeamTex, this.beamLayer);
      beam.anchor.set(0.5, 1);
      beam.position.set(p.x + sway, p.y);
      beam.width = kw * 2.6;
      beam.height = beamH;
      beam.tint = state.color;
      beam.alpha = alpha * 0.5 * attack;

      const flare = this.acquireSprite(this.flarePool, this.blobTex, this.beamLayer);
      flare.anchor.set(0.5, 0.5);
      flare.position.set(p.x, p.y);
      flare.width = kw * 3.2;
      flare.height = kw * 3.2;
      flare.tint = state.color;
      flare.alpha = alpha * 0.35 * attack;

      const hot = this.acquireSprite(this.flarePool, this.blobTex, this.beamLayer);
      hot.anchor.set(0.5, 0.5);
      hot.position.set(p.x, p.y);
      hot.width = kw * 1.2;
      hot.height = kw * 1.2;
      hot.tint = 0xffffff;
      hot.alpha = alpha * 0.8 * attack;
    }

    for (const sp of this.sparkles) {
      const lifeR = sp.life / sp.maxLife;
      const a = (1 - lifeR) * globalIntensity * 0.6;
      if (a <= 0.01) continue;
      const s = this.acquireSprite(this.sparklePool, this.blobTex, this.fxLayer);
      s.anchor.set(0.5, 0.5);
      s.position.set(sp.x, sp.y);
      s.width = sp.size * 4;
      s.height = sp.size * 4;
      s.tint = sp.tint;
      s.alpha = a;
    }
  }

  clear(): void {
    this.activeGlows.clear();
    this.fogWisps = [];
    this.sparkles = [];
    for (const s of this.wispPool) s.visible = false;
    for (const s of this.beamPool) s.visible = false;
    for (const s of this.flarePool) s.visible = false;
    for (const s of this.sparklePool) s.visible = false;
    this.hazeSprite.visible = false;
    this.glowSprite.visible = false;
    this.bandSprite.visible = false;
    this.coreSprite.visible = false;
    this.shimmerA.visible = false;
    this.shimmerB.visible = false;
  }

  dispose(): void {
    this.clear();
    this.beamTex.destroy(true);
    this.upBeamTex.destroy(true);
    this.blobTex.destroy(true);
    this.layer.destroy({ children: true });
  }
}
