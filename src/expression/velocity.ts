import type { VelocityExpressionSettings } from "./models";

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export interface VelocityDerived {
  energy: number;
  travelDurationDeltaMs: number;
  scaleStart: number;
  scalePeak: number;
  opacityStart: number;
  opacityPeak: number;
  rotationEnd: number;
}

export function computeVelocityDerived(normalizedVelocity: number, settings: VelocityExpressionSettings): VelocityDerived {
  const velocity = clamp01(normalizedVelocity);
  const influenced = velocity * settings.influence;
  return {
    energy: velocity,
    travelDurationDeltaMs: -influenced * settings.travelInfluenceMs,
    scaleStart: 1,
    scalePeak: 1 + influenced * settings.scaleInfluence,
    opacityStart: clamp01(1 - (1 - velocity) * settings.opacityInfluence),
    opacityPeak: 1,
    rotationEnd: influenced * settings.rotationInfluence
  };
}
