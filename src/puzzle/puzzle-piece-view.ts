import { Container, Graphics, Sprite, Texture } from "pixi.js";
import type { GeometryPiece } from "../geometry/models";
import type { PieceAnimationFrame } from "../animation/models";
import type { RegionPlacement } from "../composition/coordinate-transform";
import { DissolveRevealFilter } from "./dissolve-reveal-filter";

export class PuzzlePieceView {
  readonly container = new Container();
  private readonly shape = new Graphics();
  private readonly pivotX: number;
  private readonly pivotY: number;
  private artwork?: Sprite;
  private ghost?: Sprite;
  private revealFilter?: DissolveRevealFilter;
  private ghostRevealFilter?: DissolveRevealFilter;

  constructor(
    piece: GeometryPiece,
    scale = 1,
    texture?: Texture,
    placement?: RegionPlacement,
    showBorders = false,
    revealNoiseTexture?: Texture
  ) {
    this.container.zIndex = piece.layer;
    this.container.visible = false;
    this.pivotX = piece.centroid.x * scale;
    this.pivotY = piece.centroid.y * scale;
    this.container.pivot.set(this.pivotX, this.pivotY);
    const path = piece.polygon.map((p) => ({ x: p.x * scale, y: p.y * scale }));
    if (texture && placement && path.length) {
      const sprite = new Sprite(texture);
      sprite.x = placement.offsetX * scale;
      sprite.y = placement.offsetY * scale;
      sprite.width = texture.width * placement.scale * scale;
      sprite.height = texture.height * placement.scale * scale;
      const inflatedPath = path.map((p) => {
        const dx = p.x - this.pivotX, dy = p.y - this.pivotY, len = Math.hypot(dx, dy) || 1;
        const factor = (len + 0.75) / len;
        return { x: this.pivotX + dx * factor, y: this.pivotY + dy * factor };
      });
      const mask = new Graphics();
      mask.poly(inflatedPath).fill(0xffffff);
      sprite.mask = mask;

      this.artwork = sprite;
      if (revealNoiseTexture) {
        const seed = stableSeed(piece.id);
        const ghost = new Sprite(texture);
        ghost.x = sprite.x;
        ghost.y = sprite.y;
        ghost.width = sprite.width;
        ghost.height = sprite.height;
        ghost.tint = 0xffc46b;
        ghost.blendMode = "screen";
        ghost.alpha = 0;
        const ghostMask = new Graphics();
        ghostMask.poly(inflatedPath).fill(0xffffff);
        ghost.mask = ghostMask;
        this.revealFilter = new DissolveRevealFilter(revealNoiseTexture, seed);
        this.ghostRevealFilter = new DissolveRevealFilter(revealNoiseTexture, (seed * 1.73) % 1, true);
        sprite.filters = [this.revealFilter];
        ghost.filters = [this.ghostRevealFilter];
        this.ghost = ghost;
        this.container.addChild(ghost, ghostMask);
      }

      this.container.addChild(sprite, mask);
      if (showBorders) this.shape.poly(path).stroke({ color: 0x8ed0ff, width: 1, alpha: 0.5 });
    } else if (path.length) {
      this.shape.poly(path).fill({ color: 0x78a8ff, alpha: 0.16 }).stroke({ color: 0x8ed0ff, width: 1, alpha: 0.65 });
    }
    this.container.addChild(this.shape);
  }

  update(frame: PieceAnimationFrame, scale = 1) {
    this.container.visible = frame.visible;
    this.container.position.set(this.pivotX + (frame.currentPosition.x - frame.targetPosition.x) * scale, this.pivotY + (frame.currentPosition.y - frame.targetPosition.y) * scale);
    this.container.alpha = frame.opacity;
    this.container.rotation = frame.rotation;
    this.container.scale.set(frame.scale);

    if (!this.artwork) return;

    const revealProgress = frame.state === "arrived" ? 1 : Math.max(0, Math.min(1, frame.progress));
    const revealAlpha = frame.state === "arrived" ? 1 : smoothstep(0.035, 0.24, revealProgress);
    this.artwork.alpha = revealAlpha;

    if (!this.revealFilter || !this.ghost || !this.ghostRevealFilter) return;

    const arrivalAge = Math.max(0, frame.elapsedMs - frame.durationMs);
    const lockEdge = frame.state === "arrived" ? 1 - smoothstep(0, 180, arrivalAge) : 0;
    const movingEdge = frame.state === "moving" ? 0.28 + (1 - revealProgress) * 0.72 : 0;
    const filtersActive = frame.visible && (frame.state !== "arrived" || arrivalAge < 180);

    this.revealFilter.enabled = filtersActive;
    this.ghostRevealFilter.enabled = filtersActive;
    this.revealFilter.progress = revealProgress;
    this.revealFilter.edgeIntensity = frame.state === "moving" ? 0.16 + (1 - revealProgress) * 0.36 : 0.04 * lockEdge;
    this.ghostRevealFilter.progress = revealProgress;
    this.ghostRevealFilter.edgeIntensity = frame.state === "moving" ? 0.95 : lockEdge * 0.9;
    this.ghost.alpha = Math.min(0.78, (movingEdge + lockEdge) * 0.66);
    this.ghost.visible = frame.visible && this.ghost.alpha > 0.001;
  }

  destroy(): void {
    this.revealFilter?.destroy();
    this.ghostRevealFilter?.destroy();
    this.container.destroy({ children: true });
  }
}

function stableSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(0.0001, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
