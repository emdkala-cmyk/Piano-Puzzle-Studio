import { Container, Sprite, Texture, type Texture as TextureType } from "pixi.js";
import type { GeometryResult } from "../geometry/models";
import type { AnimationTimingSettings, PieceAnimationFrame } from "../animation/models";
import type { RegionPlacement } from "../composition/coordinate-transform";
import { PuzzlePieceView } from "./puzzle-piece-view";

/**
 * Pre-render a soft radial gradient texture (canvas 2D → GPU texture).
 * Used for the completion glow — replaces per-frame Graphics circles.
 */
function makeGlowTexture(): Texture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  // Soft Gaussian-like falloff
  grad.addColorStop(0.0, "rgba(255,255,255,1.0)");
  grad.addColorStop(0.15, "rgba(255,255,248,0.6)");
  grad.addColorStop(0.35, "rgba(255,252,232,0.25)");
  grad.addColorStop(0.6, "rgba(255,248,220,0.06)");
  grad.addColorStop(1.0, "rgba(255,245,210,0.0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(canvas);
}

export class PuzzleRenderer {
  readonly layer = new Container();
  private views = new Map<string, PuzzlePieceView>();
  private readonly glowSprite: Sprite;
  private readonly glowTex: TextureType;
  private glowActive = false;
  private glowStartTimeMs = 0;
  private glowCenter = { x: 0, y: 0 };
  private glowRadius = 0;
  private totalPieces = 0;

  constructor() {
    this.glowTex = makeGlowTexture();
    this.glowSprite = new Sprite(this.glowTex);
    this.glowSprite.anchor.set(0.5, 0.5);
    this.glowSprite.visible = false;
    this.glowSprite.blendMode = "add";
    this.layer.sortableChildren = true;
    this.layer.addChild(this.glowSprite);
  }

  rebuild(geometry: GeometryResult, scale = 1, texture?: TextureType, placement?: RegionPlacement, showBorders = false, revealNoiseTexture?: TextureType) {
    for (const view of this.views.values()) view.destroy();
    this.layer.removeChildren();
    this.views.clear();
    this.totalPieces = geometry.pieces.length;
    // Re-add glow sprite on top
    this.glowActive = false;
    this.glowSprite.visible = false;
    this.layer.addChild(this.glowSprite);
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
    // Compute completion ratio
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
      this.glowActive = true;
      this.glowStartTimeMs = currentTimeMs;
      this.glowCenter = { x: (centerX / arrivedCount) * scale, y: (centerY / arrivedCount) * scale };
      this.glowRadius = Math.max(400, Math.hypot(centerX, centerY) * scale * 0.5);
    }

    if (!timing?.glassEnabled) this.glowActive = false;

    // Update glow sprite (GPU — single draw call)
    if (this.glowActive && timing?.glassEnabled) {
      const elapsed = currentTimeMs - this.glowStartTimeMs;
      const duration = timing.completionGlowDurationMs;
      const progress = Math.min(1, elapsed / Math.max(1, duration));
      const glowAlpha = progress < 0.25
        ? (progress / 0.25) * timing.completionGlowIntensity
        : timing.completionGlowIntensity * (1 - (progress - 0.25) / 0.75);

      if (glowAlpha > 0.01) {
        const radius = this.glowRadius * (0.5 + progress * 0.5);
        this.glowSprite.visible = true;
        this.glowSprite.position.set(this.glowCenter.x, this.glowCenter.y);
        this.glowSprite.width = radius * 2;
        this.glowSprite.height = radius * 2;
        this.glowSprite.alpha = glowAlpha;
      } else {
        this.glowSprite.visible = false;
      }
      if (progress >= 1) {
        this.glowActive = false;
        this.glowSprite.visible = false;
      }
    } else if (!this.glowActive) {
      this.glowSprite.visible = false;
    }

    // Pass completion ratio and timing to each piece view
    for (const frame of frames) {
      const view = this.views.get(frame.pieceId);
      if (view) view.update(frame, scale, timing, completionRatio);
    }
  }
}
