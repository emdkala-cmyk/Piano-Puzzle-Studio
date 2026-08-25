import { BlurFilter, Container, Graphics } from "pixi.js";
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

/**
 * A horizontal fog wisp that drifts along the glow line.
 * Elongated horizontally, soft, and continuous.
 */
interface FogWisp {
  x: number;        // center x position along the line
  y: number;        // vertical offset above the line
  driftSpeed: number; // horizontal drift speed (px/sec)
  life: number;     // current age
  maxLife: number;   // total lifetime
  width: number;     // horizontal length of the wisp
  height: number;    // vertical thickness
  alpha: number;     // base alpha
  color: number;     // tint color
  turbulence: number; // vertical wobble amount
}

interface SparkleDot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
}

/**
 * Cinematic keyboard glow with:
 * - GPU-blurred ambient line (genuine soft glow)
 * - Horizontal fog wisps drifting along the line (like dry ice)
 * - Active key beams with flare
 * - Energy wave traveling dot
 */
export class KeyboardGlowController {
  readonly layer = new Container();

  // Sub-layers
  private readonly ambientLayer = new Container();
  private readonly ambientGfx = new Graphics();
  private readonly fogLayer = new Container();
  private readonly fogGfx = new Graphics();
  private readonly coreLayer = new Container();
  private readonly coreGfx = new Graphics();
  private readonly beamLayer = new Container();
  private readonly beamGfx = new Graphics();
  private readonly fxLayer = new Container();
  private readonly fxGfx = new Graphics();

  private readonly blurFilter = new BlurFilter();

  private keyAnchors: KeyGlowAnchor[] = [];
  private activeGlows = new Map<number, ActiveKeyGlow>();

  // --- Parameters ---
  private thickness = 4;
  private spread = 60;
  private softness = 0.7;
  private dissolveSpeed = 1.5;
  private pulseAmount = 0.4;

  private paused = false;
  private time = 0;
  private fogWisps: FogWisp[] = [];
  private sparkles: SparkleDot[] = [];
  private static readonly MAX_FOG = 80;
  private static readonly MAX_SPARKLES = 40;

  // Fog spawn accumulator
  private fogSpawnTimer = 0;
  private fogSpawnInterval = 0.04; // spawn a new wisp every 40ms

  constructor() {
    // Build layer hierarchy (bottom to top)
    this.layer.addChild(this.ambientLayer);
    this.layer.addChild(this.fogLayer);
    this.layer.addChild(this.coreLayer);
    this.layer.addChild(this.beamLayer);
    this.layer.addChild(this.fxLayer);

    this.ambientLayer.addChild(this.ambientGfx);
    this.fogLayer.addChild(this.fogGfx);
    this.coreLayer.addChild(this.coreGfx);
    this.beamLayer.addChild(this.beamGfx);
    this.fxLayer.addChild(this.fxGfx);

    // BlurFilter for the ambient glow layer
    this.blurFilter.quality = 3;
    this.blurFilter.padding = 200;
    this.ambientLayer.filters = [this.blurFilter];
  }

  setKeyAnchors(anchors: KeyGlowAnchor[]): void {
    this.keyAnchors = anchors.slice().sort((a, b) => a.topPoint.x - b.topPoint.x);
  }

  applySettings(
    thickness: number,
    spread: number,
    softness: number,
    dissolveSpeed: number,
    pulseAmount: number,
    beamIntensity = 1.0
  ): void {
    this.thickness = clamp(thickness, 0.5, 20);
    this.spread = clamp(spread, 5, 250);
    this.softness = clamp(softness, 0, 1);
    this.dissolveSpeed = clamp(dissolveSpeed, 0.1, 8);
    this.pulseAmount = clamp(pulseAmount, 0, 1);
    this.blurFilter.strength = this.softness * 40;
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
    // Spawn a burst of fog wisps at the hit key
    const anchor = this.keyAnchors.find((a) => a.midiNote === midiNote);
    if (anchor) {
      const burst = Math.floor(3 + intensity * 5);
      for (let i = 0; i < burst; i++) {
        this.spawnFogWisp(anchor.topPoint, anchor.width, color, intensity, true);
      }
      // Sparkles
      const sparkleCount = Math.floor(intensity * 3);
      for (let i = 0; i < sparkleCount; i++) {
        this.spawnSparkle(anchor.topPoint, anchor.width, color);
      }
    }
  }

  /**
   * Spawn a horizontal fog wisp.
   * @param burst If true, spawns with upward velocity (from a key hit).
   *              If false, spawns as ambient drifting fog.
   */
  private spawnFogWisp(p: Point, width: number, color: number, intensity: number, burst: boolean): void {
    if (this.fogWisps.length >= KeyboardGlowController.MAX_FOG) return;

    const driftDir = Math.random() > 0.5 ? 1 : -1; // drift left or right
    const speed = burst ? (30 + Math.random() * 50) : (8 + Math.random() * 18);

    this.fogWisps.push({
      x: p.x + (Math.random() - 0.5) * width * 2,
      y: p.y - (burst ? Math.random() * 15 : 3 + Math.random() * 12),
      driftSpeed: speed * driftDir,
      life: 0,
      maxLife: 1.5 + Math.random() * 2.5,
      width: 40 + Math.random() * 80 + (burst ? intensity * 60 : 0),
      height: 6 + Math.random() * 14 + (burst ? intensity * 8 : 0),
      alpha: 0.15 + intensity * 0.2 + Math.random() * 0.1,
      color,
      turbulence: 1 + Math.random() * 3
    });
  }

