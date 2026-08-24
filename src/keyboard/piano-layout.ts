import type { KeyboardType, PianoKey, Point } from "./models";

const NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const BLACK = new Set([1, 3, 6, 8, 10]);
// Fraction of the way from the preceding white key's center to the following
// white key's center, matching real keyboard geometry (each black key sits
// closer to one neighbor rather than exactly centered on the previous white key).
export const BLACK_KEY_RATIO: Record<number, number> = { 1: 0.35, 3: 0.65, 6: 0.3, 8: 0.5, 10: 0.7 };
export const BLACK_KEY_WIDTH_RATIO = 0.58;
export const KEYBOARD_RANGES: Partial<Record<KeyboardType, { first: number; last: number }>> = {
  "88-key": { first: 21, last: 108 },
  "76-key": { first: 28, last: 103 }
};
export function createPianoLayout(type: KeyboardType = "88-key", first = 21, last = 108): PianoKey[] {
  const range = KEYBOARD_RANGES[type];
  if (range) { first = range.first; last = range.last; }
  const notes = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const whites = notes.filter((note) => !BLACK.has(note % 12));
  const whiteIndex = new Map<number, number>(); whites.forEach((note, i) => whiteIndex.set(note, i));
  const whiteWidth = 1 / whites.length;
  return notes.map((midiNote) => {
    const keyType = BLACK.has(midiNote % 12) ? "black" : "white";
    const normalizedWidth = keyType === "white" ? whiteWidth : whiteWidth * BLACK_KEY_WIDTH_RATIO;
    let normalizedX: number;
    if (keyType === "white") {
      normalizedX = (whiteIndex.get(midiNote) ?? 0) * whiteWidth;
    } else {
      const prevWhite = [...whites].reverse().find((note) => note < midiNote);
      const nextWhite = whites.find((note) => note > midiNote);
      const prevCenter = ((whiteIndex.get(prevWhite ?? midiNote) ?? 0) + 0.5) * whiteWidth;
      const nextCenter = ((whiteIndex.get(nextWhite ?? midiNote) ?? 0) + 0.5) * whiteWidth;
      const ratio = BLACK_KEY_RATIO[midiNote % 12] ?? 0.5;
      const centerX = prevWhite !== undefined && nextWhite !== undefined
        ? prevCenter + ratio * (nextCenter - prevCenter)
        : (prevWhite !== undefined ? prevCenter : nextCenter);
      normalizedX = centerX - normalizedWidth / 2;
    }
    const y = keyType === "white" ? 0.12 : 0;
    const h = keyType === "white" ? 0.88 : 0.58;
    const centerPoint: Point = { x: normalizedX + normalizedWidth / 2, y: y + h / 2 };
    return {
      midiNote, noteName: `${NAMES[midiNote % 12]}${Math.floor(midiNote / 12) - 1}`, keyType,
      octave: Math.floor(midiNote / 12) - 1, normalizedX, normalizedY: y,
      normalizedWidth, normalizedHeight: h, spawnPoint: { x: centerPoint.x, y: centerPoint.y },
      centerPoint, topEdge: { x: centerPoint.x, y }, bottomEdge: { x: centerPoint.x, y: y + h },
      leftEdge: { x: normalizedX, y: centerPoint.y }, rightEdge: { x: normalizedX + normalizedWidth, y: centerPoint.y }
    };
  });
}
