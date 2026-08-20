import type { AnimationSource, AnimationTimeline, PieceAnimationFrame } from "./models";
import { buildAnimationTimeline } from "./timeline";
import { evaluateAnimation } from "./piece-animation";
export class AnimationEngine {
  timeline: AnimationTimeline = { animations: [], totalDurationMs: 0 };
  rebuild(source: AnimationSource) { this.timeline = buildAnimationTimeline(source); return this.timeline; }
  evaluate(timeMs: number): PieceAnimationFrame[] { return this.timeline.animations.map((animation) => evaluateAnimation(animation, timeMs)); }
}
