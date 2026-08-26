import { Container, Sprite, Texture } from "pixi.js";
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

  private keyAnchors: KeyGlowAnchor[] = [];
  private activeGlows = new Map<number, ActiveKeyGlow>();

  private thickness = 4;
  private spread = 60;
  private softness = 0.7;
  private dissolveSpeed = 1.5;
  private pulseAmount = 0.4;
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

    // Hide all ambient sprites until setKeyAnchors positions them correctly
    this.hazeSprite.visible = false;
    this.glowSprite.visible = false;
    this.bandSprite.visible = false;
    this.coreSprite.visible = false;
    this.shimmerA.visible = false;
    this.shimmerB.visible = false;
  }

  setKeyAnchors(anchors: KeyGlowAnchor[]): void {
    // Detect if the glow bar has moved significantly (piano zoom/position changed)
    const oldCy = this.keyAnchors.length > 0 ? this.keyAnchors[0].topPoint.y : -9999;
    const oldCx = this.keyAnchors.length > 0 ? (this.keyAnchors[0].topPoint.x + this.keyAnchors[this.keyAnchors.length - 1].topPoint.x) / 2 : -9999;
    this.keyAnchors = anchors.slice().sort((a, b) => a.topPoint.x - b.topPoint.x);
    if (this.keyAnchors.length >= 2) {
      const newCy = this.keyAnchors[0].topPoint.y;
      const newCx = (this.keyAnchors[0].topPoint.x + this.keyAnchors[this.keyAnchors.length - 1].topPoint.x) / 2;
      const moved = Math.abs(newCy - oldCy) > 2 || Math.abs(newCx - oldCx) > 2;
      if (moved) {
        // Clear ALL old particles so no ghost remains at the previous position
        this.fogWisps = [];
        this.sparkles = [];
        this.activeGlows.clear();
      }
    }
    this.renderBar(1.0, this.isEnabled);
  }

  applySettings(
    thickness: number,
    spread: number,
    softness: number,
    dissolveSpeed: number,
    pulseAmount: number,
    beamIntensity = 1.0,
    enabled = true
  ): void {
    this.thickness = clamp(thickness, 0.5, 20);
    this.spread = clamp(spread, 5, 250);
    this.softness = clamp(softness, 0, 1);
    this.dissolveSpeed = clamp(dissolveSpeed, 0.1, 8);
    this.pulseAmount = clamp(pulseAmount, 0, 1);
    this.isEnabled = enabled;
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
