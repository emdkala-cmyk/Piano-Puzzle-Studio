import type { AnimationClockState } from "./models";
type Listener = (timeMs: number, state: AnimationClockState) => void;
export class AnimationClock {
  private timeMs = 0; private state: AnimationClockState = "stopped"; private last = 0; private raf = 0; private listeners = new Set<Listener>(); private speed = 1; private total = 0;
  constructor(totalDurationMs = 0) { this.total = totalDurationMs; }
  setTotalDuration(ms: number) { this.total = Math.max(0, ms); }
  get currentTimeMs() { return this.timeMs; } get clockState() { return this.state; }
  setSpeed(speed: number) { this.speed = Math.max(0.1, speed); }
  subscribe(listener: Listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private emit() { for (const listener of this.listeners) listener(this.timeMs, this.state); }
  play() { if (this.state === "playing") return; this.state = "playing"; this.last = performance.now(); const tick = (now: number) => { if (this.state !== "playing") return; this.timeMs += (now - this.last) * this.speed; this.last = now; if (this.timeMs >= this.total && this.total > 0) { this.timeMs = this.total; this.state = "completed"; } this.emit(); if (this.state === "playing") this.raf = requestAnimationFrame(tick); }; this.raf = requestAnimationFrame(tick); this.emit(); }
  pause() { if (this.state === "playing") { this.state = "paused"; cancelAnimationFrame(this.raf); this.emit(); } }
  stop() { cancelAnimationFrame(this.raf); this.timeMs = 0; this.state = "stopped"; this.emit(); }
  reset() { this.stop(); }
  seek(ms: number) { this.timeMs = Math.max(0, Math.min(this.total, ms)); this.state = this.timeMs >= this.total && this.total > 0 ? "completed" : "paused"; this.emit(); }
  dispose() { cancelAnimationFrame(this.raf); this.listeners.clear(); }
}
