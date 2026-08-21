import { Container, Graphics } from "pixi.js";
import type { FxAnimationFrame, FxDebugStats, FxNoteEvent, FxPieceLaunchEvent, FxPieceLockEvent, VisualFxConfig } from "./fx-types";
import { DEFAULT_VISUAL_FX_CONFIG, MAX_ACTIVE_PARTICLES, normalizeVisualFxConfig } from "./fx-types";
import { colorForPitch } from "./color-palette";
import { ParticlePool } from "./particle-pool";
import { GlowController } from "./glow-controller";
import { ImpactEffect } from "./impact-effect";
import { LightingController } from "./lighting-controller";

interface TrailState {
  x: number;
  y: number;
  color: number;
  intensity: number;
}

interface DemoPiece {
  id: string;
  midiNote: number;
  from: { x: number; y: number };
  target: { x: number; y: number };
  color: number;
  startMs: number;
  durationMs: number;
  launched: boolean;
  locked: boolean;
  graphic: Graphics;
  targetGraphic: Graphics;
}

export class VisualFxEngine {
  readonly layer = new Container();
  private readonly particlePool = new ParticlePool(MAX_ACTIVE_PARTICLES);
  private readonly glowController = new GlowController();
  private readonly impactEffect = new ImpactEffect();
  private readonly lightingController = new LightingController();
  private readonly demoLayer = new Container();
  private demoPieces: DemoPiece[] = [];
  private demoActive = false;
  private demoTimeMs = 0;
  private demoBackdrop: Graphics | undefined;
  private config: VisualFxConfig = DEFAULT_VISUAL_FX_CONFIG;
  private trails = new Map<string, TrailState>();
  private paused = false;
  private fps = 60;
  private lastEvent = "none";
  private transformMismatchCount = 0;

  constructor() {
    this.layer.addChild(this.lightingController.layer, this.demoLayer, this.particlePool.layer, this.glowController.layer, this.impactEffect.layer);
  }

  initialize(stage: Container, config?: Partial<VisualFxConfig>): void {
    this.config = normalizeVisualFxConfig(config);
    this.layer.visible = this.config.enabled;
    if (!this.layer.parent) stage.addChild(this.layer);
  }

  setConfig(config: Partial<VisualFxConfig>): void {
    const wasDemoActive = this.demoActive;
    this.config = normalizeVisualFxConfig({ ...this.config, ...config });
    this.layer.visible = this.config.enabled;
    if (wasDemoActive) this.startDemo();
  }

  onNoteOn(event: FxNoteEvent): void {
    if (!this.config.enabled) return;
    const intensity = this.config.glowIntensity * (0.35 + Math.max(0, Math.min(1, event.normalizedVelocity)) * 0.65);
    const color = colorForPitch(this.config.palette, event.midiNote);
    if (this.config.glowEnabled) this.glowController.add(event.position, color, intensity, this.config.glowDurationMs + Math.min(700, event.durationMs * 0.15), event.midiNote < 48 ? 30 : 22);
    this.lightingController.noteOn(event.midiNote, event.normalizedVelocity);
    this.lastEvent = `note-on:${event.midiNote}`;
  }

  onNoteOff(): void {
    this.lastEvent = "note-off";
  }

  onPieceLaunch(event: FxPieceLaunchEvent): void {
    if (!this.config.enabled) return;
    const color = colorForPitch(this.config.palette, event.midiNote);
    this.trails.set(event.pieceId, { x: event.position.x, y: event.position.y, color, intensity: event.intensity });
    if (this.config.particlesEnabled && this.config.trailEnabled) this.emitTrail(event.position, event.targetPosition, color, event.intensity);
    this.lastEvent = `launch:${event.pieceId}`;
  }

  onPieceLock(event: FxPieceLockEvent): void {
    if (!this.config.enabled) return;
    const color = colorForPitch(this.config.palette, event.midiNote);
    if (this.config.lockImpactEnabled) this.impactEffect.add(event.position, color, this.config.impactIntensity * event.intensity);
    if (this.config.particlesEnabled) this.emitSparkles(event.position, color, event.intensity);
    this.trails.delete(event.pieceId);
    this.lastEvent = `lock:${event.pieceId}`;
  }

