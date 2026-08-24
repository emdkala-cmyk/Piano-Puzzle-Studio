import { SeededRandom, hashSeed } from "../fx/seeded-random";

const TAU = Math.PI * 2;

export type MotionPathKind =
  | "curved"
  | "orbital"
  | "spiral"
  | "helical"
  | "wave"
  | "turbulent"
  | "composite";

export const MOTION_PATH_KINDS: readonly MotionPathKind[] = [
  "curved", "orbital", "spiral", "helical", "wave", "turbulent", "composite"
];

/** A point that the sampler is allowed to write into. Owned by the caller. */
export interface MutablePoint { x: number; y: number }

/**
 * Fully pre-computed, immutable path description.
 * Every value is a plain number so that sampling allocates nothing.
 */
export interface MotionPathParams {
  kind: MotionPathKind;
  originX: number; originY: number;
  controlX: number; controlY: number;
  targetX: number; targetY: number;
  orbitRadius: number;
  orbitTurns: number;
  orbitPhase: number;
  orbitEccentricity: number;
  waveAmplitude: number;
  waveFrequency: number;
  wavePhase: number;
  turbulenceAmplitude: number;
  turbulenceFreqA: number;
  turbulencePhaseA: number;
  turbulenceFreqB: number;
  turbulencePhaseB: number;
  /** Overshoot distance in px, applied along the tangent near arrival. */
  overshoot: number;
  /** Fraction of the path (0..0.5) over which overshoot + settling happens. */
  overshootWindow: number;
  settleFrequency: number;
  settleDamping: number;
  /** Reserved for Phase 3 roll/spin. Not consumed yet. */
  spinTurns: number;
  seed: number;
}

export interface MotionPathShaping {
  kind: MotionPathKind | "auto";
  /** 0..1 multipliers coming from the preset / timing settings. */
  curvature: number;
  orbitStrength: number;
  spiralStrength: number;
  waveStrength: number;
  turbulence: number;
  overshootPx: number;
}

export const DEFAULT_MOTION_PATH_SHAPING: MotionPathShaping = {
  kind: "auto",
  curvature: 0.6,
  orbitStrength: 0.45,
  spiralStrength: 0.55,
  waveStrength: 0.4,
  turbulence: 0.25,
  overshootPx: 14
};

const AUTO_KIND_TABLE: readonly MotionPathKind[] = [
  "curved", "spiral", "orbital", "wave", "helical", "composite", "curved", "turbulent"
];

/**
 * Pick a path kind from the seed when the preset says "auto".
 * Bass notes get wide, heavy shapes; highs get tight, flicky ones.
 */
function resolveKind(
  shaping: MotionPathShaping,
  rng: SeededRandom,
  midiNote: number
): MotionPathKind {
  if (shaping.kind !== "auto") return shaping.kind;
  const biased = midiNote < 48
    ? ["curved", "orbital", "wave", "composite"] as const
    : midiNote > 84
      ? ["spiral", "helical", "turbulent", "composite"] as const
      : AUTO_KIND_TABLE;
  return rng.pick(biased as readonly MotionPathKind[]);
}

/**
 * Build the path once, at timeline-build time. Never call this per frame.
 *
 * `origin` MUST be the projected piano-key point of the note; `target` MUST be
 * the piece's own `targetPosition`. Neither is randomized here — only the shape
 * of the curve between them is.
 */
export function createMotionPathParams(
  originX: number,
  originY: number,
  targetX: number,
  targetY: number,
  shaping: MotionPathShaping,
  seedParts: readonly (string | number)[],
  midiNote: number
): MotionPathParams {
  const seed = hashSeed(...seedParts);
  const rng = new SeededRandom(seed);
  const kind = resolveKind(shaping, rng, midiNote);

  const dx = targetX - originX;
  const dy = targetY - originY;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = -dy / dist;
  const ny = dx / dist;

  // Bézier spine: side and bend magnitude are seeded, so replays match.
  const side = rng.nextFloat() > 0.5 ? 1 : -1;
  const bend = dist * 0.32 * clamp01(shaping.curvature) * side * rng.range(0.6, 1.4);
  const midX = (originX + targetX) * 0.5;
  const midY = (originY + targetY) * 0.5;

  const scaleRef = Math.min(dist, 900);

  return {
    kind,
    originX, originY,
    controlX: midX + nx * bend,
    controlY: midY + ny * bend,
    targetX, targetY,
    orbitRadius: scaleRef * 0.16 * clamp01(
      kind === "spiral" || kind === "helical" ? shaping.spiralStrength : shaping.orbitStrength
    ) * rng.range(0.7, 1.35),
    orbitTurns: rng.range(0.75, 2.4),
    orbitPhase: rng.range(0, TAU),
    orbitEccentricity: rng.range(0.35, 0.85),
    waveAmplitude: scaleRef * 0.075 * clamp01(shaping.waveStrength) * rng.range(0.6, 1.5),
    waveFrequency: rng.range(1.4, 3.6),
    wavePhase: rng.range(0, TAU),
    turbulenceAmplitude: scaleRef * 0.055 * clamp01(shaping.turbulence) * rng.range(0.5, 1.5),
    turbulenceFreqA: rng.range(2.2, 4.4),
    turbulencePhaseA: rng.range(0, TAU),
    turbulenceFreqB: rng.range(5.1, 9.3),
    turbulencePhaseB: rng.range(0, TAU),
    overshoot: Math.max(0, shaping.overshootPx) * rng.range(0.55, 1.25),
    overshootWindow: rng.range(0.12, 0.24),
    settleFrequency: rng.range(1.1, 2.1),
    settleDamping: rng.range(2.6, 4.8),
    spinTurns: rng.signed(0.22),
    seed
  };
}

