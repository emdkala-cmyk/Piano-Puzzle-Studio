import { Container, Graphics, type Texture } from "pixi.js";
import type { GeometryResult } from "../geometry/models";
import type { AnimationTimingSettings, PieceAnimationFrame } from "../animation/models";
import type { RegionPlacement } from "../composition/coordinate-transform";
import { PuzzlePieceView } from "./puzzle-piece-view";

export class PuzzleRenderer {
  readonly layer = new Container();
  private views = new Map<string, PuzzlePieceView>();
  private readonly glowOverlay = new Graphics();
  private glowActive = false;
  private glowStartTimeMs = 0;
  private glowCenter = { x: 0, y: 0 };
  private glowRadius = 0;
  private totalPieces = 0;

  constructor() {
    this.layer.sortableChildren = true;
    this.layer.addChild(this.glowOverlay);
  }

  rebuild(geometry: GeometryResult, scale = 1, texture?: Texture, placement?: RegionPlacement, showBorders = false, revealNoiseTexture?: Texture) {
    for (const view of this.views.values()) view.destroy();
    this.layer.removeChildren();
    this.views.clear();
    this.totalPieces = geometry.pieces.length;
    // Re-add glow overlay on top
    this.glowOverlay.clear();
    this.glowActive = false;
    this.layer.addChild(this.glowOverlay);
    for (const piece of geometry.pieces) {
      const view = new PuzzlePieceView(piece, scale, texture, placement, showBorders, revealNoiseTexture);
      this.views.set(piece.id, view);
      this.layer.addChild(view.container);
    }
  }

  update(
    frames: PieceAnimationFrame[],
    scale = 1,
    timing?: AnimationTimingSettings,
    currentTimeMs = 0
  ) {
    // Compute completion ratio: fraction of pieces that have arrived
    let arrivedCount = 0;
    let totalVisible = 0;
    let centerX = 0, centerY = 0;
    for (const frame of frames) {
      if (frame.state === "cancelled" || frame.state === "hidden") continue;
      totalVisible += 1;
      if (frame.state === "arrived") {
        arrivedCount += 1;
        centerX += frame.targetPosition.x;
        centerY += frame.targetPosition.y;
      }
    }
    const completionRatio = totalVisible > 0 ? arrivedCount / totalVisible : 0;
    const justCompleted = completionRatio >= 1 && !this.glowActive && arrivedCount > 0;

    if (justCompleted && timing?.glassEnabled) {
      // Trigger completion glow
      this.glowActive = true;
      this.glowStartTimeMs = currentTimeMs;
      this.glowCenter = { x: (centerX / arrivedCount) * scale, y: (centerY / arrivedCount) * scale };
      this.glowRadius = Math.max(400, Math.hypot(centerX, centerY) * scale * 0.5);
    }

    if (!timing?.glassEnabled) this.glowActive = false;

    // Update glow overlay
    if (this.glowActive && timing?.glassEnabled) {
      const elapsed = currentTimeMs - this.glowStartTimeMs;
      const duration = timing.completionGlowDurationMs;
      const progress = Math.min(1, elapsed / Math.max(1, duration));
      // Glow fades in quickly, then fades out slowly
      const glowAlpha = progress < 0.25
        ? (progress / 0.25) * timing.completionGlowIntensity
        : timing.completionGlowIntensity * (1 - (progress - 0.25) / 0.75);

      this.glowOverlay.clear();
      if (glowAlpha > 0.01) {
        // Radial glow rings expanding outward
        const rings = 6;
        for (let i = 0; i < rings; i++) {
          const ringProgress = i / rings;
          const ringRadius = this.glowRadius * (0.3 + ringProgress * 0.7) * (0.8 + progress * 0.4);
          const ringAlpha = glowAlpha * (1 - ringProgress) * 0.3;
          this.glowOverlay.circle(this.glowCenter.x, this.glowCenter.y, ringRadius)
            .fill({ color: 0xffffff, alpha: ringAlpha });
        }
        // Central bright spot
        this.glowOverlay.circle(this.glowCenter.x, this.glowCenter.y, this.glowRadius * 0.25 * (0.5 + progress * 0.8))
          .fill({ color: 0xfffce8, alpha: glowAlpha * 0.45 });
      }
      if (progress >= 1) this.glowActive = false;
    } else if (!this.glowActive) {
      this.glowOverlay.clear();
    }

    // Pass completion ratio and timing to each piece view
    for (const frame of frames) {
      const view = this.views.get(frame.pieceId);
      if (view) view.update(frame, scale, timing, completionRatio);
    }
  }
}