  startDemo(): void {
    this.clearDemo();
    this.demoActive = true;
    this.demoTimeMs = 0;
    this.demoBackdrop = new Graphics()
      .roundRect(44, 72, 992, 820, 28)
      .fill({ color: 0x101a39, alpha: 0.72 })
      .stroke({ color: 0x5f83d8, width: 2, alpha: 0.4 })
      .roundRect(70, 1050, 940, 720, 28)
      .fill({ color: 0x0b112a, alpha: 0.55 })
      .stroke({ color: 0x344d8a, width: 1, alpha: 0.35 });
    this.demoLayer.addChild(this.demoBackdrop);
    const notes = [40, 52, 60, 67, 76, 88];
    const colors = notes.map((note) => colorForPitch(this.config.palette, note));
    notes.forEach((midiNote, index) => {
      const from = { x: 150 + index * 150, y: 1570 + (index % 2) * 80 };
      const target = { x: 170 + index * 145, y: 170 + (index % 3) * 210 };
      const targetGraphic = this.createDemoPieceGraphic(colors[index], true);
      targetGraphic.position.set(target.x, target.y);
      this.demoLayer.addChild(targetGraphic);
      const graphic = this.createDemoPieceGraphic(colors[index], false);
      graphic.position.set(from.x, from.y);
      this.demoLayer.addChild(graphic);
      this.demoPieces.push({
        id: `demo-piece-${index}`,
        midiNote,
        from,
        target,
        color: colors[index],
        startMs: index * 260,
        durationMs: 900,
        launched: false,
        locked: false,
        graphic,
        targetGraphic
      });
    });
    this.lastEvent = "demo-start";
  }

  stopDemo(): void {
    this.clearDemo();
    this.lastEvent = "demo-stop";
  }

  update(deltaSeconds: number, _playbackTimeMs: number, frames: FxAnimationFrame[] = []): void {
    const deltaMs = Math.max(0, Math.min(100, deltaSeconds * 1000));
    this.fps = this.fps * 0.92 + (1 / Math.max(0.001, deltaSeconds)) * 0.08;
    if (!this.paused && this.demoActive) this.updateDemo(deltaMs);
    if (!this.config.enabled) return;
    this.lightingController.setPaused(this.paused);
    this.lightingController.update(deltaSeconds, this.config);
    this.glowController.update(deltaMs);
    this.impactEffect.update(deltaMs);
    if (!this.paused) this.particlePool.update(deltaSeconds);
    if (this.config.trailEnabled && this.config.particlesEnabled) {
      for (const frame of frames) {
        if (frame.state !== "moving") continue;
        const trail = this.trails.get(frame.pieceId);
        if (!trail) continue;
        const position = frame.currentPosition;
        const distance = Math.hypot(position.x - trail.x, position.y - trail.y);
        if (distance > 3) {
          this.emitTrail(position, trail, trail.color, trail.intensity);
          trail.x = position.x;
          trail.y = position.y;
        }
      }
    }
  }

  onPause(): void {
    this.paused = true;
    this.lightingController.setPaused(true);
  }

  onResume(): void {
    this.paused = false;
    this.lightingController.setPaused(false);
  }

  onSeek(): void {
    this.clearTransient();
    this.lastEvent = "seek";
  }

  reset(): void {
    this.clearTransient();
    this.clearDemo();
    this.lightingController.clear();
    this.lastEvent = "reset";
  }

  getStats(): FxDebugStats {
    return {
      activeParticles: this.particlePool.activeCount,
      maxActiveParticles: MAX_ACTIVE_PARTICLES,
      activeGlows: this.glowController.activeCount,
      activeImpacts: this.impactEffect.activeCount,
      droppedParticles: this.particlePool.droppedCount,
      lastFxEvent: this.lastEvent,
      estimatedFps: Math.round(this.fps),
      transformMismatchCount: this.transformMismatchCount
    };
  }

  dispose(): void {
    this.clearTransient();
    this.particlePool.dispose();
    this.glowController.dispose();
    this.impactEffect.dispose();
    this.lightingController.dispose();
    this.layer.destroy({ children: false });
  }

