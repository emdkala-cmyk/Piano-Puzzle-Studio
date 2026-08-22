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
  if (palette === "fire") {
    const t = (midiNote - 36) / 88;
    return rgb(mix(255, 200, t), mix(40 + t * 80, 20, t), mix(0, 0, t));
  }
  if (palette === "ice") {
    const t = (midiNote - 36) / 88;
    return rgb(mix(100, 200, t), mix(180, 220, t), mix(255, 255, t));
  }
  if (palette === "rainbow") {
    const hue = ((midiNote - 21) / 87) * 360;
    return hslToRgb(hue, 0.85, 0.55);
  }
  if (palette === "custom") return 0xff6600; // placeholder, overridden by engine
  if (palette === "pitch-gradient") {
    const t = Math.max(0, Math.min(1, (midiNote - 21) / 87));
    if (t < 0.3) return rgb(mix(180, 255, t / 0.3), mix(40, 120, t / 0.3), mix(30, 20, t / 0.3));
    if (t < 0.6) return rgb(mix(255, 255, (t - 0.3) / 0.3), mix(120, 200, (t - 0.3) / 0.3), mix(20, 80, (t - 0.3) / 0.3));
    return rgb(mix(255, 200, (t - 0.6) / 0.4), mix(200, 160, (t - 0.6) / 0.4), mix(80, 255, (t - 0.6) / 0.4));
  }
  return midiNote < 48 ? 0xff6633 : midiNote >= 84 ? 0xffaa44 : 0xff8822;
}

function hslToRgb(h: number, s: number, l: number): number {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return rgb(Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255));
}
