import { Container, Graphics } from "pixi.js";
import type { GeometryPiece } from "../geometry/models";
import type { PieceAnimationFrame } from "../animation/models";
export class PuzzlePieceView {
  readonly container = new Container();
  private readonly shape = new Graphics();
  constructor(piece: GeometryPiece, scale = 1) {
    this.container.zIndex = piece.layer;
    const path = piece.polygon.map((p) => ({ x: p.x * scale, y: p.y * scale }));
    if (path.length) { this.shape.poly(path).fill({ color: 0x78a8ff, alpha: 0.16 }).stroke({ color: 0x8ed0ff, width: 1, alpha: 0.65 }); }
    this.container.addChild(this.shape);
  }
  update(frame: PieceAnimationFrame, scale = 1) { this.container.visible = frame.visible; this.container.position.set((frame.currentPosition.x - frame.targetPosition.x) * scale, (frame.currentPosition.y - frame.targetPosition.y) * scale); this.container.alpha = frame.opacity; this.container.rotation = frame.rotation; this.container.scale.set(frame.scale); }
}