  private clearTransient(): void {
    this.particlePool.clear();
    this.glowController.clear();
    this.impactEffect.clear();
    this.trails.clear();
  }

  private updateDemo(deltaMs: number): void {
    this.demoTimeMs += deltaMs;
    for (const piece of this.demoPieces) {
      if (this.demoTimeMs < piece.startMs) continue;
      if (!piece.launched) {
        piece.launched = true;
        this.onNoteOn({
          id: piece.id,
          midiNote: piece.midiNote,
          velocity: 72 + piece.midiNote % 50,
          normalizedVelocity: (72 + piece.midiNote % 50) / 127,
          position: piece.from,
          durationMs: piece.durationMs,
          playbackTimeMs: this.demoTimeMs
        });
        this.onPieceLaunch({
          pieceId: piece.id,
          position: piece.from,
          targetPosition: piece.target,
          midiNote: piece.midiNote,
          intensity: 0.65 + (piece.midiNote % 30) / 100,
          playbackTimeMs: this.demoTimeMs
        });
      }
      const progress = Math.min(1, Math.max(0, (this.demoTimeMs - piece.startMs) / piece.durationMs));
      const eased = 1 - Math.pow(1 - progress, 3);
      const x = piece.from.x + (piece.target.x - piece.from.x) * eased;
      const y = piece.from.y + (piece.target.y - piece.from.y) * eased;
      piece.graphic.position.set(x, y);
      piece.graphic.rotation = Math.sin(progress * Math.PI) * 0.05;
      if (progress >= 1 && !piece.locked) {
        piece.locked = true;
        this.onPieceLock({ pieceId: piece.id, position: piece.target, midiNote: piece.midiNote, intensity: 0.9, playbackTimeMs: this.demoTimeMs });
      }
    }
    if (this.demoTimeMs > 4200) this.startDemo();
  }

  private clearDemo(): void {
    this.demoActive = false;
    this.demoTimeMs = 0;
    this.demoPieces = [];
    this.demoLayer.removeChildren().forEach((child) => child.destroy());
    this.demoBackdrop = undefined;
  }

  private createDemoPieceGraphic(color: number, target: boolean): Graphics {
    const graphic = new Graphics();
    const fillAlpha = target ? 0.11 : 0.88;
    const strokeAlpha = target ? 0.5 : 0.8;
    graphic.poly([
      { x: -48, y: -34 }, { x: -18, y: -34 }, { x: -8, y: -48 }, { x: 8, y: -34 },
      { x: 48, y: -34 }, { x: 48, y: 34 }, { x: 12, y: 34 }, { x: 0, y: 48 },
      { x: -12, y: 34 }, { x: -48, y: 34 }
    ])
      .fill({ color, alpha: fillAlpha })
      .stroke({ color: target ? color : 0xffffff, width: target ? 2 : 2.5, alpha: strokeAlpha });
    return graphic;
  }

  private emitTrail(position: { x: number; y: number }, target: { x: number; y: number } | TrailState, color: number, intensity: number): void {
    const dx = target.x - position.x;
    const dy = target.y - position.y;
    const distance = Math.hypot(dx, dy) || 1;
    const count = Math.max(1, Math.round(2 + this.config.particleDensity * 14 * this.config.trailLength));
    for (let i = 0; i < count; i += 1) {
      const spread = (Math.random() - 0.5) * 18;
      this.particlePool.acquire(
        { x: position.x + (dx / distance) * spread, y: position.y + (dy / distance) * spread },
        { x: -dx / distance * (12 + Math.random() * 18), y: -dy / distance * (12 + Math.random() * 18) },
        this.config.particleLifetimeMs,
        color,
        0.8 + intensity * 1.4
      );
    }
  }

  private emitSparkles(position: { x: number; y: number }, color: number, intensity: number): void {
    const count = Math.max(2, Math.round(3 + this.config.particleDensity * 8));
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count;
      this.particlePool.acquire(
        { x: position.x, y: position.y },
        { x: Math.cos(angle) * (18 + intensity * 22), y: Math.sin(angle) * (18 + intensity * 22) },
        Math.min(500, this.config.particleLifetimeMs + 100),
        color,
        0.7 + intensity
      );
    }
  }
}
