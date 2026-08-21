import type { VisualFxPalette } from "./fx-types";

function rgb(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}

function mix(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

export function colorForPitch(palette: VisualFxPalette, midiNote: number): number {
  if (palette === "gold") return 0xffc45c;
  if (palette === "neon") return midiNote >= 72 ? 0xff72e8 : midiNote < 48 ? 0x54dfff : 0x7dffb2;
  if (palette === "pitch-gradient") {
    const t = Math.max(0, Math.min(1, (midiNote - 21) / 87));
    if (t < 0.5) return rgb(mix(47, 64, t * 2), mix(65, 220, t * 2), mix(170, 192, t * 2));
    return rgb(mix(64, 255, (t - 0.5) * 2), mix(220, 205, (t - 0.5) * 2), mix(192, 115, (t - 0.5) * 2));
  }
  return midiNote < 48 ? 0x65b9d8 : midiNote >= 84 ? 0xffdb8a : 0x86d8ff;
}
