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
    if (t < 0.3) return rgb(mix(180, 255, t / 0.3), mix(40, 120, t / 0.3), mix(30, 20, t / 0.3));
    if (t < 0.6) return rgb(mix(255, 255, (t - 0.3) / 0.3), mix(120, 200, (t - 0.3) / 0.3), mix(20, 80, (t - 0.3) / 0.3));
    return rgb(mix(255, 200, (t - 0.6) / 0.4), mix(200, 160, (t - 0.6) / 0.4), mix(80, 255, (t - 0.6) / 0.4));
  }
  return midiNote < 48 ? 0xff6633 : midiNote >= 84 ? 0xffaa44 : 0xff8822;
}
