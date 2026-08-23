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

/**
 * Each preset is designed to produce a visually distinct look.
 * Reference images inform the character of each:
 * - stardust-stream: dense golden energy stream (original, kept)
 * - cinematic-orbit: elegant orbital motion (original, kept)
 * - smoke-ember: dark fire with embers (original, kept)
 * - golden-dust: warm golden particles (original, kept)
 * - neon-ribbon: neon colored ribbons (original, kept)
 * - vortex-fire: swirling fire vortex (original, kept)
 * - galaxy-swirl: purple galaxy spiral (original, kept)
 * - ethereal-white: soft white glow (original, kept)
 * - minimal: almost nothing (original, kept)
 * - pink-nebula: DENSE pink/magenta field like image 1
 * - sparkle-burst: bright white sparkle explosion like image 2/4
 * - firework-streaks: vertical light streaks rising like image 3
 * - purple-vortex: deep purple swirling vortex like image 5
 */
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
  },

  // ── NEW: Dramatically distinct presets ──────────────────────────────

  /**
   * Pink Nebula — Dense field of tiny pink/magenta particles
   * Creates a sea of tiny dots like image 1. Many small particles,
   * low curve, wide spread, high density at the bottom.
   */
  "pink-nebula": {
    trailMultiplier: 8.0,       // very dense trails
    smokeMultiplier: 0.6,       // warm haze
    sparkleMultiplier: 7.0,     // many sparkles everywhere
    particleScale: 0.5,         // tiny particles
    curveMultiplier: 0.4,       // gentle drift, not sharp curves
    swirl: 0.8,                 // mild swirl
    glowMultiplier: 2.5,        // warm glow halo
    smokeCoreScale: 0.8,        // wide soft smoke
    smokeVolumeScale: 1.6,      // fills the screen
    smokeResidueScale: 2.0,     // lingers long
    smokeDrag: 0.3,             // slow-moving smoke
    smokeTurbulence: 0.5,       // smooth haze
    bassSmokeMultiplier: 1.8,   // heavy bottom haze
    highSmokeMultiplier: 0.3,
    highShimmerMultiplier: 5.0  // lots of tiny sparkles
  },

  /**
   * Sparkle Burst — Bright white sparkle explosion like fireworks
   * Creates bright white bursts with lens flare halos like images 2/4.
   * Fewer but bigger particles with intense glow.
   */
  "sparkle-burst": {
    trailMultiplier: 3.0,
    smokeMultiplier: 0.15,
    sparkleMultiplier: 8.0,     // massive sparkle count on impacts
    particleScale: 1.4,         // bigger particles
    curveMultiplier: 1.0,
    swirl: 0.3,                 // particles fly outward, not swirl
    glowMultiplier: 4.5,        // huge glow halos
    smokeCoreScale: 0.3,        // minimal smoke body
    smokeVolumeScale: 0.4,
    smokeResidueScale: 0.5,
    smokeDrag: 0.5,
    smokeTurbulence: 0.4,
    bassSmokeMultiplier: 0.5,
    highSmokeMultiplier: 0.2,
    highShimmerMultiplier: 6.0  // extreme shimmer
  },

  /**
   * Firework Streaks — Vertical light streaks rising from piano
   * Creates long vertical light trails like image 3. Particles are
   * elongated, rising fast, with minimal lateral spread.
   */
  "firework-streaks": {
    trailMultiplier: 5.0,       // dense trails
    smokeMultiplier: 0.3,       // thin smoke trail
    sparkleMultiplier: 2.5,
    particleScale: 0.7,         // medium particles
    curveMultiplier: 0.2,       // almost straight up
    swirl: 0.15,                // no swirl
    glowMultiplier: 3.5,        // bright glow at impact
    smokeCoreScale: 0.4,        // thin smoke
    smokeVolumeScale: 0.5,
    smokeResidueScale: 0.6,
    smokeDrag: 0.35,            // smoke rises fast
    smokeTurbulence: 0.3,
    bassSmokeMultiplier: 0.4,
    highSmokeMultiplier: 0.3,
    highShimmerMultiplier: 3.0
  },

  /**
   * Purple Vortex — Deep purple swirling nebula like image 5
   * Creates curved purple trails with sparkle dots on top.
   * High swirl, moderate density, large glow halos.
   */
  "purple-vortex": {
    trailMultiplier: 5.5,
    smokeMultiplier: 1.2,       // thick atmospheric smoke
    sparkleMultiplier: 4.0,
    particleScale: 0.85,
    curveMultiplier: 3.0,       // very curved paths
    swirl: 5.0,                 // extreme swirl for vortex effect
    glowMultiplier: 2.8,        // large purple glow halos
    smokeCoreScale: 1.2,        // thick smoke cores
    smokeVolumeScale: 1.5,      // fills atmosphere
    smokeResidueScale: 1.8,     // lingers
    smokeDrag: 0.45,            // slow smoke
    smokeTurbulence: 2.5,       // turbulent smoke for vortex feel
    bassSmokeMultiplier: 1.6,
    highSmokeMultiplier: 0.4,
    highShimmerMultiplier: 3.5
  },

  // ── NEW PRESETS ──────────────────────────────────────────────────────

  /**
   * Ice Crystal — Cold blue/white particles with sharp edges
   */
  "ice-crystal": {
    trailMultiplier: 2.5,
    smokeMultiplier: 0.8,
    sparkleMultiplier: 3.0,
    particleScale: 0.7,
    curveMultiplier: 0.8,
    swirl: 0.4,
    glowMultiplier: 2.0,
    smokeCoreScale: 0.6,
    smokeVolumeScale: 0.9,
    smokeResidueScale: 1.2,
    smokeDrag: 0.7,
    smokeTurbulence: 0.6,
    bassSmokeMultiplier: 0.9,
    highSmokeMultiplier: 1.2,
    highShimmerMultiplier: 2.5
  },

  /**
   * Fire Dance — Warm orange/red with lots of movement
   */
  "fire-dance": {
    trailMultiplier: 4.0,
    smokeMultiplier: 1.5,
    sparkleMultiplier: 3.5,
    particleScale: 1.1,
    curveMultiplier: 2.0,
    swirl: 3.0,
    glowMultiplier: 2.5,
    smokeCoreScale: 0.9,
    smokeVolumeScale: 1.2,
    smokeResidueScale: 1.4,
    smokeDrag: 0.5,
    smokeTurbulence: 2.0,
    bassSmokeMultiplier: 1.5,
    highSmokeMultiplier: 0.6,
    highShimmerMultiplier: 2.0
  },

  /**
   * Dreamy Pastel — Soft pastel colors with slow movement
   */
  "dreamy-pastel": {
    trailMultiplier: 1.8,
    smokeMultiplier: 2.0,
    sparkleMultiplier: 1.5,
    particleScale: 0.6,
    curveMultiplier: 1.5,
    swirl: 1.0,
    glowMultiplier: 1.8,
    smokeCoreScale: 1.2,
    smokeVolumeScale: 1.8,
    smokeResidueScale: 2.0,
    smokeDrag: 0.9,
    smokeTurbulence: 0.8,
    bassSmokeMultiplier: 1.3,
    highSmokeMultiplier: 0.8,
    highShimmerMultiplier: 1.2
  }
};

export function getFxPresetTuning(preset: VisualFxPreset): FxPresetTuning {
  return PRESET_TUNING[preset] ?? PRESET_TUNING["cinematic-orbit"];
}
