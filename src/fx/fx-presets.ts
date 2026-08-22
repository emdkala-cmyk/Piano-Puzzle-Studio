import type { VisualFxPreset } from "./fx-types";

export interface FxPresetTuning {
  trailMultiplier: number;
  smokeMultiplier: number;
  sparkleMultiplier: number;
  particleScale: number;
  curveMultiplier: number;
  swirl: number;
  glowMultiplier: number;
  smokeCoreScale: number;
  smokeVolumeScale: number;
  smokeResidueScale: number;
  smokeDrag: number;
  smokeTurbulence: number;
  bassSmokeMultiplier: number;
  highSmokeMultiplier: number;
  highShimmerMultiplier: number;
}

const PRESET_TUNING: Record<VisualFxPreset, FxPresetTuning> = {
  "stardust-stream": {
    trailMultiplier: 6.5,
    smokeMultiplier: 0.2,
    sparkleMultiplier: 5.5,
    particleScale: 1.1,
    curveMultiplier: 2.4,
    swirl: 4.0,
    glowMultiplier: 3.2,
    smokeCoreScale: 0.48,
    smokeVolumeScale: 0.72,
    smokeResidueScale: 0.95,
    smokeDrag: 0.68,
    smokeTurbulence: 0.8,
    bassSmokeMultiplier: 1.25,
    highSmokeMultiplier: 0.35,
    highShimmerMultiplier: 4.0
  },
  "cinematic-orbit": {
    trailMultiplier: 1.35,
    smokeMultiplier: 1.42,
    sparkleMultiplier: 1.05,
    particleScale: 1.15,
    curveMultiplier: 1.15,
    swirl: 0.9,
    glowMultiplier: 1.2,
    smokeCoreScale: 0.92,
    smokeVolumeScale: 1.24,
    smokeResidueScale: 1.52,
    smokeDrag: 0.88,
    smokeTurbulence: 1.1,
    bassSmokeMultiplier: 1.28,
    highSmokeMultiplier: 0.76,
    highShimmerMultiplier: 0.82
  },
  "smoke-ember": {
    trailMultiplier: 0.9,
    smokeMultiplier: 2.05,
    sparkleMultiplier: 0.68,
    particleScale: 1.2,
    curveMultiplier: 0.8,
    swirl: 0.55,
    glowMultiplier: 1,
    smokeCoreScale: 1,
    smokeVolumeScale: 1.34,
    smokeResidueScale: 1.62,
    smokeDrag: 1.05,
    smokeTurbulence: 0.9,
    bassSmokeMultiplier: 1.38,
    highSmokeMultiplier: 0.68,
    highShimmerMultiplier: 0.68
  },
  "golden-dust": {
    trailMultiplier: 1.65,
    smokeMultiplier: 0.45,
    sparkleMultiplier: 1.65,
    particleScale: 0.9,
    curveMultiplier: 1.3,
    swirl: 1.2,
    glowMultiplier: 1.35,
    smokeCoreScale: 0.68,
    smokeVolumeScale: 0.94,
    smokeResidueScale: 1.22,
    smokeDrag: 0.82,
    smokeTurbulence: 1.25,
    bassSmokeMultiplier: 1.05,
    highSmokeMultiplier: 0.58,
    highShimmerMultiplier: 1.2
  },
  "neon-ribbon": {
    trailMultiplier: 2,
    smokeMultiplier: 0.3,
    sparkleMultiplier: 1.35,
    particleScale: 0.78,
    curveMultiplier: 1.65,
    swirl: 1.55,
    glowMultiplier: 1.45,
    smokeCoreScale: 0.56,
    smokeVolumeScale: 0.78,
    smokeResidueScale: 1.04,
    smokeDrag: 0.62,
    smokeTurbulence: 1.55,
    bassSmokeMultiplier: 0.72,
    highSmokeMultiplier: 0.44,
    highShimmerMultiplier: 1.45
  },
  "vortex-fire": {
    trailMultiplier: 6.0,
    smokeMultiplier: 1.0,
    sparkleMultiplier: 5.8,
    particleScale: 1.05,
    curveMultiplier: 2.6,
    swirl: 4.2,
    glowMultiplier: 2.8,
    smokeCoreScale: 0.6,
    smokeVolumeScale: 0.85,
    smokeResidueScale: 1.1,
    smokeDrag: 0.65,
    smokeTurbulence: 2.2,
    bassSmokeMultiplier: 1.4,
    highSmokeMultiplier: 0.6,
    highShimmerMultiplier: 2.2
  },
  "galaxy-swirl": {
    trailMultiplier: 3.8,
    smokeMultiplier: 0.5,
    sparkleMultiplier: 3.5,
    particleScale: 0.75,
    curveMultiplier: 2.2,
    swirl: 4.2,
    glowMultiplier: 1.7,
    smokeCoreScale: 0.5,
    smokeVolumeScale: 0.75,
    smokeResidueScale: 1.0,
    smokeDrag: 0.55,
    smokeTurbulence: 2.8,
    bassSmokeMultiplier: 1.2,
    highSmokeMultiplier: 0.5,
    highShimmerMultiplier: 2.5
  },
  "ethereal-white": {
    trailMultiplier: 3.2,
    smokeMultiplier: 1.8,
    sparkleMultiplier: 2.8,
    particleScale: 0.95,
    curveMultiplier: 1.4,
    swirl: 1.8,
    glowMultiplier: 2.0,
    smokeCoreScale: 1.1,
    smokeVolumeScale: 1.4,
    smokeResidueScale: 1.7,
    smokeDrag: 0.75,
    smokeTurbulence: 1.6,
    bassSmokeMultiplier: 1.5,
    highSmokeMultiplier: 0.8,
    highShimmerMultiplier: 1.8
  },
  minimal: {
    trailMultiplier: 0.65,
    smokeMultiplier: 0,
    sparkleMultiplier: 0.65,
    particleScale: 0.8,
    curveMultiplier: 0.35,
    swirl: 0.2,
    glowMultiplier: 0.75,
    smokeCoreScale: 0.7,
    smokeVolumeScale: 0.86,
    smokeResidueScale: 1.1,
    smokeDrag: 1.15,
    smokeTurbulence: 0.45,
    bassSmokeMultiplier: 0.8,
    highSmokeMultiplier: 0.5,
    highShimmerMultiplier: 0.5
  }
};

export function getFxPresetTuning(preset: VisualFxPreset): FxPresetTuning {
  return PRESET_TUNING[preset] ?? PRESET_TUNING["cinematic-orbit"];
}
