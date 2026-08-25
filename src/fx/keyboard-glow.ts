import { Container, Graphics } from "pixi.js";
import { clamp } from "./fx-types";

const SEGMENT_COUNT = 88;

interface Segment {
  intensity: number;
  color: number;
}

export class KeyboardGlowController {
  readonly layer = new Container();
  private readonly gfx = new Graphics();
  private segments: Segment[] = [];
  private compositionWidth = 1080;
  private compositionHeight = 1920;
  private pianoTopY = 960;
  private lineWidth = 3;
  private glowHeight = 80;
  private ambientAlpha = 0.5;
  private decaySpeed = 1.4;
  private paused = false;

  constructor() {
    this.layer.addChild(this.gfx);
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      this.segments.push({ intensity: 0, color: 0xffffff });
    }
  }

  setSize(width: number, height: number, pianoTopY: number): void {
    this.compositionWidth = width;
    this.compositionHeight = height;
    this.pianoTopY = pianoTopY;
  }

  applySettings(lineWidth: number, glowHeight: number, ambientAlpha: number, decaySpeed: number): void {
    this.lineWidth = lineWidth;
    this.glowHeight = glowHeight;
    this.ambientAlpha = ambientAlpha;
    this.decaySpeed = decaySpeed;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  hitKey(x: number, color: number, intensity: number): void {
    const segWidth = this.compositionWidth / SEGMENT_COUNT;
    const segIndex = Math.floor(x / segWidth);
    for (let offset = -2; offset <= 2; offset += 1) {
      const i = segIndex + offset;
      if (i < 0 || i >= SEGMENT_COUNT) continue;
      const falloff = 1 - Math.abs(offset) * 0.3;
      const add = clamp(intensity * falloff);
      const seg = this.segments[i];
      if (add > seg.intensity) {
        seg.intensity = clamp(Math.min(1, seg.intensity + add));
        seg.color = color;
      }
    }
  }

  update(deltaSeconds: number, enabled: boolean, glowIntensity: number): void {
    if (!this.paused) {
      for (const seg of this.segments) {
        seg.intensity = Math.max(0, seg.intensity - this.decaySpeed * deltaSeconds);
      }
    }
    this.gfx.clear();
    if (!enabled) return;
    const baseY = this.pianoTopY;
    this.gfx.rect(0, baseY - 1, this.compositionWidth, 2).fill({ color: 0x55d9ff, alpha: this.ambientAlpha });
    const segWidth = this.compositionWidth / SEGMENT_COUNT;
    const halfLine = this.lineWidth / 2;
    for (let i = 0; i < SEGMENT_COUNT; i += 1) {
      const seg = this.segments[i];
      if (seg.intensity <= 0.01) continue;
      const x0 = i * segWidth;
      const x1 = (i + 1) * segWidth;
      const alpha = clamp(seg.intensity * glowIntensity, 0, 0.95);
      this.gfx.rect(x0, baseY - halfLine, x1 - x0, this.lineWidth).fill({ color: 0xffffff, alpha: alpha * 0.9 });
      const glowAlpha = alpha * 0.4;
      const glowY = baseY - this.glowHeight;
      const glowH = this.glowHeight - halfLine;
      this.gfx.rect(x0, glowY, x1 - x0, glowH).fill({ color: seg.color, alpha: glowAlpha * 0.25 });
      const outerAlpha = alpha * 0.12;
      this.gfx.rect(x0 - segWidth * 0.3, glowY - this.glowHeight * 0.4, (x1 - x0) + segWidth * 0.6, this.glowHeight * 0.8).fill({ color: seg.color, alpha: outerAlpha });
    }
  }

  clear(): void {
    for (const seg of this.segments) { seg.intensity = 0; }
    this.gfx.clear();
  }

  dispose(): void {
    this.clear();
    this.layer.destroy({ children: true });
  }
}