import { Container, Graphics, Texture } from "pixi.js";
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
import { KeyboardGlowController } from "./keyboard-glow";
import { LightTrailController } from "./light-trail";
import { getFxPresetTuning } from "./fx-presets";
import { FxAssetPipeline } from "./asset-pipeline";
import { SeededRandom } from "./seeded-random";
import type { FxTextureId } from "./fx-asset-types";

interface TrailState {
  x: number;
  y: number;
  origin: { x: number; y: number };
  targetPosition: { x: number; y: number };
  control: { x: number; y: number };
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
  private readonly keyboardGlow = new KeyboardGlowController();
  private readonly lightTrail = new LightTrailController();
  private readonly assetPipeline = new FxAssetPipeline();
  private readonly demoLayer = new Container();
  private readonly ribbonLayer = new Graphics();
  private demoPieces: DemoPiece[] = [];
  private demoActive = false;
  private demoTimeMs = 0;
  private demoBackdrop: Graphics | undefined;
  private demoFlashRings: { x: number; y: number; age: number; maxAge: number; maxRadius: number; color: number }[] = [];
  private demoRevealGraphic: Graphics | undefined;
  private demoRevealFlashMs = 0;
  private demoAmbientGlow: Graphics | undefined;
  private demoAmbientStars: Graphics | undefined;
  private demoKeyboard: Graphics | undefined;
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
  private vortexAngle = 0;
  private vortexCenter = { x: 540, y: 600 };
  private vortexActive = false;
  private vortexIntensity = 0;
  private vortexSpawnTimer = 0;
  private galaxyAngle = 0;
  private galaxyActive = false;
  private galaxySpawnTimer = 0;

  constructor() {
    this.layer.addChild(this.lightingController.layer, this.keyboardGlow.layer, this.lightTrail.layer, this.demoLayer, this.smokeController.layer, this.ribbonLayer, this.particlePool.layer, this.glowController.layer, this.impactEffect.layer);
  }

  initialize(stage: Container, config?: Partial<VisualFxConfig>): void {
    this.config = normalizeVisualFxConfig(config);
    this.assetPipeline.initialize();
    this.particlePool.setTexturePipeline(this.assetPipeline);
    this.smokeController.setTexturePipeline(this.assetPipeline);
    this.glowController.setTexturePipeline(this.assetPipeline);
    this.impactEffect.setTexturePipeline(this.assetPipeline);
    this.lightingController.setTexturePipeline(this.assetPipeline);
    this.resetRandomStreams("piano-puzzle-fx");
    this.layer.visible = this.config.enabled;
    if (!this.layer.parent) stage.addChild(this.layer);
  }

  getAssetManifest() {
    return this.assetPipeline.getManifest();
  }

