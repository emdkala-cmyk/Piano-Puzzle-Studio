import type { EasingName } from "./models";
export function ease(t: number, name: EasingName): number {
  const x = Math.max(0, Math.min(1, t));
  if (name === "linear") return x;
  if (name === "easeIn") return x * x;
  if (name === "easeOut") return 1 - (1 - x) * (1 - x);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}
