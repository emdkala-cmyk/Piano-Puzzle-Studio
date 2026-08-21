import { Container, Graphics, Sprite, Texture } from "pixi.js";
import type { GeometryPiece } from "../geometry/models";
import type { PieceAnimationFrame } from "../animation/models";
import type { RegionPlacement } from "../composition/coordinate-transform";
export class PuzzlePieceView {
  readonly container = new Container();
  private readonly shape = new Graphics();
  private readonly pivotX: number;
  private readonly pivotY: number;
  constructor(piece: GeometryPiece, scale = 1, texture?: Texture, placement?: RegionPlacement, showBorders = false) {
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
      const mask = new Graphics();
      mask.poly(path).fill(0xffffff);
      sprite.mask = mask;
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
  }
}
