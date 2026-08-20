import type { KeyboardType, PianoKey, Point } from "./models";

const NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const BLACK = new Set([1, 3, 6, 8, 10]);
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
    const whiteBefore = notes.slice(0, notes.indexOf(midiNote) + 1).filter((note) => !BLACK.has(note % 12)).length;
    const normalizedWidth = keyType === "white" ? whiteWidth : whiteWidth * 0.58;
    const normalizedX = keyType === "white" ? (whiteIndex.get(midiNote) ?? 0) * whiteWidth : (whiteBefore - 1) * whiteWidth - normalizedWidth / 2;
    const y = keyType === "white" ? 0.12 : 0;
    const h = keyType === "white" ? 0.88 : 0.58;
    const centerPoint: Point = { x: normalizedX + normalizedWidth / 2, y: y + h / 2 };
    return {
      midiNote, noteName: `${NAMES[midiNote % 12]}${Math.floor(midiNote / 12) - 1}`, keyType,
      octave: Math.floor(midiNote / 12) - 1, normalizedX, normalizedY: y,
      normalizedWidth, normalizedHeight: h, spawnPoint: { x: centerPoint.x, y: 0 },
      centerPoint, topEdge: { x: centerPoint.x, y }, bottomEdge: { x: centerPoint.x, y: y + h },
      leftEdge: { x: normalizedX, y: centerPoint.y }, rightEdge: { x: normalizedX + normalizedWidth, y: centerPoint.y }
    };
  });
}
