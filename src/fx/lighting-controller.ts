import { Container, Graphics } from "pixi.js";
import { clamp, type VisualFxConfig } from "./fx-types";

export class LightingController {
  readonly layer = new Container();
  private readonly vignette = new Graphics();
  private bassEnergy = 0;
  private highEnergy = 0;
  private paused = false;
  private width = 1080;
  private height = 1920;

  constructor() {
    this.layer.addChild(this.vignette);
  }

  setSize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
  }

  noteOn(midiNote: number, velocity: number): void {
    if (midiNote < 48) this.bassEnergy = Math.min(1, this.bassEnergy + velocity * 0.5);
    if (midiNote >= 84) this.highEnergy = Math.min(1, this.highEnergy + velocity * 0.35);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  update(deltaSeconds: number, config: VisualFxConfig): void {
    if (!this.paused) {
      this.bassEnergy *= Math.pow(0.08, deltaSeconds);
      this.highEnergy *= Math.pow(0.18, deltaSeconds);
    }
    const alpha = config.lightingEnabled && config.enabled
      ? config.lightingIntensity * clamp(0.15 + this.bassEnergy * 0.35 + this.highEnergy * 0.2, 0, 0.65)
      : 0;
    const pulse = clamp(0.55 + this.bassEnergy * 0.45, 0, 1);
    this.vignette.clear()
      .rect(0, 0, this.width, this.height)
      .fill({ color: 0x5c77d6, alpha: alpha * 0.06 * pulse })
      .stroke({ color: 0xffd98a, width: 2, alpha: alpha * 0.12 });
  }

  clear(): void {
    this.bassEnergy = 0;
    this.highEnergy = 0;
    this.vignette.clear();
  }

  dispose(): void {
    this.clear();
    this.layer.destroy({ children: true });
  }
}