  getDissolveNoiseTexture(): Texture {
    return this.assetPipeline.getTexture("dissolve-noise");
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
    const behavior = this.behaviorForMidi(event.midiNote);
    const sourceColor = this.getColorForPitch(event.midiNote);
    const color = this.isStardustPreset() ? this.stardustColorFor(behavior, sourceColor, event.midiNote) : sourceColor;
    if (this.config.glowEnabled) this.glowController.add(event.position, color, intensity, this.config.glowDurationMs + Math.min(700, event.durationMs * 0.15), event.midiNote < 48 ? 34 : 25);
    if (this.isStardustPreset() && this.config.particlesEnabled) {
      this.emitStardustNoteBurst(event.position, color, event.normalizedVelocity, behavior);
    }
    if (!this.isStardustPreset() && this.config.smokeEnabled && tuning.smokeMultiplier > 0 && behavior === "bass") {
      this.emitSmokeNote(event.position, this.smokeColorFor(behavior, color), event.normalizedVelocity, behavior);
    }
    if (!this.isStardustPreset() && this.config.particlesEnabled && behavior === "high") {
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
if (this.config.lightingIntensity > 0.02) this.lightingController.noteOn(event.midiNote, event.normalizedVelocity);
this.lightingController.noteOn(event.midiNote, event.normalizedVelocity);
    if (this.config.keyboardGlowEnabled) {
      this.keyboardGlow.hitKey(event.position.x, color, this.config.keyboardGlowIntensity * (0.35 + event.normalizedVelocity * 0.65));
    }
    this.lastEvent = `note-on:${event.midiNote}`;
  }

  onNoteOff(): void {
    this.lastEvent = "note-off";
  }

  onPieceLaunch(event: FxPieceLaunchEvent): void {
    if (!this.acceptPieceLaunchEvent(event)) return;
    const tuning = getFxPresetTuning(this.config.preset);
    const behavior = this.behaviorForMidi(event.midiNote);
    const sourceColor = this.getColorForPitch(event.midiNote);
    const color = this.isStardustPreset() ? this.stardustColorFor(behavior, sourceColor, event.midiNote) : sourceColor;
    const pathDx = event.targetPosition.x - event.position.x;
    const pathDy = event.targetPosition.y - event.position.y;
    const pathDistance = Math.hypot(pathDx, pathDy) || 1;
    const pathNormalX = -pathDy / pathDistance;
    const pathNormalY = pathDx / pathDistance;
    const pathSide = this.random.nextFloat() > 0.5 ? 1 : -1;
    const pathBend = this.isStardustPreset()
      ? pathSide * Math.min(
        150,
        (58 + pathDistance * 0.12)
        * (0.5 + this.config.pathCurvature * 0.55)
        * Math.min(1.15, tuning.curveMultiplier * 0.7)
      )
      : 0;
    this.trails.set(event.pieceId, {
      x: event.position.x,
      y: event.position.y,
      origin: { ...event.position },
      targetPosition: { ...event.targetPosition },
      control: {
        x: event.position.x + pathDx * 0.5 + pathNormalX * pathBend,
        y: event.position.y + pathDy * 0.5 + pathNormalY * pathBend
      },
      color,
      intensity: event.intensity,
      midiNote: event.midiNote,
      points: [{ x: event.position.x, y: event.position.y, age: 0 }],
      lastSmokeEmitMs: event.playbackTimeMs - this.config.smokeEmissionIntervalMs,
      emissionIndex: 0
    });
    if (this.config.glowEnabled) {
      this.glowController.add(event.position, color, this.config.glowIntensity * tuning.glowMultiplier * event.intensity, this.config.revealDurationMs, 16 + event.intensity * 18);
    }
    if (this.config.particlesEnabled && this.config.trailEnabled) {
      if (this.isStardustPreset()) {
        const trail = this.trails.get(event.pieceId);
        if (trail) this.emitTrail(event.position, trail, color, event.intensity, false, true);
      } else {
        this.emitTrail(event.position, event.targetPosition, color, event.intensity, true);
      }
    }
    if (!this.isStardustPreset() && this.config.smokeEnabled && tuning.smokeMultiplier > 0) {
      this.emitSmokeLaunch(event.position, event.targetPosition, this.smokeColorFor(behavior, color), event.intensity, behavior);
    }
    // Start light trail
    if (this.config.lightTrailEnabled && !this.isStardustPreset()) {
      this.lightTrail.startTrail(event.pieceId, color, event.intensity, event.position, this.config.lightTrailWidth, this.config.lightTrailGlowLayers);
    }
    this.lastEvent = `launch:${event.pieceId}`;
  }

  onPieceLock(event: FxPieceLockEvent): void {
    if (!this.acceptPieceLockEvent(event)) return;
    const tuning = getFxPresetTuning(this.config.preset);
    const behavior = this.behaviorForMidi(event.midiNote);
    const sourceColor = this.getColorForPitch(event.midiNote);
    const color = this.isStardustPreset() ? this.stardustColorFor(behavior, sourceColor, event.midiNote) : sourceColor;
    if (this.isStardustPreset() && this.config.particlesEnabled) {
      this.emitStardustLockBurst(event.position, color, event.intensity, behavior);
    } else if (this.config.lockImpactEnabled) {
      this.impactEffect.add(event.position, color, this.config.impactIntensity * event.intensity);
    }
    if (!this.isStardustPreset() && this.config.particlesEnabled) this.emitSparkles(event.position, color, event.intensity);
    if (!this.isStardustPreset() && this.config.smokeEnabled && tuning.smokeMultiplier > 0) this.emitSmokeBurst(event.position, this.smokeColorFor(behavior, color), event.intensity, behavior);
    if (!this.isStardustPreset() && this.config.particlesEnabled && behavior === "high") {
      this.emitHighShimmer(event.position, { x: 0, y: -1 }, color, event.intensity, 0);
    }
    if (this.config.glowEnabled) this.glowController.add(event.position, color, this.config.glowIntensity * tuning.glowMultiplier * event.intensity, this.config.revealDurationMs * 0.8, 22 + event.intensity * 18);
    // End light trail
    if (this.config.lightTrailEnabled && !this.isStardustPreset()) {
      this.lightTrail.endTrail(event.pieceId);
    }
    this.trails.delete(event.pieceId);
    this.lastEvent = `lock:${event.pieceId}`;
  }

  startDemo(): void {
    this.clearTransient();
    this.clearDemo();
    this.resetRandomStreams("piano-puzzle-demo");
    this.demoActive = true;
    this.demoTimeMs = 0;

    // Dark cinematic background
    this.demoBackdrop = new Graphics();
    this.demoBackdrop.rect(0, 0, 1080, 1920).fill({ color: 0x050810, alpha: 1 });
    this.demoLayer.addChild(this.demoBackdrop);

    // Ambient atmospheric glow layers — gated by lightingIntensity
    this.drawAmbientGlow();
    if (this.demoAmbientGlow) this.demoAmbientGlow.alpha = this.config.lightingIntensity;

    // Draw ambient star field — gated by lightingIntensity
    this.drawAmbientStars();
    if (this.demoAmbientStars) this.demoAmbientStars.alpha = this.config.lightingIntensity;

    // Draw piano keyboard at the bottom — energy bar gated by lightingIntensity
    this.drawPianoKeyboard();
    if (this.demoKeyboard) this.demoKeyboard.alpha = this.config.lightingIntensity < 0.01 ? 0 : 0.35 + this.config.lightingIntensity * 0.65;

    // Flash rings layer
    const flashRings = new Graphics();
    flashRings.label = 'flashRings';
    this.demoLayer.addChild(flashRings);

    // Reveal graphic — white flash overlay for final reveal
    this.demoRevealGraphic = new Graphics();
    this.demoRevealGraphic.rect(0, 0, 1080, 1920).fill({ color: 0xffffff, alpha: 0 });
    this.demoRevealGraphic.visible = false;
    this.demoLayer.addChild(this.demoRevealGraphic);

    // Spawn first wave of pieces from keyboard upward
    this.spawnDemoWave();
    this.lastEvent = "demo-start";
  }

  private drawPianoKeyboard(): void {
    const keyboard = new Graphics();
    const kbY = 1700;
    const kbHeight = 220;
    const totalWidth = 1080;
    const whiteKeyCount = 21;
    const whiteKeyWidth = totalWidth / whiteKeyCount;

    // Keyboard background glow
    keyboard.rect(0, kbY - 12, totalWidth, kbHeight + 24)
      .fill({ color: 0x080c18, alpha: 0.95 });

    // White keys
    for (let i = 0; i < whiteKeyCount; i++) {
      const x = i * whiteKeyWidth;
      keyboard.roundRect(x + 1, kbY, whiteKeyWidth - 2, kbHeight - 6, 4)
        .fill({ color: 0x181c2a, alpha: 0.95 })
        .stroke({ color: 0x252a40, width: 1, alpha: 0.7 });
    }

    // Black keys
    const blackKeyPattern = [1, 1, 0, 1, 1, 1, 0];
    const blackKeyWidth = whiteKeyWidth * 0.58;
    const blackKeyHeight = kbHeight * 0.55;
    for (let i = 0; i < whiteKeyCount - 1; i++) {
      if (blackKeyPattern[i % 7] === 1) {
        const x = (i + 1) * whiteKeyWidth - blackKeyWidth / 2;
        keyboard.roundRect(x, kbY, blackKeyWidth, blackKeyHeight, 3)
          .fill({ color: 0x0a0d14, alpha: 0.98 })
          .stroke({ color: 0x181c2a, width: 1, alpha: 0.5 });
      }
    }

    // Massive glow line above keyboard - bright energy bar
    for (let x = 0; x < totalWidth; x += 1) {
      const glow = 0.35 + Math.sin(x * 0.025) * 0.15 + Math.sin(x * 0.08) * 0.08;
      keyboard.rect(x, kbY - 6, 1, 6).fill({ color: 0xffaa44, alpha: glow });
    }
    // Soft glow above the energy line
    for (let x = 0; x < totalWidth; x += 1) {
      const glow = 0.12 + Math.sin(x * 0.03) * 0.06;
      keyboard.rect(x, kbY - 18, 1, 14).fill({ color: 0xff8833, alpha: glow * 0.4 });
    }
    // Haze layer above keyboard
    for (let y = 0; y < 40; y += 1) {
      const t = y / 40;
      keyboard.rect(0, kbY - 20 - y, totalWidth, 1).fill({ color: 0x221100, alpha: 0.12 * (1 - t) });
    }    this.demoLayer.addChild(keyboard);
    this.demoKeyboard = keyboard;
  }


  private drawAmbientGlow(): void {
    const glow = new Graphics();
    const cx = 540;
    const cy = 480;

    // Layer 1: Deep blue atmospheric fill (very large, very soft)
    for (let r = 800; r > 0; r -= 2) {
      const t = r / 800;
      const alpha = 0.04 * Math.pow(t, 1.4);
      glow.circle(cx, cy, r).fill({ color: 0x142a60, alpha });
    }

    // Layer 2: Warm amber/orange glow (center-left) - like fire light
    for (let r = 550; r > 0; r -= 2) {
      const t = r / 550;
      const alpha = 0.035 * Math.pow(t, 1.5);
      glow.circle(cx - 180, cy + 120, r).fill({ color: 0xdd5500, alpha });
    }

    // Layer 3: Deep red accent (upper center) - like bg7 reference
    for (let r = 420; r > 0; r -= 2) {
      const t = r / 420;
      const alpha = 0.028 * Math.pow(t, 1.5);
      glow.circle(cx - 60, cy - 80, r).fill({ color: 0xaa2200, alpha });
    }

    // Layer 4: Purple/magenta accent (right side)
    for (let r = 350; r > 0; r -= 2) {
      const t = r / 350;
      const alpha = 0.022 * Math.pow(t, 1.4);
      glow.circle(cx + 300, cy - 60, r).fill({ color: 0x6622cc, alpha });
    }

    // Layer 5: Golden core highlight (center) - bright and warm
    for (let r = 200; r > 0; r -= 2) {
      const t = r / 200;
      const alpha = 0.05 * Math.pow(t, 1.2);
      glow.circle(cx, cy - 40, r).fill({ color: 0xffcc44, alpha });
    }

    // Layer 6: Hot white center
    for (let r = 80; r > 0; r -= 1) {
      const t = r / 80;
      const alpha = 0.04 * Math.pow(t, 1.0);
      glow.circle(cx, cy - 20, r).fill({ color: 0xffffff, alpha });
    }

    // Top atmospheric haze
    glow.rect(0, 0, 1080, 480).fill({ color: 0x0c1424, alpha: 0.25 });
    // Bottom haze near keyboard - warm
    glow.rect(0, 1400, 1080, 520).fill({ color: 0x1a1008, alpha: 0.18 });
    // Horizontal light band across center
    glow.rect(0, 380, 1080, 200).fill({ color: 0x182848, alpha: 0.1 });
    // Warm haze near keyboard top
    for (let y = 0; y < 120; y += 1) {
      const t = y / 120;
      glow.rect(0, 1680 - y, 1080, 1).fill({ color: 0x331100, alpha: 0.08 * (1 - t) });
    }

    this.demoLayer.addChild(glow);
    this.demoAmbientGlow = glow;
  }

  private drawAmbientStars(): void {
    const stars = new Graphics();
    for (let i = 0; i < 100; i++) {
      const x = this.random.range(10, 1070);
      const y = this.random.range(10, 1680);
      const size = this.random.range(0.4, 2.2);
      const alpha = this.random.range(0.08, 0.35);
      stars.circle(x, y, size).fill({ color: 0xffffff, alpha });
    }
    this.demoLayer.addChild(stars);
    this.demoAmbientStars = stars;
  }

  private spawnDemoWave(): void {
    const pathStyle = this.config.pathStyle;
    const waveIndex = Math.floor(this.random.nextFloat() * 4);
    const waves: Array<Array<{ midi: number; tx: number; ty: number }>> = [
      [
        { midi: 48, tx: 180, ty: 200 }, { midi: 52, tx: 320, ty: 350 },
        { midi: 55, tx: 500, ty: 150 }, { midi: 60, tx: 680, ty: 400 },
        { midi: 64, tx: 850, ty: 250 }, { midi: 67, tx: 400, ty: 500 },
      ],
      [
        { midi: 50, tx: 150, ty: 450 }, { midi: 53, tx: 280, ty: 300 },
        { midi: 57, tx: 420, ty: 180 }, { midi: 60, tx: 560, ty: 120 },
        { midi: 64, tx: 700, ty: 180 }, { midi: 67, tx: 840, ty: 300 },
        { midi: 72, tx: 940, ty: 450 },
      ],
      [
        { midi: 45, tx: 100, ty: 300 }, { midi: 52, tx: 250, ty: 150 },
        { midi: 57, tx: 400, ty: 400 }, { midi: 62, tx: 550, ty: 200 },
        { midi: 67, tx: 700, ty: 350 }, { midi: 71, tx: 850, ty: 150 },
        { midi: 76, tx: 980, ty: 300 },
      ],
      [
        { midi: 48, tx: 350, ty: 250 }, { midi: 50, tx: 400, ty: 200 },
        { midi: 52, tx: 450, ty: 280 }, { midi: 55, tx: 500, ty: 180 },
        { midi: 57, tx: 550, ty: 240 }, { midi: 60, tx: 600, ty: 160 },
        { midi: 62, tx: 650, ty: 220 }, { midi: 64, tx: 700, ty: 280 },
      ],
    ];
    let wave = waves[waveIndex];

    // Apply path style ordering
    let orderedWave = [...wave];
    if (pathStyle === "random") {
      orderedWave = wave.map(item => ({ ...item })).sort(() => this.random.nextFloat() - 0.5);
    } else if (pathStyle === "reverse") {
      orderedWave = [...wave].reverse();
    } else if (pathStyle === "spiral") {
      // Sort by distance from center — pieces fly outward in a spiral pattern
      const cx = 540, cy = 400;
      orderedWave = wave.map(item => ({ ...item })).sort((a, b) => {
        const da = Math.hypot(a.tx - cx, a.ty - cy);
        const db = Math.hypot(b.tx - cx, b.ty - cy);
        return da - db;
      });
    } else if (pathStyle === "scattered") {
      // Random positions scattered across canvas
      const midis = [48, 50, 52, 55, 57, 60, 62, 64];
      orderedWave = midis.map(midi => ({
        midi,
        tx: this.random.range(100, 950),
        ty: this.random.range(100, 600)
      }));
    }

    orderedWave.forEach((item, index) => {
      const color = this.config.palette === "custom"
        ? parseInt(this.config.customColor.replace("#", ""), 16)
        : colorForPitch(this.config.palette, item.midi);
      const kbX = 80 + (item.midi - 36) * 8.5;
      const from = { x: kbX + this.random.signed(8), y: 1710 + this.random.range(-10, 10) };
      const target = { x: item.tx + this.random.signed(20), y: item.ty + this.random.signed(15) };
      const dx = target.x - from.x;
      const dy = target.y - from.y;
      const distance = Math.hypot(dx, dy) || 1;
      const side = index % 2 === 0 ? 1 : -1;
      const bend = (80 + this.random.range(0, 120)) * this.config.pathCurvature * getFxPresetTuning(this.config.preset).curveMultiplier;
      const control = {
        x: (from.x + target.x) / 2 - (dy / distance) * bend * side,
        y: (from.y + target.y) / 2 + (dx / distance) * bend * side
      };
      const graphic = this.createDemoNoteGraphic(color, item.midi);
      graphic.position.set(from.x, from.y);
      this.demoLayer.addChild(graphic);
      const targetGhost = new Graphics();
      targetGhost.roundRect(-14, -20, 28, 40, 5)
        .stroke({ color, width: 1.5, alpha: 0.2 });
      targetGhost.position.set(target.x, target.y);
      this.demoLayer.addChild(targetGhost);
      // Stagger timing based on path style
      let startMs: number;
      if (pathStyle === "random") {
        startMs = index * 180 + this.random.range(0, 300);
      } else if (pathStyle === "spiral") {
        startMs = index * 250 + this.random.range(0, 100);
      } else if (pathStyle === "scattered") {
        startMs = this.random.range(0, 1200);
      } else {
        startMs = index * 220 + this.random.range(0, 80);
      }
      this.demoPieces.push({
        id: `demo-${item.midi}-${index}-${waveIndex}`,
        midiNote: item.midi,
        from,
        target,
        color,
        startMs,
        durationMs: 1400 + this.random.range(0, 500),
        launched: false,
        locked: false,
        control,
        lastPosition: { ...from },
        pulseMs: 0,
        graphic,
        targetGraphic: targetGhost
      });
    });
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
    this.keyboardGlow.setPaused(this.paused);
    this.keyboardGlow.update(deltaSeconds, this.config.keyboardGlowEnabled && this.config.enabled, this.config.keyboardGlowIntensity);
    this.glowController.update(deltaMs);
    this.impactEffect.update(deltaMs);
    this.lightTrail.setPaused(this.paused);
    this.lightTrail.update(deltaMs);
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
          if (this.config.trailEnabled && this.config.particlesEnabled && this.config.particleDensity > 0.02) {
            this.emitTrail(position, trail, trail.color, trail.intensity);
          }
          if (this.config.smokeDensity > 0.02 && playbackTimeMs - trail.lastSmokeEmitMs >= this.config.smokeEmissionIntervalMs) {
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
            if (!this.isStardustPreset() && this.config.particlesEnabled && behavior === "high" && trail.emissionIndex % 2 === 0) {
              this.emitHighShimmer(position, { x: position.x - trail.x, y: position.y - trail.y }, trail.color, trail.intensity, trail.emissionIndex);
            }
            trail.lastSmokeEmitMs = playbackTimeMs;
            trail.emissionIndex += 1;
          }
          if (this.config.trailEnabled) this.recordTrail(trail, position);
          // Add point to light trail
          if (this.config.lightTrailEnabled && !this.isStardustPreset()) {
            this.lightTrail.addPoint(frame.pieceId, position.x, position.y);
          }
          trail.x = position.x;
          trail.y = position.y;
        }
      }
    }
    if (this.isVortexPreset() && this.config.particlesEnabled) {
      this.updateVortex(deltaMs);
    }
    if (this.isGalaxyPreset() && this.config.particlesEnabled) {
      this.updateGalaxy(deltaMs);
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

  setKeyboardGlowSize(width: number, height: number, pianoTopY: number): void {
    this.keyboardGlow.setSize(width, height, pianoTopY);
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
    this.keyboardGlow.dispose();
    this.lightTrail.dispose();
    this.assetPipeline.dispose();
    this.layer.destroy({ children: false });
  }

  private clearTransient(): void {
    this.particlePool.clear();
    this.smokeController.clear();
    this.glowController.clear();
    this.impactEffect.clear();
    this.keyboardGlow.clear();
    this.lightTrail.clear();
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
    this.vortexActive = false;
    this.vortexIntensity = 0;
    this.vortexSpawnTimer = 0;
    this.galaxyActive = false;
    this.galaxySpawnTimer = 0;
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
          velocity: 85 + piece.midiNote % 35,
          normalizedVelocity: (85 + piece.midiNote % 35) / 127,
          position: piece.from,
          durationMs: piece.durationMs,
          playbackTimeMs: this.demoTimeMs
        });
        this.onPieceLaunch({
          pieceId: piece.id,
          position: piece.from,
          targetPosition: piece.target,
          midiNote: piece.midiNote,
          intensity: 0.8 + (piece.midiNote % 25) / 100,
          playbackTimeMs: this.demoTimeMs
        });
      }
      const progress = Math.min(1, Math.max(0, (this.demoTimeMs - piece.startMs) / piece.durationMs));
      const eased = 1 - Math.pow(1 - progress, 3);
      const position = this.computeMotionPosition(piece, eased, progress);
      piece.graphic.position.set(position.x, position.y);
      piece.graphic.rotation = Math.sin(progress * Math.PI * 2.5 + piece.midiNote * 0.3) * 0.06;

      // Trail particles along the path
      const trail = this.trails.get(piece.id);
      if (trail && progress < 1) {
        const dist = Math.hypot(position.x - trail.x, position.y - trail.y);
        if (dist > 1.2) {
          if (this.config.trailEnabled && this.config.particlesEnabled && this.config.particleDensity > 0.02) {
            this.emitTrail(position, trail, trail.color, trail.intensity);
          }
          if (this.config.smokeDensity > 0.02 && this.demoTimeMs - trail.lastSmokeEmitMs >= this.config.smokeEmissionIntervalMs * 0.6) {
            const behavior = this.behaviorForMidi(trail.midiNote);
            if (this.config.smokeEnabled && getFxPresetTuning(this.config.preset).smokeMultiplier > 0) {
              this.emitSmokeAlongPath(
                { x: trail.x, y: trail.y }, position,
                this.smokeColorFor(behavior, trail.color),
                trail.intensity, behavior, trail.emissionIndex
              );
            }
            trail.lastSmokeEmitMs = this.demoTimeMs;
            trail.emissionIndex += 1;
          }
          this.recordTrail(trail, position);
          // Add point to light trail in demo mode
          if (this.config.lightTrailEnabled && !this.isStardustPreset()) {
            this.lightTrail.addPoint(piece.id, position.x, position.y);
          }
          trail.x = position.x;
          trail.y = position.y;
        }
      }

      // Glow pulse while moving — gated by glowEnabled + glowIntensity
      piece.pulseMs += deltaMs;
      if (piece.pulseMs >= 55 && progress < 0.95 && this.config.glowEnabled && this.config.glowIntensity > 0.02) {
        piece.pulseMs = 0;
        this.glowController.add(position, piece.color, this.config.glowIntensity * 0.85, this.config.revealDurationMs * 0.65, 30 + progress * 48);
      }
      piece.lastPosition = position;

      // Lock effect when reaching target position — cinematic flash
      if (progress >= 1 && !piece.locked) {
        piece.locked = true;
        const allLocked = this.demoPieces.every((p) => p.locked);
        this.onPieceLock({ pieceId: piece.id, position: piece.target, midiNote: piece.midiNote, intensity: 1.0, playbackTimeMs: this.demoTimeMs });
        // Multiple expanding rings — gated by impactIntensity
        if (this.config.impactIntensity > 0.02) {
          const ringColor = allLocked ? 0xffffff : piece.color;
          const ringScale = this.config.impactIntensity;
          this.demoFlashRings.push({ x: piece.target.x, y: piece.target.y, age: 0, maxAge: 350, maxRadius: (allLocked ? 500 : 140) * ringScale, color: ringColor });
          this.demoFlashRings.push({ x: piece.target.x, y: piece.target.y, age: -80, maxAge: 480, maxRadius: (allLocked ? 700 : 220) * ringScale, color: ringColor });
          this.demoFlashRings.push({ x: piece.target.x, y: piece.target.y, age: -160, maxAge: 600, maxRadius: (allLocked ? 900 : 300) * ringScale, color: ringColor });
        }
        // Burst particles — gated by particlesEnabled + particleDensity
        if (this.config.particlesEnabled && this.config.particleDensity > 0.02) {
          const bd = this.config.particleDensity;
          const burstCount = Math.round((allLocked ? 140 : 70) * bd * bd * bd);
          for (let i = 0; i < burstCount; i++) {
            const angle = (Math.PI * 2 * i) / burstCount + this.random.signed(0.15);
            const speed = this.random.range(14, allLocked ? 95 : 62);
            const texRoll = this.random.nextFloat();
            const texId: FxTextureId = texRoll < 0.35 ? "glow-orb" : texRoll < 0.6 ? "soft-orb" : texRoll < 0.8 ? "warm-orb" : "sharp-dot";
            this.tryAcquireParticle(
              { x: piece.target.x + this.random.signed(3), y: piece.target.y + this.random.signed(3) },
              { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
              this.random.range(allLocked ? 900 : 500, allLocked ? 1600 : 900),
              this.random.nextFloat() > 0.25 ? 0xffffff : piece.color,
              this.config.particleSize * this.random.range(1.0, allLocked ? 5.0 : 3.2),
              texId,
              allLocked ? 1.0 : 0.9
            );
          }
        }
        // Glow bursts — gated by glowEnabled + glowIntensity
        if (this.config.glowEnabled && this.config.glowIntensity > 0.02) {
          const gi = this.config.glowIntensity;
          this.glowController.add(piece.target, allLocked ? 0xffffff : piece.color, gi, allLocked ? 1400 : 800, allLocked ? 110 : 60);
          if (allLocked) {
            this.glowController.add(piece.target, piece.color, gi * 0.8, 1800, 160);
          }
        }
        // Full image reveal flash for last piece — gated by glowIntensity
        if (allLocked && this.demoRevealGraphic && this.config.glowIntensity > 0.02) {
          this.demoRevealGraphic.alpha = 0;
          this.demoRevealGraphic.visible = true;
          this.demoRevealFlashMs = 0;
        }
      }
    }
    // Update flash rings — multi-layer cinematic expanding rings
    const flashGraphics = this.demoLayer.getChildByName('flashRings') as Graphics | undefined;
    if (flashGraphics) flashGraphics.clear();
    for (let i = this.demoFlashRings.length - 1; i >= 0; i--) {
      const ring = this.demoFlashRings[i];
      ring.age += deltaMs;
      if (ring.age >= ring.maxAge) {
        this.demoFlashRings.splice(i, 1);
        continue;
      }
      const t = ring.age / ring.maxAge;
      const radius = ring.maxRadius * (0.05 + t * 0.95);
      const alpha = Math.pow(1 - t, 2.5) * 0.8;
      if (flashGraphics) {
        // Outer soft glow — big, faint, atmospheric
        flashGraphics.circle(ring.x, ring.y, radius * 1.4);
        flashGraphics.fill({ color: ring.color, alpha: alpha * 0.12 });
        // Mid ring
        flashGraphics.circle(ring.x, ring.y, radius);
        flashGraphics.fill({ color: ring.color, alpha: alpha * 0.45 });
        // Inner bright ring
        flashGraphics.circle(ring.x, ring.y, radius * 0.65);
        flashGraphics.fill({ color: 0xffffff, alpha: alpha * 0.35 });
        // Core bright spot
        flashGraphics.circle(ring.x, ring.y, radius * 0.2);
        flashGraphics.fill({ color: 0xffffff, alpha: alpha * 0.6 });
        // Thin ring outline for lens flare feel
        flashGraphics.circle(ring.x, ring.y, radius * 0.85);
        flashGraphics.stroke({ color: 0xffffff, width: 1.5, alpha: alpha * 0.3 });
      }
    }
    if (flashGraphics) flashGraphics.label = 'flashRings';

    // Update reveal flash for last piece — cinematic radial light burst
    if (this.demoRevealGraphic && this.demoRevealGraphic.visible) {
      this.demoRevealFlashMs += deltaMs;
      const revealDuration = 2400;
      const t = Math.min(1, this.demoRevealFlashMs / revealDuration);
      // Phase 1: bright flash in (0-20%)
      // Phase 2: radial sweep outward (20-60%)
      // Phase 3: gentle fade out (60-100%)
      let alpha: number;
      if (t < 0.2) {
        alpha = (t / 0.2) * 0.9;
      } else if (t < 0.6) {
        const sweep = (t - 0.2) / 0.4;
        alpha = 0.9 * (1 - sweep * 0.3);
      } else {
        alpha = 0.63 * Math.pow(1 - (t - 0.6) / 0.4, 1.8);
      }
      this.demoRevealGraphic.alpha = alpha;
      if (t >= 1) {
        this.demoRevealGraphic.visible = false;
        this.demoRevealGraphic.alpha = 0;
      }
    }

    // Respawn after all pieces locked
    const allLocked = this.demoPieces.length > 0 && this.demoPieces.every((p) => p.locked);
    const revealDone = !this.demoRevealGraphic || !this.demoRevealGraphic.visible;
    if (allLocked && this.demoTimeMs > 600 && revealDone) {
      this.demoTimeMs = 0;
      this.demoPieces = [];
      this.demoFlashRings = [];
      this.demoLayer.removeChildren().forEach((child) => child.destroy());
      this.demoBackdrop = undefined;
      this.demoRevealGraphic = undefined;
      // Rebuild background
      this.demoBackdrop = new Graphics();
      this.demoBackdrop.rect(0, 0, 1080, 1920).fill({ color: 0x050810, alpha: 1 });
      this.demoLayer.addChild(this.demoBackdrop);
      this.drawAmbientGlow();
      if (this.demoAmbientGlow) this.demoAmbientGlow.alpha = this.config.lightingIntensity;
      this.drawAmbientStars();
      if (this.demoAmbientStars) this.demoAmbientStars.alpha = this.config.lightingIntensity;
      this.drawPianoKeyboard();
      if (this.demoKeyboard) this.demoKeyboard.alpha = this.config.lightingIntensity < 0.01 ? 0 : 0.35 + this.config.lightingIntensity * 0.65;
      // Re-add reveal graphic
      this.demoRevealGraphic = new Graphics();
      this.demoRevealGraphic.rect(0, 0, 1080, 1920).fill({ color: 0xffffff, alpha: 0 });
      this.demoRevealGraphic.visible = false;
      this.demoLayer.addChild(this.demoRevealGraphic);
      this.spawnDemoWave();
    }
  }

  private clearDemo(): void {
    this.demoActive = false;
    this.demoTimeMs = 0;
    this.demoPieces = [];
    this.demoFlashRings = [];
    this.demoLayer.removeChildren().forEach((child) => child.destroy());
    this.demoBackdrop = undefined;
    this.demoRevealGraphic = undefined;
    this.demoAmbientGlow = undefined;
    this.demoAmbientStars = undefined;
    this.demoKeyboard = undefined;
  }

  private createDemoNoteGraphic(color: number, midiNote: number): Graphics {
    const graphic = new Graphics();
    const isBlack = [1, 3, 6, 8, 10].includes(midiNote % 12);
    const w = isBlack ? 28 : 36;
    const h = 52 + (midiNote % 12) * 3;
    const tabR = w * 0.22;
    const seed = midiNote * 7 + 13;
    const hasTab = [
      (seed % 3) !== 0,
      ((seed >> 2) % 3) !== 0,
      ((seed >> 4) % 3) !== 0,
      ((seed >> 6) % 3) !== 0,
    ];
    const glowLevel = this.config.glowIntensity;
    // Outer glow halo — only when glow is active
    if (glowLevel > 0.01) {
      graphic.circle(0, 0, Math.max(w, h) * 0.85)
        .fill({ color, alpha: 0.06 * glowLevel });
      graphic.circle(0, 0, Math.max(w, h) * 0.65)
        .fill({ color, alpha: 0.12 * glowLevel });
    }
    // Puzzle piece body with tabs
    const hw = w / 2, hh = h / 2;
    graphic.moveTo(-hw, -hh);
    if (hasTab[0]) { graphic.lineTo(-hw + 2, -hh); graphic.circle(-hw + w * 0.5, -hh - tabR * 0.7, tabR); graphic.lineTo(hw - 2, -hh); }
    else { graphic.lineTo(hw, -hh); }
    if (hasTab[1]) { graphic.lineTo(hw, -hh + 2); graphic.circle(hw + tabR * 0.7, -hh + h * 0.5, tabR); graphic.lineTo(hw, hh - 2); }
    else { graphic.lineTo(hw, hh); }
    if (hasTab[2]) { graphic.lineTo(hw - 2, hh); graphic.circle(hw - w * 0.5, hh + tabR * 0.7, tabR); graphic.lineTo(-hw + 2, hh); }
    else { graphic.lineTo(-hw, hh); }
    if (hasTab[3]) { graphic.lineTo(-hw, hh - 2); graphic.circle(-hw - tabR * 0.7, hh - h * 0.5, tabR); graphic.lineTo(-hw, -hh + 2); }
    else { graphic.lineTo(-hw, -hh); }
    graphic.closePath();
    graphic.fill({ color, alpha: Math.max(0.15, 0.92 * Math.max(glowLevel, 0.15)) });
    graphic.stroke({ color: 0xffffff, width: 1.8, alpha: Math.max(0.1, 0.55 * glowLevel) });

    // Inner glow highlight — only when glow is active
    if (glowLevel > 0.01) {
      graphic.roundRect(-hw * 0.5, -hh * 0.6, w * 0.5, h * 0.35, 3)
        .fill({ color: 0xffffff, alpha: 0.22 * glowLevel });
      graphic.circle(0, 0, 3)
        .fill({ color: 0xffffff, alpha: 0.6 * glowLevel });
    }

    return graphic;
  }

  private emitTrail(
    position: { x: number; y: number },
    target: { x: number; y: number } | TrailState,
    color: number,
    intensity: number,
    invert = false,
    fullPath = false
  ): void {
    if (this.config.particleDensity <= 0.02) return;
    if (this.isStardustPreset()) {
      this.emitStardustTrail(position, target, color, intensity, invert, fullPath);
      return;
    }
    const tuning = getFxPresetTuning(this.config.preset);
    const dx = target.x - position.x;
    const dy = target.y - position.y;
    const distance = Math.hypot(dx, dy) || 1;
    const direction = invert ? -1 : 1;
    const d2 = this.config.particleDensity;
    const count = Math.round(d2 * d2 * d2 * 30 * (0.35 + this.config.trailLength) * tuning.trailMultiplier);
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
    if (this.config.particleDensity <= 0.02) return;
    const tuning = getFxPresetTuning(this.config.preset);
    const sd = this.config.particleDensity;
    const count = Math.round(sd * sd * sd * 22 * tuning.sparkleMultiplier);
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

  private emitStardustTrail(
    position: { x: number; y: number },
    target: { x: number; y: number } | TrailState,
    color: number,
    intensity: number,
    invert: boolean,
    fullPath: boolean
  ): void {
    if (this.config.particleDensity <= 0.02) return;
    const tuning = getFxPresetTuning(this.config.preset);
    const hasTrail = "points" in target;
    const isLocalTrail = hasTrail && !fullPath;
    const from = hasTrail ? target.origin : position;
    const to = hasTrail ? target.targetPosition : target;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy) || 1;
    const normalX = -dy / distance;
    const normalY = dx / distance;
    const direction = invert ? -1 : 1;
    const behavior = hasTrail ? this.behaviorForMidi(target.midiNote) : "neutral";
    const d = this.config.particleDensity;
    const d3 = d * d * d;
    const count = isLocalTrail
      ? Math.round(d3 * 400)
      : Math.round(
          (behavior === "bass" ? 58 : behavior === "high" ? 52 : 55)
          * d3
          * tuning.trailMultiplier
          * 0.65
        );
    const control = hasTrail
      ? target.control
      : {
        x: from.x + dx * 0.5 + normalX * (this.random.nextFloat() > 0.5 ? 1 : -1) * (72 + distance * 0.15) * (0.45 + this.config.pathCurvature * 1.1) * tuning.curveMultiplier,
        y: from.y + dy * 0.5 + normalY * (this.random.nextFloat() > 0.5 ? 1 : -1) * (72 + distance * 0.15) * (0.45 + this.config.pathCurvature * 1.1) * tuning.curveMultiplier
      };
    const laneCount = isLocalTrail ? 1 : behavior === "bass" ? 3 : 2;
    const laneSpacing = behavior === "bass" ? 13 : behavior === "high" ? 8 : 10;
    const currentProgress = isLocalTrail
      ? Math.max(0, Math.min(1, Math.hypot(position.x - from.x, position.y - from.y) / distance))
      : 0;

    for (let index = 0; index < count; index += 1) {
      const along = isLocalTrail
        ? Math.max(0, Math.min(1, currentProgress - 0.16 + (index + this.random.nextFloat()) / count * 0.22))
        : (index + 0.2 + this.random.nextFloat() * 0.8) / count;
      const pathPoint = this.quadraticBezier(from, control, to, along);
      const derivative = {
        x: 2 * (1 - along) * (control.x - from.x) + 2 * along * (to.x - control.x),
        y: 2 * (1 - along) * (control.y - from.y) + 2 * along * (to.y - control.y)
      };
      const derivativeLength = Math.hypot(derivative.x, derivative.y) || 1;
      const tangentX = derivative.x / derivativeLength;
      const tangentY = derivative.y / derivativeLength;
      const localNormalX = -tangentY;
      const localNormalY = tangentX;
      const lane = isLocalTrail ? 0 : (index % laneCount) - (laneCount - 1) * 0.5;
      const laneBend = lane * laneSpacing * Math.sin(along * Math.PI);
      const spread = this.random.signed(isLocalTrail ? 4 + this.config.pathCurvature * 12 : 6 + this.config.pathCurvature * 22) * (0.35 + along * 0.9) + laneBend;
      const anchor = {
        x: pathPoint.x + localNormalX * spread,
        y: pathPoint.y + localNormalY * spread
      };
      const tangent = this.random.range(isLocalTrail ? 10 : 16, isLocalTrail ? 28 : 42) * (0.62 + intensity * 0.7);
      const curl = (0.45 + along) * tuning.swirl * this.random.signed(isLocalTrail ? 12 : 28 + this.config.pathCurvature * 26) * (behavior === "high" ? 1.28 : behavior === "bass" ? 0.72 : 1);
      const textureRoll = this.random.nextFloat();
      const textureId: FxTextureId = textureRoll < 0.25
        ? "glow-orb"
        : textureRoll < 0.55
          ? "soft-orb"
          : textureRoll < 0.78
            ? "warm-orb"
            : "sharp-dot";
      const textureScale = textureId === "glow-orb"
        ? 0.92
        : textureId === "soft-orb"
          ? 0.68
          : textureId === "warm-orb"
            ? 0.72
            : 0.48;
      const particleColor = index % 11 === 0 ? 0xffffff : color;
      const velocity = {
        x: direction * tangentX * tangent + localNormalX * curl,
        y: direction * tangentY * tangent + localNormalY * curl - this.random.range(1, isLocalTrail ? 6 : 12)
      };
      this.tryAcquireParticle(
        anchor,
        velocity,
        this.config.particleLifetimeMs * this.random.range(isLocalTrail ? 0.34 : 0.72, isLocalTrail ? 0.7 : 1.42),
        particleColor,
        this.config.particleSize * tuning.particleScale * textureScale * this.random.range(0.72, 1.42),
        textureId,
        (0.82 + intensity * 0.18) * this.random.range(0.85, 1.15)
      );
    }
  }

  private emitStardustNoteBurst(
    position: { x: number; y: number },
    color: number,
    intensity: number,
    behavior: FxSmokeBehavior
  ): void {
    if (this.config.particleDensity <= 0.02) return;
    const tuning = getFxPresetTuning(this.config.preset);
    const flashCount = behavior === "high" ? 4 : 6;
    for (let index = 0; index < flashCount; index += 1) {
      this.tryAcquireParticle(
        { x: position.x + this.random.signed(3), y: position.y + this.random.signed(3) },
        { x: this.random.signed(2), y: -this.random.range(3, 8) },
        this.random.range(200, 380),
        0xffffff,
        this.config.particleSize * tuning.particleScale * this.random.range(0.6, 1.0),
        "soft-bokeh",
        0.65 + intensity * 0.3
      );
    }
    const d3n = this.config.particleDensity;
    const count = Math.round((behavior === "bass" ? 72 : behavior === "high" ? 65 : 68) * d3n * d3n * d3n);
    const spread = behavior === "bass" ? 12 : behavior === "high" ? 7 : 10;
    const speed = behavior === "bass" ? 28 : behavior === "high" ? 48 : 36;

    for (let index = 0; index < count; index += 1) {
      const progress = (index + this.random.nextFloat()) / count;
      const angle = index * 2.399963 + this.random.signed(0.22);
      const radial = this.random.range(0.28, 1);
      const plume = 0.35 + progress * 0.9;
      const tangent = behavior === "high" ? 1.55 : behavior === "bass" ? 0.42 : 0.9;
      const radius = this.random.range(0.5, spread) * radial * (0.7 + plume * 0.34);
      const textureId: FxTextureId = behavior === "high"
        ? (index % 5 === 0 ? "glow-orb" : index % 2 === 0 ? "sharp-dot" : "soft-orb")
        : (index % 7 === 0 ? "glow-orb" : index % 5 === 0 ? "warm-orb" : index % 3 === 0 ? "sharp-dot" : "soft-orb");
      const textureScale = textureId === "glow-orb"
        ? 0.82
        : textureId === "soft-orb"
          ? 0.55
          : textureId === "warm-orb"
            ? 0.58
            : 0.42;
      const particleColor = index % 13 === 0 ? 0xffffff : color;
      const lateral = behavior === "bass" ? 1.6 : behavior === "high" ? 0.65 : 1;
      const upward = behavior === "bass"
        ? speed * (0.8 + plume * 0.75)
        : behavior === "high"
          ? speed * (1.1 + plume * 1.25)
          : speed * (0.95 + plume);
      this.tryAcquireParticle(
        {
          x: position.x + Math.cos(angle) * radius,
          y: position.y + Math.sin(angle) * radius * (behavior === "high" ? 0.32 : 0.52)
        },
        {
          x: Math.cos(angle) * speed * radial * lateral - Math.sin(angle) * speed * tangent * 0.28 + this.random.signed(7),
          y: -upward + Math.sin(angle) * speed * radial * 0.22 + Math.cos(angle) * speed * tangent * 0.14
        },
        this.config.particleLifetimeMs * this.random.range(0.72, behavior === "high" ? 1.45 : 1.7),
        particleColor,
        this.config.particleSize * tuning.particleScale * textureScale * this.random.range(0.82, 1.5) * (0.78 + intensity * 0.52),
        textureId,
        (0.62 + intensity * 0.34) * this.random.range(0.82, 1.16)
      );
    }
  }

  private emitStardustLockBurst(
    position: { x: number; y: number },
    color: number,
    intensity: number,
    behavior: FxSmokeBehavior
  ): void {
    if (this.config.particleDensity <= 0.02) return;
    const tuning = getFxPresetTuning(this.config.preset);
    const d3l = this.config.particleDensity;
    const count = Math.round((behavior === "high" ? 58 : behavior === "bass" ? 54 : 56) * d3l * d3l * d3l);
    const speed = behavior === "bass" ? 24 : behavior === "high" ? 38 : 30;
    for (let index = 0; index < (behavior === "high" ? 2 : 3); index += 1) {
      this.tryAcquireParticle(
        { x: position.x + this.random.signed(2), y: position.y + this.random.signed(2) },
        { x: this.random.signed(4), y: -this.random.range(2, 8) },
        this.random.range(120, 220),
        0xffffff,
        this.config.particleSize * tuning.particleScale * this.random.range(0.38, 0.66),
        "soft-bokeh",
        0.52 + intensity * 0.3
      );
    }

    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + this.random.signed(0.22);
      const radius = this.random.range(1, behavior === "high" ? 10 : 8);
      const curl = speed * (behavior === "high" ? 0.78 : behavior === "bass" ? 0.22 : 0.42);
      const textureId: FxTextureId = index % 7 === 0 ? "glow-orb" : index % 5 === 0 ? "warm-orb" : index % 3 === 0 ? "sharp-dot" : "soft-orb";
      const textureScale = textureId === "glow-orb"
        ? 0.88
        : textureId === "soft-orb"
          ? 0.62
          : textureId === "warm-orb"
            ? 0.65
            : 0.45;
      const particleColor = index % 9 === 0 ? 0xffffff : color;
      this.tryAcquireParticle(
        { x: position.x + Math.cos(angle) * radius, y: position.y + Math.sin(angle) * radius },
        {
          x: Math.cos(angle) * speed - Math.sin(angle) * curl + this.random.signed(4),
          y: Math.sin(angle) * speed - Math.cos(angle) * curl * 0.35 + this.random.signed(4)
        },
        this.config.particleLifetimeMs * this.random.range(0.48, 0.92),
        particleColor,
        this.config.particleSize * tuning.particleScale * textureScale * this.random.range(0.9, 1.7) * (0.78 + intensity * 0.52),
        textureId,
        (0.66 + intensity * 0.34) * this.random.range(0.84, 1.18)
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
    if (this.config.particleDensity <= 0.02) return;
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
    if (this.config.smokeDensity <= 0.02) return;
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
    if (this.config.smokeDensity <= 0.02) return;
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
    if (this.config.smokeDensity <= 0.02) return;
    const tuning = getFxPresetTuning(this.config.preset);
    const dx = current.x - previous.x;
    const dy = current.y - previous.y;
    const distance = Math.hypot(dx, dy) || 1;
    const normalX = -dy / distance;
    const normalY = dx / distance;
    const tangentSpeed = behavior === "bass" ? 4 : behavior === "high" ? 13 : 7;
    const sampleCount = behavior === "bass"
      ? Math.min(4, Math.max(2, Math.ceil(distance / 34)))
      : behavior === "high"
        ? 1
        : Math.min(3, Math.max(2, Math.ceil(distance / 42)));
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
      const sampleAlpha = baseAlpha * (1 - sampleIndex / Math.max(1, sampleCount) * 0.12);

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
      if (this.config.smokeLayerCount >= 2) {
        this.emitSmokeLayer(
          { x: basePosition.x + normalX * this.random.signed(7), y: basePosition.y + normalY * this.random.signed(7) },
          { x: baseVelocity.x * 0.72 + normalX * this.random.signed(4), y: baseVelocity.y * 0.72 + normalY * this.random.signed(4) },
          baseLifetime * 1.2,
          color,
          baseRadius * tuning.smokeVolumeScale * this.random.range(12, 18),
          sampleAlpha * (behavior === "high" ? 0.36 : 0.72),
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
    if (this.config.smokeDensity <= 0.02) return;
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
    if (this.isStardustPreset()) {
      const roll = this.random.nextFloat();
      return roll < 0.35 ? "glow-orb" : roll < 0.65 ? "soft-orb" : roll < 0.82 ? "warm-orb" : "sharp-dot";
    }
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
    const densityMultiplier = 0.55 + this.config.smokeDensity * 1.2;
    return Math.max(0.08, Math.min(2.6, tuning.smokeMultiplier * behaviorMultiplier * densityMultiplier));
  }

  private getColorForPitch(midiNote: number): number {
    if (this.config.palette === "custom") {
      return parseInt(this.config.customColor.replace("#", ""), 16);
    }
    return colorForPitch(this.config.palette, midiNote);
  }

  private smokeColorFor(behavior: FxSmokeBehavior, sourceColor: number): number {
    const neutralColor = behavior === "bass" ? 0xd4ad70 : behavior === "high" ? 0xe9dfbc : 0xc9cecc;
    const sourceWeight = this.config.palette === "neon" ? 0.14 : this.config.palette === "pitch-gradient" ? 0.08 : this.config.palette === "gold" ? 0.04 : 0.06;
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

  private stardustColorFor(behavior: FxSmokeBehavior, sourceColor: number, midiNote: number): number {
    let baseColor: number;
    if (this.config.preset === "pink-nebula") {
      // Dense pink/magenta field
      baseColor = behavior === "bass"
        ? 0xff0066
        : behavior === "high"
          ? (midiNote % 3 === 0 ? 0xff1493 : 0xff69b4)
          : (midiNote % 2 === 0 ? 0xcc0055 : 0xff3399);
    } else if (this.config.preset === "purple-vortex") {
      // Deep purple swirl
      baseColor = behavior === "bass"
        ? 0x6a00cc
        : behavior === "high"
          ? (midiNote % 3 === 0 ? 0x9b30ff : 0xb040ff)
          : (midiNote % 2 === 0 ? 0x8a2be2 : 0x7b00cc);
    } else if (this.config.preset === "sparkle-burst") {
      // Bright white sparkles
      baseColor = behavior === "bass"
        ? 0xf0f0ff
        : behavior === "high"
          ? (midiNote % 3 === 0 ? 0xffffff : 0xf8f8ff)
          : (midiNote % 2 === 0 ? 0xe8e8ff : 0xf0f0ff);
    } else if (this.config.preset === "firework-streaks") {
      // Cool white streaks
      baseColor = behavior === "bass"
        ? 0xe0e8ff
        : behavior === "high"
          ? (midiNote % 3 === 0 ? 0xffffff : 0xd8e0ff)
          : (midiNote % 2 === 0 ? 0xd0d8ff : 0xe8f0ff);
    } else if (this.isVortexPreset()) {
      baseColor = behavior === "bass"
        ? 0xff4500
        : behavior === "high"
          ? (midiNote % 3 === 0 ? 0xff6600 : 0xffaa00)
          : (midiNote % 2 === 0 ? 0xff5500 : 0xff8800);
    } else if (this.isGalaxyPreset()) {
      baseColor = behavior === "bass"
        ? 0x9b30ff
        : behavior === "high"
          ? (midiNote % 3 === 0 ? 0xff69b4 : 0x00bfff)
          : (midiNote % 2 === 0 ? 0xda70d6 : 0x9370db);
    } else if (this.isEtherealPreset()) {
      baseColor = behavior === "bass"
        ? 0xc0c0c0
        : behavior === "high"
          ? (midiNote % 3 === 0 ? 0xffffff : 0xe8e8ff)
          : (midiNote % 2 === 0 ? 0xd0d0ff : 0xf0f0ff);
    } else {
      baseColor = behavior === "bass"
        ? 0xff8f32
        : behavior === "high"
          ? (midiNote % 3 === 0 ? 0xff55c9 : 0x7b9dff)
          : (midiNote % 2 === 0 ? 0xffd36a : 0xff72c8);
    }
    const sourceWeight = this.config.palette === "artwork"
      ? 0.22
      : this.config.palette === "pitch-gradient"
        ? 0.38
        : 0.14;
    const baseRed = (baseColor >> 16) & 0xff;
    const baseGreen = (baseColor >> 8) & 0xff;
    const baseBlue = baseColor & 0xff;
    const sourceRed = (sourceColor >> 16) & 0xff;
    const sourceGreen = (sourceColor >> 8) & 0xff;
    const sourceBlue = sourceColor & 0xff;
    const red = Math.round(baseRed * (1 - sourceWeight) + sourceRed * sourceWeight);
    const green = Math.round(baseGreen * (1 - sourceWeight) + sourceGreen * sourceWeight);
    const blue = Math.round(baseBlue * (1 - sourceWeight) + sourceBlue * sourceWeight);
    return (red << 16) | (green << 8) | blue;
  }

  private behaviorForMidi(midiNote: number): FxSmokeBehavior {
    if (midiNote < this.config.bassThreshold) return "bass";
    if (midiNote >= this.config.highThreshold) return "high";
    return "neutral";
  }

  private isStardustPreset(): boolean {
    return this.config.preset === "stardust-stream" || this.config.preset === "vortex-fire" || this.config.preset === "galaxy-swirl" || this.config.preset === "ethereal-white"
      || this.config.preset === "pink-nebula" || this.config.preset === "sparkle-burst"
      || this.config.preset === "firework-streaks" || this.config.preset === "purple-vortex";
  }

  private isVortexPreset(): boolean {
    return this.config.preset === "vortex-fire" || this.config.preset === "purple-vortex";
  }

  private isGalaxyPreset(): boolean {
    return this.config.preset === "galaxy-swirl" || this.config.preset === "pink-nebula";
  }

  private isEtherealPreset(): boolean {
    return this.config.preset === "ethereal-white" || this.config.preset === "sparkle-burst" || this.config.preset === "firework-streaks";
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
    if (!this.config.enabled || !this.config.trailEnabled || this.isStardustPreset()) return;
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

  private updateVortex(deltaMs: number): void {
    if (!this.vortexActive) {
      this.vortexActive = true;
      this.vortexAngle = 0;
      this.vortexCenter = { x: 540, y: 550 };
      this.vortexIntensity = 0;
    }
    this.vortexIntensity = Math.min(1, this.vortexIntensity + deltaMs * 0.001);
    this.vortexAngle += deltaMs * 0.0008;
    this.vortexSpawnTimer += deltaMs;
    if (this.vortexSpawnTimer < 5) return;
    this.vortexSpawnTimer = 0;
    const tuning = getFxPresetTuning(this.config.preset);
    const vd = this.config.particleDensity;
    const baseCount = Math.round(14 * vd * vd * vd * tuning.trailMultiplier * this.vortexIntensity);
    for (let i = 0; i < baseCount; i++) {
      const t = this.random.nextFloat();
      const spiralAngle = this.vortexAngle + t * Math.PI * 6 + this.random.signed(0.3);
      const radius = 40 + t * 320 + this.random.signed(18);
      const x = this.vortexCenter.x + Math.cos(spiralAngle) * radius;
      const y = this.vortexCenter.y + Math.sin(spiralAngle) * radius * 0.45;
      const tangentAngle = spiralAngle + Math.PI * 0.5;
      const speed = 12 + t * 22;
      const vx = Math.cos(tangentAngle) * speed + this.random.signed(4);
      const vy = Math.sin(tangentAngle) * speed * 0.45 + this.random.signed(3) - 6;
      const behavior = t < 0.25 ? "bass" : t > 0.75 ? "high" : "neutral";
      const sourceColor = colorForPitch(this.config.palette, 48 + Math.round(t * 48));
      const color = this.stardustColorFor(behavior, sourceColor, 48 + Math.round(t * 48));
      const textureRoll = this.random.nextFloat();
      const textureId: FxTextureId = textureRoll < 0.3 ? "glow-orb" : textureRoll < 0.55 ? "soft-orb" : textureRoll < 0.78 ? "warm-orb" : "ice-orb";
      const textureScale = textureId === "glow-orb" ? 0.72 : textureId === "soft-orb" ? 0.55 : textureId === "warm-orb" ? 0.58 : 0.52;
      this.tryAcquireParticle(
        { x, y },
        { x: vx, y: vy },
        this.config.particleLifetimeMs * this.random.range(0.6, 1.8),
        this.random.nextFloat() > 0.9 ? 0xffffff : color,
        this.config.particleSize * tuning.particleScale * textureScale * this.random.range(0.8, 1.6) * (0.7 + this.vortexIntensity * 0.3),
        textureId,
        (0.55 + this.vortexIntensity * 0.35) * this.random.range(0.8, 1.2)
      );
    }
    if (this.config.smokeEnabled && tuning.smokeMultiplier > 0 && this.random.nextFloat() < 0.3) {
      const smokeAngle = this.vortexAngle * 0.7 + this.random.signed(0.5);
      const smokeRadius = 60 + this.random.range(0, 200);
      const sx = this.vortexCenter.x + Math.cos(smokeAngle) * smokeRadius;
      const sy = this.vortexCenter.y + Math.sin(smokeAngle) * smokeRadius * 0.4;
      this.tryAcquireSmoke(
        { x: sx, y: sy },
        { x: Math.cos(smokeAngle + 1.2) * 5, y: -3 },
        this.config.particleLifetimeMs * 2.5,
        0xff6600,
        this.config.particleSize * 18 * this.random.range(0.8, 1.3),
        0.08 * tuning.smokeMultiplier,
        "volume",
        "neutral"
      );
    }
  }

  private updateGalaxy(deltaMs: number): void {
    if (!this.galaxyActive) {
      this.galaxyActive = true;
      this.galaxyAngle = 0;
    }
    this.galaxyAngle += deltaMs * 0.0005;
    this.galaxySpawnTimer += deltaMs;
    if (this.galaxySpawnTimer < 6) return;
    this.galaxySpawnTimer = 0;
    const tuning = getFxPresetTuning(this.config.preset);
    const gd = this.config.particleDensity;
    const baseCount = Math.round(12 * gd * gd * gd * tuning.trailMultiplier);
    for (let i = 0; i < baseCount; i++) {
      const t = this.random.nextFloat();
      const armAngle = this.galaxyAngle + t * Math.PI * 4 + (i % 2 === 0 ? 0 : Math.PI * 2 / 3) + this.random.signed(0.4);
      const radius = 30 + t * 280 + this.random.signed(15);
      const x = 540 + Math.cos(armAngle) * radius;
      const y = 550 + Math.sin(armAngle) * radius * 0.4;
      const tangentAngle = armAngle + Math.PI * 0.5;
      const speed = 8 + t * 16;
      const vx = Math.cos(tangentAngle) * speed + this.random.signed(3);
      const vy = Math.sin(tangentAngle) * speed * 0.4 + this.random.signed(2) - 4;
      const behavior = t < 0.3 ? "bass" : t > 0.7 ? "high" : "neutral";
      const sourceColor = colorForPitch(this.config.palette, 40 + Math.round(t * 56));
      const color = this.stardustColorFor(behavior, sourceColor, 40 + Math.round(t * 56));
      const textureRoll = this.random.nextFloat();
      const textureId: FxTextureId = textureRoll < 0.25 ? "glow-orb" : textureRoll < 0.5 ? "soft-orb" : textureRoll < 0.72 ? "ice-orb" : "sharp-dot";
      const textureScale = textureId === "glow-orb" ? 0.65 : textureId === "soft-orb" ? 0.48 : textureId === "ice-orb" ? 0.52 : 0.38;
      this.tryAcquireParticle(
        { x, y },
        { x: vx, y: vy },
        this.config.particleLifetimeMs * this.random.range(0.7, 2.0),
        this.random.nextFloat() > 0.92 ? 0xffffff : color,
        this.config.particleSize * tuning.particleScale * textureScale * this.random.range(0.7, 1.5),
        textureId,
        (0.45 + this.config.glowIntensity * 0.4) * this.random.range(0.8, 1.2)
      );
    }
    if (this.config.smokeEnabled && tuning.smokeMultiplier > 0 && this.random.nextFloat() < 0.25) {
      const smokeAngle = this.galaxyAngle * 0.6 + this.random.signed(0.6);
      const smokeRadius = 50 + this.random.range(0, 180);
      this.tryAcquireSmoke(
        { x: 540 + Math.cos(smokeAngle) * smokeRadius, y: 550 + Math.sin(smokeAngle) * smokeRadius * 0.4 },
        { x: Math.cos(smokeAngle + 1) * 4, y: -2 },
        this.config.particleLifetimeMs * 2.2,
        0x9944cc,
        this.config.particleSize * 15 * this.random.range(0.8, 1.2),
        0.06 * tuning.smokeMultiplier,
        "volume",
        "neutral"
      );
    }
  }

  private computeMotionPosition(piece: DemoPiece, eased: number, progress: number): { x: number; y: number } {
    const motion = this.config.particleMotion;
    const from = piece.from;
    const target = piece.target;
    if (motion === "linear") {
      return {
        x: from.x + (target.x - from.x) * eased,
        y: from.y + (target.y - from.y) * eased
      };
    }
    if (motion === "spiral") {
      const cx = (from.x + target.x) / 2;
      const cy = (from.y + target.y) / 2;
      const radius = Math.hypot(target.x - from.x, target.y - from.y) * 0.4;
      const angle = progress * Math.PI * 3 + piece.midiNote * 0.5;
      const expand = eased;
      return {
        x: cx + Math.cos(angle) * radius * expand + (target.x - cx) * eased,
        y: cy + Math.sin(angle) * radius * expand + (target.y - cy) * eased
      };
    }
    if (motion === "orbital") {
      const baseX = from.x + (target.x - from.x) * eased;
      const baseY = from.y + (target.y - from.y) * eased;
      const orbitR = 30 + (1 - eased) * 40;
      const angle = progress * Math.PI * 6 + piece.midiNote * 0.7;
      return {
        x: baseX + Math.cos(angle) * orbitR,
        y: baseY + Math.sin(angle) * orbitR * 0.5
      };
    }
    if (motion === "random-wobble") {
      const baseX = from.x + (target.x - from.x) * eased;
      const baseY = from.y + (target.y - from.y) * eased;
      const wobbleX = Math.sin(progress * 12 + piece.midiNote) * 35 * (1 - eased * 0.7);
      const wobbleY = Math.cos(progress * 9 + piece.midiNote * 1.3) * 25 * (1 - eased * 0.7);
      return { x: baseX + wobbleX, y: baseY + wobbleY };
    }
    // Default: curved (bezier)
    return this.quadraticBezier(from, piece.control, target, eased);
  }

  private quadraticBezier(from: { x: number; y: number }, control: { x: number; y: number }, target: { x: number; y: number }, t: number): { x: number; y: number } {
    const inverse = 1 - t;
    return {
      x: inverse * inverse * from.x + 2 * inverse * t * control.x + t * t * target.x,
      y: inverse * inverse * from.y + 2 * inverse * t * control.y + t * t * target.y
    };
  }
}
