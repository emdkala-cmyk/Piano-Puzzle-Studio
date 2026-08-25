import { Container, Graphics } from "pixi.js";
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
  decaySpeed: number;
}

export class KeyboardGlowController {
  readonly layer = new Container();
  private readonly gfx = new Graphics();
  private keyAnchors: KeyGlowAnchor[] = [];
  private activeGlows = new Map<number, ActiveKeyGlow>();

  private lineWidth = 3.5;
  private glowHeight = 90;
  private ambientAlpha = 0.6;
  private decaySpeed = 1.6;
  private beamIntensity = 1.0;
  private paused = false;

  constructor() {
    this.layer.addChild(this.gfx);
  }

  setKeyAnchors(anchors: KeyGlowAnchor[]): void {
    this.keyAnchors = anchors.slice().sort((a, b) => a.topPoint.x - b.topPoint.x);
  }

  applySettings(
    lineWidth: number,
    glowHeight: number,
    ambientAlpha: number,
    decaySpeed: number,
    beamIntensity = 1.0
  ): void {
    this.lineWidth = Math.max(1, lineWidth);
    this.glowHeight = Math.max(10, glowHeight);
    this.ambientAlpha = clamp(ambientAlpha, 0, 1);
    this.decaySpeed = Math.max(0.1, decaySpeed);
    this.beamIntensity = Math.max(0, beamIntensity);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  hitKeyByNote(midiNote: number, color: number, velocity: number): void {
    const existing = this.activeGlows.get(midiNote);
    const intensity = clamp(0.4 + velocity * 0.6);
    if (!existing || intensity > existing.intensity) {
      this.activeGlows.set(midiNote, {
        intensity,
        color,
        decaySpeed: this.decaySpeed
      });
    }
  }

  update(deltaSeconds: number, enabled: boolean, globalIntensity: number): void {
    if (!this.paused) {
      for (const [note, state] of this.activeGlows.entries()) {
        state.intensity -= state.decaySpeed * deltaSeconds;
        if (state.intensity <= 0.005) {
          this.activeGlows.delete(note);
        }
      }
    }

    this.gfx.clear();
    if (!enabled || this.keyAnchors.length < 2) return;

    const totalKeys = this.keyAnchors.length;
    const firstP = this.keyAnchors[0].topPoint;
    const lastP = this.keyAnchors[totalKeys - 1].topPoint;

    // Layer 1: Outer ambient glow line
    this.gfx
      .moveTo(firstP.x, firstP.y)
      .lineTo(lastP.x, lastP.y)
      .stroke({
        color: 0x55d9ff,
        width: this.lineWidth * 3.5,
        alpha: this.ambientAlpha * 0.35 * globalIntensity
      });

    // Layer 2: Core neon stroke
    this.gfx
      .moveTo(firstP.x, firstP.y)
      .lineTo(lastP.x, lastP.y)
      .stroke({
        color: 0xffffff,
        width: this.lineWidth,
        alpha: this.ambientAlpha * 0.85 * globalIntensity
      });

    // Dynamic vertical beams per active key
    for (const anchor of this.keyAnchors) {
      const state = this.activeGlows.get(anchor.midiNote);
      if (!state || state.intensity <= 0.01) continue;

      const p = anchor.topPoint;
      const kw = anchor.width;
      const alpha = clamp(state.intensity * globalIntensity * this.beamIntensity, 0, 1);
      const beamHeight = this.glowHeight * (0.6 + state.intensity * 0.5);

      // Vertical light beam
      this.gfx
        .rect(p.x - kw * 0.45, p.y - beamHeight, kw * 0.9, beamHeight)
        .fill({ color: state.color, alpha: alpha * 0.35 });

      // Core hotspot
      this.gfx
        .rect(p.x - kw * 0.4, p.y - this.lineWidth * 2, kw * 0.8, this.lineWidth * 4)
        .fill({ color: 0xffffff, alpha: alpha * 0.95 });

      // Side flare
      this.gfx
        .circle(p.x, p.y, kw * 1.5)
        .fill({ color: state.color, alpha: alpha * 0.25 });
    }
  }

  clear(): void {
    this.activeGlows.clear();
    this.gfx.clear();
  }

  dispose(): void {
    this.clear();
    this.layer.destroy({ children: true });
  }
}