import { Container, Graphics } from "pixi.js";
import type {
  FxAnimationFrame,
  FxDebugStats,
  FxNoteEvent,
  FxPieceLaunchEvent,
  FxPieceLockEvent,
  FxSmokeBehavior,
  FxSmokeLayer,
  VisualFxConfig
} from "./fx-types";
import {
  DEFAULT_VISUAL_FX_CONFIG,
  MAX_ACTIVE_PARTICLES,
  normalizeVisualFxConfig
} from "./fx-types";
import { colorForPitch } from "./color-palette";
import { ParticlePool } from "./particle-pool";
import { GlowController } from "./glow-controller";
import { ImpactEffect } from "./impact-effect";
import { LightingController } from "./lighting-controller";
import { SmokeController } from "./smoke-controller";
import { getFxPresetTuning } from "./fx-presets";
import { FxAssetPipeline } from "./asset-pipeline";
import { SeededRandom } from "./seeded-random";
import type { FxTextureId } from "./fx-asset-types";

interface TrailState {
  x: number;
  y: number;
  color: number;
  intensity: number;
  midiNote: number;
  points: Array<{ x: number; y: number; age: number }>;
  lastSmokeEmitMs: number;
  emissionIndex: number;
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
  control: { x: number; y: number };
  lastPosition: { x: number; y: number };
  pulseMs: number;
  graphic: Graphics;
  targetGraphic: Graphics;
}

export class VisualFxEngine {
  readonly layer = new Container();
  private readonly particlePool = new ParticlePool(MAX_ACTIVE_PARTICLES);
  private readonly glowController = new GlowController();
  private readonly impactEffect = new ImpactEffect();
  private readonly lightingController = new LightingController();
  private readonly smokeController = new SmokeController();
  private readonly assetPipeline = new FxAssetPipeline();
  private readonly demoLayer = new Container();
  private readonly ribbonLayer = new Graphics();
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
  private random = new SeededRandom("piano-puzzle-fx");
  private particleSpawnsThisFrame = 0;
  private smokeSpawnsThisFrame = 0;
  private lastFrameParticleSpawns = 0;
  private lastFrameSmokeSpawns = 0;
  private budgetDroppedParticles = 0;
  private budgetDroppedSmoke = 0;
  private droppedByPoolCapacity = 0;
  private droppedByFrameBudget = 0;
  private droppedByInvalidEvent = 0;
  private droppedByInactiveState = 0;
  private lastTrailTexture: FxTextureId = "dust-mote";

  constructor() {
    this.layer.addChild(this.lightingController.layer, this.smokeController.layer, this.demoLayer, this.ribbonLayer, this.particlePool.layer, this.glowController.layer, this.impactEffect.layer);
  }

  initialize(stage: Container, config?: Partial<VisualFxConfig>): void {
    this.config = normalizeVisualFxConfig(config);
    this.assetPipeline.initialize();
    this.particlePool.setTexturePipeline(this.assetPipeline);
    this.smokeController.setTexturePipeline(this.assetPipeline);
    this.resetRandomStreams("piano-puzzle-fx");
    this.layer.visible = this.config.enabled;
    if (!this.layer.parent) stage.addChild(this.layer);
  }

  getAssetManifest() {
    return this.assetPipeline.getManifest();
  }

  createAssetGallery(): HTMLDivElement | undefined {
    return this.assetPipeline.createDebugGallery();
  }

  setConfig(config: Partial<VisualFxConfig>): void {
    const wasDemoActive = this.demoActive;
    this.config = normalizeVisualFxConfig({ ...this.config, ...config });
    this.layer.visible = this.config.enabled;
    if (!this.config.enabled) this.clearTransient();
    if (wasDemoActive) this.startDemo();
  }

  onNoteOn(event: FxNoteEvent): void {
    if (!this.acceptNoteEvent(event)) return;
    const tuning = getFxPresetTuning(this.config.preset);
    const intensity = this.config.glowIntensity * tuning.glowMultiplier * (0.35 + Math.max(0, Math.min(1, event.normalizedVelocity)) * 0.65);
    const color = colorForPitch(this.config.palette, event.midiNote);
    const behavior = this.behaviorForMidi(event.midiNote);
    if (this.config.glowEnabled) this.glowController.add(event.position, color, intensity, this.config.glowDurationMs + Math.min(700, event.durationMs * 0.15), event.midiNote < 48 ? 34 : 25);
    if (this.config.smokeEnabled && behavior === "bass") {
      this.emitSmokeNote(event.position, this.smokeColorFor(behavior, color), event.normalizedVelocity, behavior);
    }
    if (this.config.particlesEnabled && behavior === "high") {
      const textureId: FxTextureId = event.midiNote % 2 === 0 ? "soft-bokeh" : "light-streak";
      this.tryAcquireParticle(
        event.position,
        { x: this.random.signed(5), y: -this.random.range(4, 12) },
        Math.min(480, this.config.particleLifetimeMs * 1.35),
        color,
        this.config.particleSize * (textureId === "light-streak" ? 0.42 : 0.75) * (0.55 + event.normalizedVelocity * 0.5),
        textureId,
        textureId === "light-streak" ? 0.58 : 0.68
      );
    }
    this.lightingController.noteOn(event.midiNote, event.normalizedVelocity);
    this.lastEvent = `note-on:${event.midiNote}`;
  }

