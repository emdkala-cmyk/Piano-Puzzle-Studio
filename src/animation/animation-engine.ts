import type { AnimationSource, AnimationTimeline, OverlapMode, PieceAnimationFrame } from "./models";
import { buildAnimationTimeline } from "./timeline";
import { evaluateAnimation } from "./piece-animation";

export class AnimationEngine {
  timeline: AnimationTimeline = { animations: [], totalDurationMs: 0 };
  private overlapMode: OverlapMode = "allow-overlap";
  private energyByAssignmentId: Map<string, number> = new Map();

  rebuild(source: AnimationSource) {
    this.timeline = buildAnimationTimeline(source);
    this.overlapMode = source.timing.overlapMode;
    this.energyByAssignmentId = new Map();
    if (source.expression) {
      for (const [assignmentId, expression] of source.expression.noteExpressions) this.energyByAssignmentId.set(assignmentId, expression.energy);
    }
    return this.timeline;
  }

  evaluate(timeMs: number): PieceAnimationFrame[] {
    const frames = this.timeline.animations.map((animation) => evaluateAnimation(animation, timeMs));
    return this.overlapMode === "allow-overlap" ? this.resolveOverlaps(frames) : frames;
  }

  private resolveOverlaps(frames: PieceAnimationFrame[]): PieceAnimationFrame[] {
    const winnerByPiece = new Map<string, PieceAnimationFrame>();
    for (const frame of frames) {
      const current = winnerByPiece.get(frame.pieceId);
      if (!current || this.compareFrames(frame, current) > 0) winnerByPiece.set(frame.pieceId, frame);
    }
    return frames.filter((frame) => winnerByPiece.get(frame.pieceId) === frame);
  }

  private compareFrames(a: PieceAnimationFrame, b: PieceAnimationFrame): number {
    if (a.progress !== b.progress) return a.progress - b.progress;
    const energyA = this.energyByAssignmentId.get(a.assignmentId) ?? 0;
    const energyB = this.energyByAssignmentId.get(b.assignmentId) ?? 0;
    if (energyA !== energyB) return energyA - energyB;
    if (a.startTimeMs !== b.startTimeMs) return a.startTimeMs - b.startTimeMs;
    return a.assignmentId > b.assignmentId ? 1 : a.assignmentId < b.assignmentId ? -1 : 0;
  }
}
