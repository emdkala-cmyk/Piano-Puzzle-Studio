import type { AnimationSource, AnimationTimeline, OverlapMode, PieceAnimationFrame } from "./models";
import { buildAnimationTimeline } from "./timeline";
import { writeAnimationFrame, evaluateAnimation } from "./piece-animation";
import { PieceFramePool } from "./frame-pool";

export class AnimationEngine {
  timeline: AnimationTimeline = {
    animations: [], totalDurationMs: 0, revealOrderReassigned: 0, skippedWithoutKey: 0
  };
  private overlapMode: OverlapMode = "allow-overlap";
  private energyByAssignmentId: Map<string, number> = new Map();

  private readonly pool = new PieceFramePool();
  private readonly output: PieceAnimationFrame[] = [];
  private readonly winnerByPiece = new Map<string, PieceAnimationFrame>();

  rebuild(source: AnimationSource) {
    this.timeline = buildAnimationTimeline(source);
    this.overlapMode = source.timing.overlapMode;
    this.energyByAssignmentId = new Map();
    if (source.expression) {
      for (const [assignmentId, expression] of source.expression.noteExpressions) {
        this.energyByAssignmentId.set(assignmentId, expression.energy);
      }
    }
    this.pool.ensure(this.timeline.animations.length);
    return this.timeline;
  }

  /**
   * Allocation-free evaluation. THIS is what the render loop should call.
   *
   * The returned array and its frames are reused on the next call. Read them
   * within the same tick; do not retain references.
   */
  evaluateInto(timeMs: number): readonly PieceAnimationFrame[] {
    const animations = this.timeline.animations;
    this.pool.ensure(animations.length);

    for (let i = 0; i < animations.length; i += 1) {
      writeAnimationFrame(animations[i], timeMs, this.pool.at(i));
    }

    this.output.length = 0; // keeps capacity, drops nothing to the GC

    if (this.overlapMode !== "allow-overlap") {
      for (let i = 0; i < animations.length; i += 1) this.output.push(this.pool.at(i));
      return this.output;
    }

    this.winnerByPiece.clear();
    for (let i = 0; i < animations.length; i += 1) {
      const frame = this.pool.at(i);
      const current = this.winnerByPiece.get(frame.pieceId);
      if (!current || this.compareFrames(frame, current) > 0) {
        this.winnerByPiece.set(frame.pieceId, frame);
      }
    }
    for (let i = 0; i < animations.length; i += 1) {
      const frame = this.pool.at(i);
      if (this.winnerByPiece.get(frame.pieceId) === frame) this.output.push(frame);
    }
    return this.output;
  }

  /** @deprecated Allocates a frame per animation per call. Use `evaluateInto`. */
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