  onNoteOff(): void {
    this.lastEvent = "note-off";
  }

  onPieceLaunch(event: FxPieceLaunchEvent): void {
    if (!this.acceptPieceLaunchEvent(event)) return;
    const tuning = getFxPresetTuning(this.config.preset);
    const color = colorForPitch(this.config.palette, event.midiNote);
    this.trails.set(event.pieceId, {
      x: event.position.x,
      y: event.position.y,
      color,
      intensity: event.intensity,
      midiNote: event.midiNote,
      points: [{ x: event.position.x, y: event.position.y, age: 0 }],
      lastSmokeEmitMs: event.playbackTimeMs - this.config.smokeEmissionIntervalMs,
      emissionIndex: 0
    });
    const behavior = this.behaviorForMidi(event.midiNote);
    if (this.config.glowEnabled) {
      this.glowController.add(event.position, color, this.config.glowIntensity * tuning.glowMultiplier * event.intensity, this.config.revealDurationMs, 16 + event.intensity * 18);
    }
    if (this.config.particlesEnabled && this.config.trailEnabled) this.emitTrail(event.position, event.targetPosition, color, event.intensity, true);
    if (this.config.smokeEnabled && tuning.smokeMultiplier > 0) {
      this.emitSmokeLaunch(event.position, event.targetPosition, this.smokeColorFor(behavior, color), event.intensity, behavior);
    }
    this.lastEvent = `launch:${event.pieceId}`;
  }

  onPieceLock(event: FxPieceLockEvent): void {
    if (!this.acceptPieceLockEvent(event)) return;
    const tuning = getFxPresetTuning(this.config.preset);
    const color = colorForPitch(this.config.palette, event.midiNote);
    const behavior = this.behaviorForMidi(event.midiNote);
    if (this.config.lockImpactEnabled) this.impactEffect.add(event.position, color, this.config.impactIntensity * event.intensity);
    if (this.config.particlesEnabled) this.emitSparkles(event.position, color, event.intensity);
    if (this.config.smokeEnabled && tuning.smokeMultiplier > 0) this.emitSmokeBurst(event.position, this.smokeColorFor(behavior, color), event.intensity, behavior);
    if (this.config.particlesEnabled && behavior === "high") {
      this.emitHighShimmer(event.position, { x: 0, y: -1 }, color, event.intensity, 0);
    }
    if (this.config.glowEnabled) this.glowController.add(event.position, color, this.config.glowIntensity * tuning.glowMultiplier * event.intensity, this.config.revealDurationMs * 0.8, 22 + event.intensity * 18);
    this.trails.delete(event.pieceId);
    this.lastEvent = `lock:${event.pieceId}`;
  }

