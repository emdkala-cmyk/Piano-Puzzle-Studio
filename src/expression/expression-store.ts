import type { ExpressionSettings } from "./models";

export const DEFAULT_EXPRESSION_SETTINGS: ExpressionSettings = {
  enabled: true,
  debugVisible: false,
  velocity: { influence: 0.6, travelInfluenceMs: 150, scaleInfluence: 0.35, opacityInfluence: 0.25, rotationInfluence: 8 },
  duration: { influence: 0.5, minArrivalHoldMs: 80, maxArrivalHoldMs: 900 },
  sustain: { enabled: true, ccThreshold: 0.5, holdMultiplier: 1.8, opacityMultiplier: 1.15, energyDecayMultiplier: 0.85 },
  chord: { enabled: true, spreadMs: 60, emphasisInfluence: 0.3 }
};

export function normalizeExpressionSettings(value?: Partial<ExpressionSettings>): ExpressionSettings {
  return {
    ...DEFAULT_EXPRESSION_SETTINGS,
    ...value,
    velocity: { ...DEFAULT_EXPRESSION_SETTINGS.velocity, ...value?.velocity },
    duration: { ...DEFAULT_EXPRESSION_SETTINGS.duration, ...value?.duration },
    sustain: { ...DEFAULT_EXPRESSION_SETTINGS.sustain, ...value?.sustain },
    chord: { ...DEFAULT_EXPRESSION_SETTINGS.chord, ...value?.chord }
  };
}
