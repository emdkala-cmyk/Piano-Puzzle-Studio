import { Container } from "pixi.js";
import type { GeometryResult } from "../geometry/models";
import type { PieceAnimationFrame } from "../animation/models";
import { PuzzlePieceView } from "./puzzle-piece-view";
export class PuzzleRenderer {
  readonly layer = new Container();
  private views = new Map<string, PuzzlePieceView>();
  constructor() { this.layer.sortableChildren = true; }
  rebuild(geometry: GeometryResult, scale = 1) { this.layer.removeChildren(); this.views.clear(); for (const piece of geometry.pieces) { const view = new PuzzlePieceView(piece, scale); this.views.set(piece.id, view); this.layer.addChild(view.container); } }
  update(frames: PieceAnimationFrame[], scale = 1) { for (const frame of frames) this.views.get(frame.pieceId)?.update(frame, scale); }
}