  startDemo(): void {
    this.clearTransient();
    this.clearDemo();
    this.resetRandomStreams("piano-puzzle-demo");
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
    const notes = [36, 43, 52, 60, 67, 76, 84, 91];
    const colors = notes.map((note) => colorForPitch(this.config.palette, note));
    notes.forEach((midiNote, index) => {
      const from = { x: 120 + index * 120, y: 1570 + (index % 2) * 84 };
      const target = { x: 142 + index * 120, y: 154 + (index % 4) * 186 };
      const dx = target.x - from.x;
      const dy = target.y - from.y;
      const distance = Math.hypot(dx, dy) || 1;
      const side = index % 2 === 0 ? 1 : -1;
      const bend = (90 + (index % 3) * 42) * (0.35 + this.config.pathCurvature * getFxPresetTuning(this.config.preset).curveMultiplier);
      const control = { x: (from.x + target.x) / 2 - (dy / distance) * bend * side, y: (from.y + target.y) / 2 + (dx / distance) * bend * side };
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
        control,
        lastPosition: { ...from },
        pulseMs: 0,
        graphic,
        targetGraphic
      });
    });
    this.lastEvent = "demo-start";
  }

  stopDemo(): void {
    this.clearTransient();
    this.clearDemo();
    this.lastEvent = "demo-stop";
  }

  update(deltaSeconds: number, playbackTimeMs: number, frames: FxAnimationFrame[] = []): void {
    const deltaMs = Math.max(0, Math.min(100, deltaSeconds * 1000));
    this.fps = this.fps * 0.92 + (1 / Math.max(0.001, deltaSeconds)) * 0.08;
    if (!this.paused && this.demoActive) this.updateDemo(deltaMs);
    if (!this.config.enabled) {
      this.commitFrameMetrics();
      return;
    }
    this.lightingController.setPaused(this.paused);
    this.lightingController.update(deltaSeconds, this.config);
    this.glowController.update(deltaMs);
    this.impactEffect.update(deltaMs);
    if (!this.paused) this.particlePool.update(deltaSeconds);
    if (!this.paused) this.smokeController.update(deltaSeconds);
    if (!this.paused) {
      for (const frame of frames) {
        if (frame.state !== "moving") continue;
        const trail = this.trails.get(frame.pieceId);
        if (!trail) continue;
        const position = frame.currentPosition;
        const distance = Math.hypot(position.x - trail.x, position.y - trail.y);
        if (distance > 3) {
          if (this.config.trailEnabled && this.config.particlesEnabled) {
            this.emitTrail(position, trail, trail.color, trail.intensity);
          }
          if (playbackTimeMs - trail.lastSmokeEmitMs >= this.config.smokeEmissionIntervalMs) {
            const behavior = this.behaviorForMidi(trail.midiNote);
            if (this.config.smokeEnabled && getFxPresetTuning(this.config.preset).smokeMultiplier > 0) {
              this.emitSmokeAlongPath(
                { x: trail.x, y: trail.y },
                position,
                this.smokeColorFor(behavior, trail.color),
                trail.intensity,
                behavior,
                trail.emissionIndex
              );
            }
            if (this.config.particlesEnabled && behavior === "high" && trail.emissionIndex % 2 === 0) {
              this.emitHighShimmer(position, { x: position.x - trail.x, y: position.y - trail.y }, trail.color, trail.intensity, trail.emissionIndex);
            }
            trail.lastSmokeEmitMs = playbackTimeMs;
            trail.emissionIndex += 1;
          }
          if (this.config.trailEnabled) this.recordTrail(trail, position);
          trail.x = position.x;
          trail.y = position.y;
        }
      }
    }
    this.updateRibbons(deltaMs);
    this.commitFrameMetrics();
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
    this.resetRandomStreams("piano-puzzle-fx");
    this.lastEvent = "seek";
  }

  reset(): void {
    this.clearTransient();
    this.clearDemo();
    this.resetRandomStreams("piano-puzzle-fx");
    this.lightingController.clear();
    this.lastEvent = "reset";
  }

  getStats(): FxDebugStats {
    return {
      activeParticles: this.particlePool.activeCount,
      maxActiveParticles: MAX_ACTIVE_PARTICLES,
      activeSmoke: this.smokeController.activeCount,
      maxActiveSmoke: this.smokeController.capacity,
      activeGlows: this.glowController.activeCount,
      activeImpacts: this.impactEffect.activeCount,
      droppedParticles: this.particlePool.droppedCount + this.budgetDroppedParticles,
      droppedSmoke: this.smokeController.droppedCount + this.budgetDroppedSmoke,
      droppedByPoolCapacity: this.droppedByPoolCapacity,
      droppedByFrameBudget: this.droppedByFrameBudget,
      droppedByInvalidEvent: this.droppedByInvalidEvent,
      droppedByInactiveState: this.droppedByInactiveState,
      emittedParticles: this.lastFrameParticleSpawns,
      emittedSmoke: this.lastFrameSmokeSpawns,
      particleFrameBudget: this.config.particleFrameBudget,
      smokeFrameBudget: this.config.smokeFrameBudget,
      smokeLayerCount: this.smokeController.layerCount,
      lastFxEvent: this.lastEvent,
      estimatedFps: Math.round(this.fps),
      transformMismatchCount: this.transformMismatchCount
    };
  }

  dispose(): void {
    this.clearTransient();
    this.particlePool.dispose();
    this.smokeController.dispose();
    this.glowController.dispose();
    this.impactEffect.dispose();
    this.lightingController.dispose();
    this.assetPipeline.dispose();
    this.layer.destroy({ children: false });
  }

  private clearTransient(): void {
    this.particlePool.clear();
    this.smokeController.clear();
    this.glowController.clear();
    this.impactEffect.clear();
    this.trails.clear();
    this.ribbonLayer.clear();
    this.particleSpawnsThisFrame = 0;
    this.smokeSpawnsThisFrame = 0;
    this.lastFrameParticleSpawns = 0;
    this.lastFrameSmokeSpawns = 0;
    this.budgetDroppedParticles = 0;
    this.budgetDroppedSmoke = 0;
    this.droppedByPoolCapacity = 0;
    this.droppedByFrameBudget = 0;
    this.droppedByInvalidEvent = 0;
    this.droppedByInactiveState = 0;
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
      const position = this.quadraticBezier(piece.from, piece.control, piece.target, eased);
      const x = position.x;
      const y = position.y;
      piece.graphic.position.set(x, y);
      piece.graphic.rotation = Math.atan2(y - piece.lastPosition.y, x - piece.lastPosition.x) * 0.12 + Math.sin(progress * Math.PI * 2) * 0.04;
      const trail = this.trails.get(piece.id);
      if (trail && progress < 1) {
        const distance = Math.hypot(position.x - trail.x, position.y - trail.y);
        if (distance > 2) {
          if (this.config.trailEnabled && this.config.particlesEnabled) {
            this.emitTrail(position, trail, trail.color, trail.intensity);
          }
          if (this.demoTimeMs - trail.lastSmokeEmitMs >= this.config.smokeEmissionIntervalMs) {
            const behavior = this.behaviorForMidi(trail.midiNote);
            if (this.config.smokeEnabled && getFxPresetTuning(this.config.preset).smokeMultiplier > 0) {
              this.emitSmokeAlongPath(
                { x: trail.x, y: trail.y },
                position,
                this.smokeColorFor(behavior, trail.color),
                trail.intensity,
                behavior,
                trail.emissionIndex
              );
            }
            if (this.config.particlesEnabled && behavior === "high" && trail.emissionIndex % 2 === 0) {
              this.emitHighShimmer(position, { x: position.x - trail.x, y: position.y - trail.y }, trail.color, trail.intensity, trail.emissionIndex);
            }
            trail.lastSmokeEmitMs = this.demoTimeMs;
            trail.emissionIndex += 1;
          }
          this.recordTrail(trail, position);
          trail.x = position.x;
          trail.y = position.y;
        }
      }
      piece.pulseMs += 16;
      if (piece.pulseMs >= 110 && progress < 0.92) {
        piece.pulseMs = 0;
        if (this.config.glowEnabled) this.glowController.add(position, piece.color, this.config.glowIntensity * 0.24, this.config.revealDurationMs * 0.3, 10 + progress * 18);
      }
      piece.lastPosition = position;
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
    if (target) {
      graphic.circle(0, 0, 57).stroke({ color, width: 1.2, alpha: 0.2 });
      graphic.circle(0, 0, 68).stroke({ color, width: 1, alpha: 0.1 });
    } else {
      graphic.circle(0, 0, 56).stroke({ color, width: 1, alpha: 0.24 });
    }
    return graphic;
  }

  private emitTrail(position: { x: number; y: number }, target: { x: number; y: number } | TrailState, color: number, intensity: number, invert = false): void {
    const tuning = getFxPresetTuning(this.config.preset);
    const dx = target.x - position.x;
    const dy = target.y - position.y;
    const distance = Math.hypot(dx, dy) || 1;
    const direction = invert ? -1 : 1;
    const count = Math.max(1, Math.round((2 + this.config.particleDensity * 16 * (0.35 + this.config.trailLength)) * tuning.trailMultiplier));
    for (let i = 0; i < count; i += 1) {
      const spread = this.random.signed(14 + this.config.pathCurvature * 28);
      const normalX = -dy / distance;
      const normalY = dx / distance;
      const swirl = tuning.swirl * this.config.pathCurvature * Math.sin(i * 1.7 + this.demoTimeMs * 0.01) * 12;
        this.tryAcquireParticle(
        { x: position.x + normalX * spread, y: position.y + normalY * spread },
        {
          x: direction * dx / distance * this.random.range(12, 30) + normalX * swirl,
          y: direction * dy / distance * this.random.range(12, 30) + normalY * swirl
        },
        this.config.particleLifetimeMs * (0.85 + this.config.trailLength * 0.7),
        color,
        this.config.particleSize * tuning.particleScale * (0.42 + intensity * 0.78) * this.random.range(0.7, 1.25),
        this.chooseTrailTexture(),
        0.42 + intensity * 0.32
      );
    }
  }

  private emitSparkles(position: { x: number; y: number }, color: number, intensity: number): void {
    const tuning = getFxPresetTuning(this.config.preset);
    const count = Math.max(2, Math.round((4 + this.config.particleDensity * 12) * tuning.sparkleMultiplier));
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count;
      this.tryAcquireParticle(
        { x: position.x, y: position.y },
        { x: Math.cos(angle) * (18 + intensity * 22), y: Math.sin(angle) * (18 + intensity * 22) },
        Math.min(500, this.config.particleLifetimeMs + 100),
        color,
        this.config.particleSize * tuning.particleScale * (0.55 + intensity * 0.9),
        "spark-cross"
      );
    }
  }

  private emitHighShimmer(
    position: { x: number; y: number },
    direction: { x: number; y: number },
    color: number,
    intensity: number,
    emissionIndex: number
  ): void {
    const tuning = getFxPresetTuning(this.config.preset);
    const distance = Math.hypot(direction.x, direction.y) || 1;
    const textureId: FxTextureId = emissionIndex % 2 === 0 ? "light-streak" : "soft-bokeh";
    const speed = 7 + intensity * 13;
    this.tryAcquireParticle(
      position,
      {
        x: direction.x / distance * speed + this.random.signed(4),
        y: direction.y / distance * speed + this.random.signed(4) - 2
      },
      this.config.particleLifetimeMs * (textureId === "light-streak" ? 0.62 : 0.88),
      color,
      this.config.particleSize * tuning.highShimmerMultiplier * (textureId === "light-streak" ? 0.46 : 0.68) * (0.62 + intensity * 0.58),
      textureId,
      textureId === "light-streak" ? 0.54 : 0.48
    );
  }

  private emitSmokeNote(position: { x: number; y: number }, color: number, intensity: number, behavior: FxSmokeBehavior): void {
    const tuning = getFxPresetTuning(this.config.preset);
    const smokeIntensity = this.smokeIntensityMultiplier(behavior);
    this.tryAcquireSmoke(
      position,
      { x: this.random.signed(2), y: -this.random.range(2, 6) },
      this.config.particleLifetimeMs * this.random.range(2.2, 3.2),
      color,
      this.config.particleSize * tuning.smokeVolumeScale * Math.sqrt(smokeIntensity) * this.random.range(13, 20),
      (0.16 + intensity * 0.18) * smokeIntensity,
      "volume",
      behavior
    );
  }

  private emitSmokeLaunch(
    position: { x: number; y: number },
    target: { x: number; y: number },
    color: number,
    intensity: number,
    behavior: FxSmokeBehavior
  ): void {
    const tuning = getFxPresetTuning(this.config.preset);
    const dx = target.x - position.x;
    const dy = target.y - position.y;
    const distance = Math.hypot(dx, dy) || 1;
    const normalX = -dy / distance;
    const normalY = dx / distance;
    const direction = behavior === "high" ? 1 : -1;
    const pathSpeed = behavior === "bass" ? 5 : behavior === "high" ? 15 : 9;
    const baseVelocity = {
      x: direction * dx / distance * pathSpeed,
      y: direction * dy / distance * pathSpeed - (behavior === "bass" ? 1.5 : 4)
    };
    const smokeIntensity = this.smokeIntensityMultiplier(behavior);
    const baseAlpha = (0.2 + intensity * 0.24) * smokeIntensity;
    const baseLifetime = this.config.particleLifetimeMs * (behavior === "bass" ? 2.55 : behavior === "high" ? 1.35 : 2.05);
    const baseRadius = this.config.particleSize * (0.72 + intensity * 0.55) * Math.sqrt(smokeIntensity);
    const layerCount = this.config.smokeLayerCount;

    this.emitSmokeLayer(position, baseVelocity, baseLifetime, color, baseRadius * tuning.smokeCoreScale * this.random.range(10, 15), baseAlpha, "core", behavior);
    if (layerCount >= 2 && behavior !== "high") {
      this.emitSmokeLayer(
        { x: position.x + normalX * this.random.signed(7), y: position.y + normalY * this.random.signed(7) },
        { x: baseVelocity.x + normalX * this.random.signed(5), y: baseVelocity.y + normalY * this.random.signed(5) },
        baseLifetime * 1.18,
        color,
        baseRadius * tuning.smokeVolumeScale * this.random.range(14, 20),
        baseAlpha * 0.78,
        "volume",
        behavior
      );
    }
    if (layerCount >= 3) {
      this.emitSmokeLayer(
        { x: position.x + normalX * this.random.signed(10), y: position.y + normalY * this.random.signed(10) },
        { x: baseVelocity.x * 0.5 + normalX * this.random.signed(4), y: baseVelocity.y * 0.5 + normalY * this.random.signed(4) },
        baseLifetime * 1.45,
        color,
        baseRadius * tuning.smokeResidueScale * this.random.range(16, 24),
        baseAlpha * 0.52,
        "residue",
        behavior
      );
    }
    if (behavior !== "high") {
      this.emitSmokeLayer(
        { x: position.x + normalX * this.random.signed(5), y: position.y + normalY * this.random.signed(5) },
        { x: baseVelocity.x * 0.68, y: baseVelocity.y * 0.68 },
        baseLifetime * 0.88,
        color,
        baseRadius * tuning.smokeCoreScale * this.random.range(8, 12),
        baseAlpha * 0.66,
        "core",
        behavior
      );
    }
    if (behavior === "bass" && layerCount >= 2) {
      this.emitSmokeLayer(
        { x: position.x + normalX * this.random.signed(12), y: position.y + normalY * this.random.signed(12) },
        { x: baseVelocity.x * 0.4, y: baseVelocity.y * 0.4 - 2 },
        baseLifetime * 1.25,
        color,
        baseRadius * tuning.smokeVolumeScale * this.random.range(16, 22),
        baseAlpha * 0.42,
        "volume",
        behavior
      );
    }
  }

  private emitSmokeAlongPath(
    previous: { x: number; y: number },
    current: { x: number; y: number },
    color: number,
    intensity: number,
    behavior: FxSmokeBehavior,
    emissionIndex: number
  ): void {
    const tuning = getFxPresetTuning(this.config.preset);
    const dx = current.x - previous.x;
    const dy = current.y - previous.y;
    const distance = Math.hypot(dx, dy) || 1;
    const normalX = -dy / distance;
    const normalY = dx / distance;
    const tangentSpeed = behavior === "bass" ? 4 : behavior === "high" ? 13 : 7;
    const sampleCount = behavior === "high" ? 1 : Math.min(3, Math.max(1, Math.ceil(distance / 48)));
    const baseLifetime = this.config.particleLifetimeMs * (behavior === "bass" ? 2.4 : behavior === "high" ? 1.18 : 1.9);
    const smokeIntensity = this.smokeIntensityMultiplier(behavior);
    const baseAlpha = (0.17 + intensity * 0.22) * smokeIntensity;
    const baseRadius = this.config.particleSize * (0.7 + intensity * 0.5) * Math.sqrt(smokeIntensity);

    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      const sampleT = Math.min(1, (sampleIndex + 0.75) / sampleCount);
      const sampleX = previous.x + dx * sampleT;
      const sampleY = previous.y + dy * sampleT;
      const packetPhase = emissionIndex * 1.618 + sampleIndex * 2.414;
      const spread = this.random.signed(5 + this.config.pathCurvature * 16);
      const basePosition = {
        x: sampleX + normalX * spread,
        y: sampleY + normalY * spread
      };
      const baseVelocity = {
        x: dx / distance * tangentSpeed + normalX * Math.sin(packetPhase) * 3,
        y: dy / distance * tangentSpeed + normalY * Math.cos(packetPhase) * 3 - (behavior === "bass" ? 1 : 3.5)
      };
      const sampleAlpha = baseAlpha * (1 - sampleIndex / Math.max(1, sampleCount) * 0.16);

      this.emitSmokeLayer(
        basePosition,
        baseVelocity,
        baseLifetime,
        color,
        baseRadius * tuning.smokeCoreScale * this.random.range(8, 13),
        sampleAlpha,
        "core",
        behavior
      );
      if (behavior !== "high" && this.config.smokeLayerCount >= 2) {
        this.emitSmokeLayer(
          { x: basePosition.x + normalX * this.random.signed(7), y: basePosition.y + normalY * this.random.signed(7) },
          { x: baseVelocity.x * 0.72 + normalX * this.random.signed(4), y: baseVelocity.y * 0.72 + normalY * this.random.signed(4) },
          baseLifetime * 1.2,
          color,
          baseRadius * tuning.smokeVolumeScale * this.random.range(12, 18),
          sampleAlpha * 0.72,
          "volume",
          behavior
        );
      }
      if (behavior === "bass" && this.config.smokeLayerCount >= 3) {
        this.emitSmokeLayer(
          { x: basePosition.x + normalX * this.random.signed(11), y: basePosition.y + normalY * this.random.signed(11) },
          { x: baseVelocity.x * 0.45, y: baseVelocity.y * 0.45 - 1.5 },
          baseLifetime * 1.45,
          color,
          baseRadius * tuning.smokeResidueScale * this.random.range(15, 22),
          sampleAlpha * 0.46,
          "residue",
          behavior
        );
      }
    }
  }

  private emitSmokeBurst(position: { x: number; y: number }, color: number, intensity: number, behavior: FxSmokeBehavior): void {
    const tuning = getFxPresetTuning(this.config.preset);
    const layerCount = behavior === "bass" ? Math.min(3, this.config.smokeLayerCount) : Math.min(2, this.config.smokeLayerCount);
    const baseSpeed = behavior === "bass" ? 5 : behavior === "high" ? 9 : 7;
    const baseLifetime = this.config.particleLifetimeMs * (behavior === "bass" ? 2.45 : behavior === "high" ? 1.2 : 1.75);
    const smokeIntensity = this.smokeIntensityMultiplier(behavior);
    const baseAlpha = (0.16 + intensity * 0.2) * smokeIntensity;
    for (let layerIndex = 0; layerIndex < layerCount; layerIndex += 1) {
      const angle = (Math.PI * 2 * layerIndex) / Math.max(1, layerCount) + this.random.signed(0.38);
      const layer: FxSmokeLayer = layerIndex === 0 ? "core" : layerIndex === 1 ? "volume" : "residue";
      const scale = layer === "core" ? tuning.smokeCoreScale : layer === "volume" ? tuning.smokeVolumeScale : tuning.smokeResidueScale;
      this.emitSmokeLayer(
        position,
        { x: Math.cos(angle) * baseSpeed, y: Math.sin(angle) * baseSpeed - (behavior === "bass" ? 1 : 3) },
        baseLifetime * (1 + layerIndex * 0.2),
        color,
        this.config.particleSize * scale * this.random.range(10 + layerIndex * 3, 16 + layerIndex * 5),
        baseAlpha * (1 - layerIndex * 0.2),
        layer,
        behavior
      );
    }
  }

  private emitSmokeLayer(
    position: { x: number; y: number },
    velocity: { x: number; y: number },
    lifetime: number,
    color: number,
    radius: number,
    alpha: number,
    layer: FxSmokeLayer,
    behavior: FxSmokeBehavior
  ): void {
    this.tryAcquireSmoke(position, velocity, lifetime, color, radius, alpha, layer, behavior);
  }

  private tryAcquireParticle(
    position: { x: number; y: number },
    velocity: { x: number; y: number },
    lifetime: number,
    color: number,
    scale: number,
    textureId: FxTextureId,
    alpha = 1
  ): void {
    if (this.particleSpawnsThisFrame >= this.config.particleFrameBudget) {
      this.budgetDroppedParticles += 1;
      this.droppedByFrameBudget += 1;
      return;
    }
    if (this.particlePool.acquire(position, velocity, lifetime, color, scale, textureId, alpha)) {
      this.particleSpawnsThisFrame += 1;
    } else {
      this.droppedByPoolCapacity += 1;
    }
  }

  private tryAcquireSmoke(
    position: { x: number; y: number },
    velocity: { x: number; y: number },
    lifetime: number,
    color: number,
    radius: number,
    alpha: number,
    layer: FxSmokeLayer,
    behavior: FxSmokeBehavior
  ): void {
    if (this.smokeSpawnsThisFrame >= this.config.smokeFrameBudget) {
      this.budgetDroppedSmoke += 1;
      this.droppedByFrameBudget += 1;
      return;
    }
    const tuning = getFxPresetTuning(this.config.preset);
    const behaviorMultiplier = behavior === "bass" ? tuning.bassSmokeMultiplier : behavior === "high" ? tuning.highSmokeMultiplier : 1;
    if (this.smokeController.acquire(position, velocity, lifetime, color, radius, alpha, layer, behavior, tuning.smokeDrag, tuning.smokeTurbulence, behaviorMultiplier)) {
      this.smokeSpawnsThisFrame += 1;
    } else {
      this.droppedByPoolCapacity += 1;
    }
  }

  private acceptNoteEvent(event: FxNoteEvent): boolean {
    if (this.isInactiveForEvents()) {
      this.droppedByInactiveState += 1;
      return false;
    }
    if (!this.isValidNoteEvent(event)) {
      this.droppedByInvalidEvent += 1;
      return false;
    }
    return true;
  }

  private acceptPieceLaunchEvent(event: FxPieceLaunchEvent): boolean {
    if (this.isInactiveForEvents()) {
      this.droppedByInactiveState += 1;
      return false;
    }
    if (!this.isValidPieceLaunchEvent(event)) {
      this.droppedByInvalidEvent += 1;
      return false;
    }
    return true;
  }

  private acceptPieceLockEvent(event: FxPieceLockEvent): boolean {
    if (this.isInactiveForEvents()) {
      this.droppedByInactiveState += 1;
      return false;
    }
    if (!this.isValidPieceLockEvent(event)) {
      this.droppedByInvalidEvent += 1;
      return false;
    }
    return true;
  }

  private isInactiveForEvents(): boolean {
    return this.paused || !this.config.enabled || !this.layer.visible;
  }

  private isValidNoteEvent(event: FxNoteEvent): boolean {
    return Boolean(
      event &&
      typeof event.id === "string" &&
      event.id.length > 0 &&
      Number.isInteger(event.midiNote) &&
      event.midiNote >= 0 &&
      event.midiNote <= 127 &&
      Number.isFinite(event.velocity) &&
      event.velocity >= 0 &&
      event.velocity <= 127 &&
      Number.isFinite(event.normalizedVelocity) &&
      event.normalizedVelocity >= 0 &&
      event.normalizedVelocity <= 1 &&
      this.isFinitePoint(event.position) &&
      Number.isFinite(event.durationMs) &&
      event.durationMs >= 0 &&
      Number.isFinite(event.playbackTimeMs)
    );
  }

  private isValidPieceLaunchEvent(event: FxPieceLaunchEvent): boolean {
    return Boolean(
      event &&
      typeof event.pieceId === "string" &&
      event.pieceId.length > 0 &&
      this.isFinitePoint(event.position) &&
      this.isFinitePoint(event.targetPosition) &&
      Number.isInteger(event.midiNote) &&
      event.midiNote >= 0 &&
      event.midiNote <= 127 &&
      Number.isFinite(event.intensity) &&
      event.intensity >= 0 &&
      Number.isFinite(event.playbackTimeMs)
    );
  }

  private isValidPieceLockEvent(event: FxPieceLockEvent): boolean {
    return Boolean(
      event &&
      typeof event.pieceId === "string" &&
      event.pieceId.length > 0 &&
      this.isFinitePoint(event.position) &&
      Number.isInteger(event.midiNote) &&
      event.midiNote >= 0 &&
      event.midiNote <= 127 &&
      Number.isFinite(event.intensity) &&
      event.intensity >= 0 &&
      Number.isFinite(event.playbackTimeMs)
    );
  }

  private isFinitePoint(value: unknown): boolean {
    if (!value || typeof value !== "object") return false;
    const point = value as { x?: unknown; y?: unknown };
    return typeof point.x === "number" && Number.isFinite(point.x) && typeof point.y === "number" && Number.isFinite(point.y);
  }

  private chooseTrailTexture(): FxTextureId {
    let textureId: FxTextureId = this.random.nextFloat() > 0.82 ? "ember-small" : "dust-mote";
    if (textureId === this.lastTrailTexture && this.random.nextFloat() < 0.7) {
      textureId = textureId === "ember-small" ? "dust-mote" : "ember-small";
    }
    this.lastTrailTexture = textureId;
    return textureId;
  }

  private smokeIntensityMultiplier(behavior: FxSmokeBehavior): number {
    const tuning = getFxPresetTuning(this.config.preset);
    const behaviorMultiplier = behavior === "bass" ? tuning.bassSmokeMultiplier : behavior === "high" ? tuning.highSmokeMultiplier : 1;
    const densityMultiplier = 0.35 + this.config.smokeDensity * 0.9;
    return Math.max(0.08, Math.min(2.2, tuning.smokeMultiplier * behaviorMultiplier * densityMultiplier));
  }

  private smokeColorFor(behavior: FxSmokeBehavior, sourceColor: number): number {
    const neutralColor = behavior === "bass" ? 0xd4ad70 : behavior === "high" ? 0xe9dfbc : 0xc9cecc;
    const sourceWeight = this.config.palette === "neon" ? 0.32 : this.config.palette === "gold" ? 0.18 : 0.24;
    const neutralRed = (neutralColor >> 16) & 0xff;
    const neutralGreen = (neutralColor >> 8) & 0xff;
    const neutralBlue = neutralColor & 0xff;
    const sourceRed = (sourceColor >> 16) & 0xff;
    const sourceGreen = (sourceColor >> 8) & 0xff;
    const sourceBlue = sourceColor & 0xff;
    const red = Math.round(neutralRed * (1 - sourceWeight) + sourceRed * sourceWeight);
    const green = Math.round(neutralGreen * (1 - sourceWeight) + sourceGreen * sourceWeight);
    const blue = Math.round(neutralBlue * (1 - sourceWeight) + sourceBlue * sourceWeight);
    return (red << 16) | (green << 8) | blue;
  }

  private behaviorForMidi(midiNote: number): FxSmokeBehavior {
    if (midiNote < this.config.bassThreshold) return "bass";
    if (midiNote >= this.config.highThreshold) return "high";
    return "neutral";
  }

  private resetRandomStreams(seed: string): void {
    this.random = new SeededRandom(seed);
    this.particlePool.setSeed(`${seed}:particles`);
    this.smokeController.setSeed(`${seed}:smoke`);
    this.lastTrailTexture = "dust-mote";
  }

  private commitFrameMetrics(): void {
    this.lastFrameParticleSpawns = this.particleSpawnsThisFrame;
    this.lastFrameSmokeSpawns = this.smokeSpawnsThisFrame;
    this.particleSpawnsThisFrame = 0;
    this.smokeSpawnsThisFrame = 0;
  }

  private recordTrail(trail: TrailState, position: { x: number; y: number }): void {
    trail.points.push({ x: position.x, y: position.y, age: 0 });
    const maxPoints = 5 + Math.round(this.config.trailLength * 28);
    if (trail.points.length > maxPoints) trail.points.splice(0, trail.points.length - maxPoints);
  }

  private updateRibbons(deltaMs: number): void {
    this.ribbonLayer.clear();
    if (!this.config.enabled || !this.config.trailEnabled) return;
    const lifetime = 90 + this.config.trailLength * 620;
    for (const trail of this.trails.values()) {
      for (const point of trail.points) point.age += deltaMs;
      trail.points = trail.points.filter((point) => point.age <= lifetime);
      if (trail.points.length < 2) continue;
      for (let i = 1; i < trail.points.length; i += 1) {
        const previous = trail.points[i - 1];
        const point = trail.points[i];
        const freshness = 1 - Math.min(1, point.age / lifetime);
        const along = i / trail.points.length;
        this.ribbonLayer
          .moveTo(previous.x, previous.y)
          .lineTo(point.x, point.y)
          .stroke({
            color: trail.color,
            width: (1.2 + trail.intensity * 3.8) * (0.35 + along * 0.65),
            alpha: freshness * trail.intensity * (0.1 + this.config.trailLength * 0.48)
          });
      }
    }
  }

  private quadraticBezier(from: { x: number; y: number }, control: { x: number; y: number }, target: { x: number; y: number }, t: number): { x: number; y: number } {
    const inverse = 1 - t;
    return {
      x: inverse * inverse * from.x + 2 * inverse * t * control.x + t * t * target.x,
      y: inverse * inverse * from.y + 2 * inverse * t * control.y + t * t * target.y
    };
  }
}