/** Identity path used to pre-fill pooled frames. */
export function createIdentityMotionPath(): MotionPathParams {
  return {
    kind: "curved",
    originX: 0, originY: 0, controlX: 0, controlY: 0, targetX: 0, targetY: 0,
    orbitRadius: 0, orbitTurns: 0, orbitPhase: 0, orbitEccentricity: 0,
    waveAmplitude: 0, waveFrequency: 0, wavePhase: 0,
    turbulenceAmplitude: 0, turbulenceFreqA: 0, turbulencePhaseA: 0,
    turbulenceFreqB: 0, turbulencePhaseB: 0,
    overshoot: 0, overshootWindow: 0.2, settleFrequency: 0, settleDamping: 1,
    spinTurns: 0, seed: 0
  };
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : Number.isFinite(value) ? value : 0;
}

/**
 * Evaluate the path at eased progress `t` and write the result into `out`.
 *
 * ZERO ALLOCATION: only local numbers are used. Safe to call in the update loop.
 * Guarantees `t <= 0 -> origin` and `t >= 1 -> target` exactly, so lock-in is
 * never disturbed by the decorative layers.
 */
export function samplePathInto(p: MotionPathParams, tRaw: number, out: MutablePoint): void {
  const t = tRaw <= 0 ? 0 : tRaw >= 1 ? 1 : tRaw;
  if (t <= 0) { out.x = p.originX; out.y = p.originY; return; }
  if (t >= 1) { out.x = p.targetX; out.y = p.targetY; return; }

  const ct = 1 - t;

  // --- Bézier spine -------------------------------------------------------
  let x = ct * ct * p.originX + 2 * ct * t * p.controlX + t * t * p.targetX;
  let y = ct * ct * p.originY + 2 * ct * t * p.controlY + t * t * p.targetY;

  // --- analytic tangent / normal -----------------------------------------
  let tx = 2 * ct * (p.controlX - p.originX) + 2 * t * (p.targetX - p.controlX);
  let ty = 2 * ct * (p.controlY - p.originY) + 2 * t * (p.targetY - p.controlY);
  const tlen = Math.sqrt(tx * tx + ty * ty) || 1;
  tx /= tlen;
  ty /= tlen;
  const nx = -ty;
  const ny = tx;

  // Envelope is 0 at both ends: decoration can never move the endpoints.
  const env = Math.sin(Math.PI * t);
  const shrink = 1 - t;
  const ramp = t < 0.12 ? t / 0.12 : 1;

  let offN = 0;
  let offT = 0;
  const kind = p.kind;

  if (kind === "wave" || kind === "composite") {
    const w = p.waveAmplitude * env *
      Math.sin(TAU * p.waveFrequency * t + p.wavePhase);
    offN += kind === "composite" ? w * 0.45 : w;
  }

  if (kind === "orbital" || kind === "composite") {
    const a = TAU * p.orbitTurns * t + p.orbitPhase;
    const r = p.orbitRadius * env * (kind === "composite" ? 0.5 : 1);
    offN += r * Math.sin(a);
    offT += r * Math.cos(a) * p.orbitEccentricity;
  }

  if (kind === "spiral" || kind === "helical" || kind === "composite") {
    const a = TAU * p.orbitTurns * t + p.orbitPhase;
    const r = p.orbitRadius * ramp * shrink * (kind === "composite" ? 0.6 : 1);
    offN += r * Math.sin(a);
    offT += r * Math.cos(a) * p.orbitEccentricity;
  }

  if (kind === "helical") {
    // secondary, faster, tighter loop layered on the spiral
    const a2 = TAU * p.orbitTurns * 2.7 * t + p.orbitPhase * 1.7;
    const r2 = p.orbitRadius * 0.28 * ramp * shrink;
    offN += r2 * Math.sin(a2);
    offT += r2 * Math.cos(a2) * 0.6;
    offN += p.waveAmplitude * 0.5 * env *
      Math.sin(TAU * p.waveFrequency * t + p.wavePhase);
  }

  if (kind === "turbulent" || kind === "composite") {
    const amp = p.turbulenceAmplitude * env * (kind === "composite" ? 0.35 : 1);
    const a = Math.sin(TAU * p.turbulenceFreqA * t + p.turbulencePhaseA);
    const b = Math.sin(TAU * p.turbulenceFreqB * t + p.turbulencePhaseB);
    offN += amp * (a * 0.62 + b * 0.38);
    offT += amp * 0.5 * Math.cos(TAU * p.turbulenceFreqB * t + p.turbulencePhaseB * 1.3);
  }

  x += nx * offN + tx * offT;
  y += ny * offN + ty * offT;

  // --- overshoot + damped settling, along the tangent --------------------
  if (p.overshoot > 0) {
    const gate = 1 - p.overshootWindow;
    if (t > gate) {
      const u = (t - gate) / p.overshootWindow;      // 0..1
      const damp = Math.exp(-p.settleDamping * u) * (1 - u); // -> 0 at u=1
      const s = p.overshoot * damp * Math.sin(TAU * p.settleFrequency * u);
      x += tx * s;
      y += ty * s;
    }
  }

  out.x = x;
  out.y = y;
}