  private spawnSparkle(p: Point, width: number, color: number): void {
    if (this.sparkles.length >= KeyboardGlowController.MAX_SPARKLES) return;
    const angle = Math.random() * Math.PI * 2;
    const speed = 15 + Math.random() * 30;
    this.sparkles.push({
      x: p.x + (Math.random() - 0.5) * width,
      y: p.y - Math.random() * this.spread * 0.2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 10,
      life: 0,
      maxLife: 0.15 + Math.random() * 0.3,
      size: 0.5 + Math.random() * 1.5,
      color
    });
  }

  update(deltaSeconds: number, enabled: boolean, globalIntensity: number): void {
    if (!this.paused) {
      this.time += deltaSeconds;

      // Decay active glows
      for (const [note, state] of this.activeGlows.entries()) {
        state.intensity -= this.dissolveSpeed * deltaSeconds;
        if (state.intensity <= 0.005) this.activeGlows.delete(note);
      }

      // --- FOG WISP UPDATE ---
      // Spawn ambient fog continuously along the line
      this.fogSpawnTimer += deltaSeconds;
      if (this.keyAnchors.length >= 2 && this.fogSpawnTimer >= this.fogSpawnInterval) {
        this.fogSpawnTimer = 0;
        const firstP = this.keyAnchors[0].topPoint;
        const lastP = this.keyAnchors[this.keyAnchors.length - 1].topPoint;
        // Random position along the line
        const rx = firstP.x + Math.random() * (lastP.x - firstP.x);
        this.fogWisps.push({
          x: rx,
          y: firstP.y - 3 - Math.random() * 10,
          driftSpeed: (5 + Math.random() * 12) * (Math.random() > 0.5 ? 1 : -1),
          life: 0,
          maxLife: 2 + Math.random() * 3,
          width: 30 + Math.random() * 60,
          height: 4 + Math.random() * 10,
          alpha: 0.06 + Math.random() * 0.08,
          color: 0xccddff,
          turbulence: 0.5 + Math.random() * 2
        });
      }

      // Update fog wisps
      for (let i = this.fogWisps.length - 1; i >= 0; i--) {
        const w = this.fogWisps[i];
        w.life += deltaSeconds;
        if (w.life >= w.maxLife) { this.fogWisps.splice(i, 1); continue; }
        w.x += w.driftSpeed * deltaSeconds;
        // Gentle vertical turbulence
        w.y += Math.sin(this.time * 1.5 + i * 0.7) * w.turbulence * deltaSeconds;
        // Expand slightly as they age
        w.width *= 1 + 0.15 * deltaSeconds;
        w.height *= 1 + 0.1 * deltaSeconds;
      }

      // Update sparkles
      for (let i = this.sparkles.length - 1; i >= 0; i--) {
        const sp = this.sparkles[i];
        sp.life += deltaSeconds;
        if (sp.life >= sp.maxLife) { this.sparkles.splice(i, 1); continue; }
        sp.x += sp.vx * deltaSeconds;
        sp.y += sp.vy * deltaSeconds;
        sp.vy += 25 * deltaSeconds;
      }
    }

    // === CLEAR ALL ===
    this.ambientGfx.clear();
    this.fogGfx.clear();
    this.coreGfx.clear();
    this.beamGfx.clear();
    this.fxGfx.clear();

    if (!enabled || this.keyAnchors.length < 2) return;

    const t = this.time;
    const firstP = this.keyAnchors[0].topPoint;
    const lastP = this.keyAnchors[this.keyAnchors.length - 1].topPoint;
    const cy = firstP.y;
    const lineLen = lastP.x - firstP.x;

    // === BREATHING PULSE ===
    const pulse = 1 - this.pulseAmount * 0.3 * Math.sin(t * 2.0);

    // === AMBIENT GLOW (GPU blurred) ===
    const ambientWidth = this.spread * 2 * pulse;
    this.ambientGfx
      .moveTo(firstP.x, cy)
      .lineTo(lastP.x, cy)
      .stroke({ color: 0x4499ee, width: ambientWidth, alpha: 0.45 * globalIntensity, cap: "round" });
    this.ambientGfx
      .moveTo(firstP.x, cy)
      .lineTo(lastP.x, cy)
      .stroke({ color: 0x88ccff, width: ambientWidth * 0.35, alpha: 0.55 * globalIntensity, cap: "round" });

    // === HORIZONTAL FOG WISPS ===
    for (const w of this.fogWisps) {
      const lifeRatio = w.life / w.maxLife;
      // Fade in fast, fade out slow
      const fadeIn = Math.min(1, lifeRatio * 4);
      const fadeOut = Math.max(0, 1 - Math.pow(lifeRatio, 1.5));
      const a = w.alpha * fadeIn * fadeOut * globalIntensity;
      if (a <= 0.002) continue;

      // Draw an elongated horizontal ellipse (approximated with rect + rounded corners via multiple rects)
      // Main body
      this.fogGfx.rect(w.x - w.width / 2, w.y - w.height / 2, w.width, w.height)
        .fill({ color: w.color, alpha: a * 0.6 });

      // Inner brighter core (narrower, brighter)
      this.fogGfx.rect(w.x - w.width * 0.3, w.y - w.height * 0.3, w.width * 0.6, w.height * 0.6)
        .fill({ color: 0xffffff, alpha: a * 0.2 });

      // Top highlight edge (thin bright line at top of wisp)
      this.fogGfx.rect(w.x - w.width * 0.4, w.y - w.height * 0.45, w.width * 0.8, 1)
        .fill({ color: 0xffffff, alpha: a * 0.3 });
    }

    // === CORE LINE (sharp) ===
    const coreAlpha = globalIntensity * (0.85 + 0.15 * Math.sin(t * 4.0));
    this.coreGfx
      .moveTo(firstP.x, cy)
      .lineTo(lastP.x, cy)
      .stroke({ color: 0xffffff, width: this.thickness, alpha: clamp(coreAlpha, 0, 1), cap: "round" });

    // === ENERGY WAVE ===
    const wavePos = ((t * 2.2) % 1.0);
    const waveX = firstP.x + wavePos * lineLen;
    this.fxGfx.circle(waveX, cy, this.thickness * 2).fill({ color: 0xffffff, alpha: 0.5 * globalIntensity });
    for (let ti = 1; ti <= 6; ti++) {
      const tx = waveX - ti * (lineLen * 0.04);
      if (tx < firstP.x) break;
      this.fxGfx.circle(tx, cy + Math.sin(t * 10 + ti) * 1.5, this.thickness * 0.6)
        .fill({ color: 0x88ccff, alpha: (1 - ti / 6) * 0.25 * globalIntensity });
    }
    const wave2Pos = ((t * 1.5 + 0.4) % 1.0);
    const wave2X = lastP.x - wave2Pos * lineLen;
    this.fxGfx.circle(wave2X, cy, this.thickness).fill({ color: 0xaaddff, alpha: 0.3 * globalIntensity });

    // === BEAMS per active key ===
    for (const anchor of this.keyAnchors) {
      const state = this.activeGlows.get(anchor.midiNote);
      if (!state || state.intensity <= 0.01) continue;

      const p = anchor.topPoint;
      const kw = anchor.width;
      const alpha = clamp(state.intensity * globalIntensity, 0, 1);
      const beamH = this.spread * 1.5 * (0.5 + state.intensity * 0.5);
      const age = this.time - state.birthTime;
      const flicker = 0.8 + 0.2 * Math.sin(age * 14 + anchor.midiNote);

      // Outer haze
      this.beamGfx.rect(p.x - kw * 0.9, p.y - beamH * 1.2, kw * 1.8, beamH * 1.2)
        .fill({ color: state.color, alpha: alpha * 0.06 * flicker });
      // Mid
      this.beamGfx.rect(p.x - kw * 0.5, p.y - beamH, kw, beamH)
        .fill({ color: state.color, alpha: alpha * 0.2 * flicker });
      // Inner
      this.beamGfx.rect(p.x - kw * 0.25, p.y - beamH * 0.6, kw * 0.5, beamH * 0.6)
        .fill({ color: 0xffffff, alpha: alpha * 0.15 * flicker });
      // Base hotspot
      this.beamGfx.rect(p.x - kw * 0.35, p.y - this.thickness * 2.5, kw * 0.7, this.thickness * 5)
        .fill({ color: 0xffffff, alpha: alpha * 0.9 * flicker });
      // Radial flare
      this.beamGfx.circle(p.x, p.y, kw * 2.0)
        .fill({ color: state.color, alpha: alpha * 0.1 * flicker });
    }

    // === SPARKLE DOTS ===
    for (const sp of this.sparkles) {
      const lifeR = sp.life / sp.maxLife;
      const a = (1 - lifeR) * globalIntensity * 0.7;
      if (a <= 0.01) continue;
      this.fxGfx.circle(sp.x, sp.y, sp.size).fill({ color: sp.color, alpha: a });
    }
  }

  clear(): void {
    this.activeGlows.clear();
    this.fogWisps = [];
    this.sparkles = [];
    this.ambientGfx.clear();
    this.fogGfx.clear();
    this.coreGfx.clear();
    this.beamGfx.clear();
    this.fxGfx.clear();
  }

  dispose(): void {
    this.clear();
    this.layer.destroy({ children: true });
  }
}
