import { Container, Graphics, Sprite, Texture } from "pixi.js";
import type { GeometryPiece } from "./models";
export function renderGeometry(container: Container, imageUrl: string, pieces: GeometryPiece[], viewWidth: number, viewHeight: number, imageWidth: number, imageHeight: number) {
  container.removeChildren(); const scale = Math.min(viewWidth / imageWidth, viewHeight / imageHeight); const offsetX = (viewWidth - imageWidth * scale) / 2, offsetY = (viewHeight - imageHeight * scale) / 2;
  pieces.forEach((piece) => { const sprite = new Sprite(Texture.from(imageUrl)); sprite.x = offsetX; sprite.y = offsetY; sprite.width = imageWidth * scale; sprite.height = imageHeight * scale; const mask = new Graphics(); mask.poly(piece.polygon.map((p) => ({ x: offsetX + p.x * scale, y: offsetY + p.y * scale }))).fill(0xffffff); container.addChild(sprite); sprite.mask = mask; container.addChild(mask); });
}
