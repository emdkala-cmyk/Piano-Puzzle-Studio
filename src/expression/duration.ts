import type { DurationExpressionSettings } from "./models";

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

const REFERENCE_LONG_DURATION_MS = 2000;

export interface DurationDerived {
  normalizedDuration: number;
  arrivalHoldMs: number;
  scaleEnd: number;
  opacityEnd: number;
}

export function computeDurationDerived(effectiveDurationMs: number, settings: DurationExpressionSettings): DurationDerived {
  const normalizedDuration = clamp01(effectiveDurationMs / REFERENCE_LONG_DURATION_MS);
  const influenced = normalizedDuration * settings.influence;
  const arrivalHoldMs = settings.minArrivalHoldMs + influenced * (settings.maxArrivalHoldMs - settings.minArrivalHoldMs);
  return {
    normalizedDuration,
    arrivalHoldMs: Math.max(settings.minArrivalHoldMs, Math.min(settings.maxArrivalHoldMs, arrivalHoldMs)),
    scaleEnd: 1 + influenced * 0.08,
    opacityEnd: 1
  };
}
