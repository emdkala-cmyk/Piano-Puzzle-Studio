import type { AnimationTimeline, PieceAnimationFrame } from "./models";
export interface AnimationStoreState { timeline: AnimationTimeline; frames: PieceAnimationFrame[]; currentTimeMs: number }
export function createAnimationStore(): AnimationStoreState { return { timeline: { animations: [], totalDurationMs: 0 }, frames: [], currentTimeMs: 0 }; }
