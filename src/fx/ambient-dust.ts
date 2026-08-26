/**
 * Ambient atmospheric dust — tiny particles floating in the scene like embers/dust.
 *
 * These are persistent background particles that drift slowly, creating a cinematic
 * atmosphere. They respond to note events by momentarily brightening and change
 * color based on pitch when toneReactive is enabled.
 */

import { Container, Graphics } from "pixi.js";

interface DustParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;       // radius in pixels
  alpha: number;
  targetAlpha: number;
  life: number;       // current age ms
  maxLife: number;    // max lifetime ms
  color: number;
  wobblePhase: number;
  wobbleSpeed: number;
  wobbleAmp: number;
}

const MAX_DUST = 800;

export class AmbientDustSystem {
  readonly layer = new Container();
  private readonly gfx: Graphics;
  private particles: DustParticle[] = [];
  private density = 0.35;
  private enabled = true;
  private toneReactive = true;

  /** Scene bounds (composition coordinates). */
  private sceneW = 1080;
  private sceneH = 1920;

  /** Current tone color shift — updated from note events. */
  private toneShift = 0;

  constructor() {
    this.gfx = new Graphics();
    this.layer.addChild(this.gfx);
  }

  setBounds(w: number, h: number): void {
    this.sceneW = w;
    this.sceneH = h;
  }

  setDensity(d: number): void {
    this.density = Math.max(0, Math.min(1, d));
  }

  setEnabled(e: boolean): void {
    this.enabled = e;
    if (!e) {
      this.particles = [];
      this.gfx.clear();
    }
  }

  setToneReactive(r: boolean): void {
    this.toneReactive = r;
  }

  /** Call from onNoteOn — pitch determines tone shift. */
  noteHit(midiNote: number, velocity: number): void {
    // Shift the dust color toward warm (bass) or cool (treble)
    // MIDI 21 (A0) → low bass, MIDI 108 (C8) → high treble
    if (this.toneReactive) {
      this.toneShift = (midiNote - 60) / 48; // -0.8 to +0.8
    }
    // Boost nearby particles temporarily
    for (const p of this.particles) {
      const boost = Math.max(0, 1 - Math.hypot(p.x - this.sceneW / 2, p.y - this.sceneH / 2) / 600);
      if (boost > 0) {
        p.targetAlpha = Math.min(1, p.targetAlpha + boost * velocity * 0.3);
      }
    }
  }

  update(deltaMs: number): void {
    if (!this.enabled) {
      this.gfx.clear();
      return;
    }

    const dt = deltaMs / 1000;
    const targetCount = Math.round(MAX_DUST * this.density);

    // Spawn new particles
    while (this.particles.length < targetCount) {
      this.particles.push(this.spawnParticle());
    }

    // Update & cull
    const g = this.gfx;
    g.clear();

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += deltaMs;

      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }

      // Wobble movement
      p.wobblePhase += p.wobbleSpeed * dt;
      const wobbleX = Math.sin(p.wobblePhase) * p.wobbleAmp * dt;
      const wobbleY = Math.cos(p.wobblePhase * 0.7) * p.wobbleAmp * 0.5 * dt;

      p.x += (p.vx + wobbleX) * dt;
      p.y += (p.vy + wobbleY) * dt;

      // Wrap around scene bounds
      if (p.x < -20) p.x = this.sceneW + 20;
      if (p.x > this.sceneW + 20) p.x = -20;
      if (p.y < -20) p.y = this.sceneH + 20;
      if (p.y > this.sceneH + 20) p.y = -20;

      // Fade in / out
      const lifeRatio = p.life / p.maxLife;
      let fadeAlpha: number;
      if (lifeRatio < 0.15) {
        fadeAlpha = lifeRatio / 0.15; // fade in
      } else if (lifeRatio > 0.75) {
        fadeAlpha = (1 - lifeRatio) / 0.25; // fade out
      } else {
        fadeAlpha = 1;
      }
      p.alpha += (p.targetAlpha * fadeAlpha - p.alpha) * Math.min(1, 3 * dt);

      if (p.alpha < 0.01) continue;

      // Compute tone-shifted color
      const baseColor = p.color;
      const color = this.toneReactive
        ? this.shiftColor(baseColor, this.toneShift)
        : baseColor;

      // Draw dust particle — tiny circle with soft glow
      g.circle(p.x, p.y, p.size * 1.5);
      g.fill({ color, alpha: p.alpha * 0.2 });
      g.circle(p.x, p.y, p.size);
      g.fill({ color, alpha: p.alpha * 0.6 });
      g.circle(p.x, p.y, p.size * 0.4);
      g.fill({ color: 0xffffff, alpha: p.alpha * 0.4 });
    }

    // Remove excess
    while (this.particles.length > targetCount + 50) {
      this.particles.pop();
    }
  }

  clear(): void {
    this.particles = [];
    this.gfx.clear();
    this.toneShift = 0;
  }

  dispose(): void {
    this.clear();
    this.layer.destroy({ children: false });
  }

  private spawnParticle(): DustParticle {
    const w = this.sceneW;
    const h = this.sceneH;
    const isEmber = Math.random() < 0.3;
    const baseSize = isEmber ? 1.0 + Math.random() * 2.0 : 0.5 + Math.random() * 1.5;

    return {
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 8,  // slow drift
      vy: -2 - Math.random() * 6,      // float upward (like embers)
      size: baseSize,
      alpha: 0,
      targetAlpha: 0.2 + Math.random() * 0.5,
      life: 0,
      maxLife: 3000 + Math.random() * 8000,
      color: isEmber
        ? (Math.random() < 0.5 ? 0xff8844 : 0xffaa55)  // warm ember
        : (Math.random() < 0.5 ? 0xccbb99 : 0xddccaa),  // dusty white
      wobblePhase: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.5 + Math.random() * 1.5,
      wobbleAmp: 3 + Math.random() * 8,
    };
  }

  /** Shift a hex color toward warm (negative shift) or cool (positive shift). */
  private shiftColor(color: number, shift: number): number {
    if (shift === 0) return color;
    let r = (color >> 16) & 0xff;
    let g = (color >> 8) & 0xff;
    let b = color & 0xff;

    if (shift < 0) {
      // Warm: boost red/orange, reduce blue
      const amt = Math.abs(shift) * 0.3;
      r = Math.min(255, r + amt * 40);
      g = Math.min(255, g + amt * 15);
      b = Math.max(0, b - amt * 30);
    } else {
      // Cool: boost blue/cyan, reduce red
      const amt = shift * 0.3;
      r = Math.max(0, r - amt * 20);
      g = Math.min(255, g + amt * 10);
      b = Math.min(255, b + amt * 40);
    }

    return (r << 16) | (g << 8) | b;
  }
}
