export class PianoSynth {
  private ctx: AudioContext | undefined;
  private master: GainNode | undefined;

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.3;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  resume() {
    this.ensureContext();
    void this.ctx?.resume();
  }

  noteOn(midiNote: number, velocity: number, durationMs: number) {
    const ctx = this.ensureContext();
    const master = this.master;
    if (!master) return;
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    const now = ctx.currentTime;
    const v = Math.max(0.05, Math.min(1, velocity));
    const peak = v * 0.45;
    const sustainLevel = Math.max(0.0004, peak * 0.25);
    const sustainMs = Math.min(1200, Math.max(180, durationMs));
    const releaseStart = now + sustainMs / 1000;
    const releaseEnd = releaseStart + 0.5;

    const envelope = ctx.createGain();
    envelope.connect(master);
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(peak, now + 0.006);
    envelope.gain.exponentialRampToValueAtTime(sustainLevel, now + 0.35);
    envelope.gain.setValueAtTime(sustainLevel, releaseStart);
    envelope.gain.exponentialRampToValueAtTime(0.0001, releaseEnd);

    const partials: Array<[number, number]> = [[1, 1], [2, 0.25], [3, 0.12], [4, 0.06]];
    for (const [multiple, level] of partials) {
      const oscillator = ctx.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = freq * multiple;
      const partialGain = ctx.createGain();
      partialGain.gain.value = level;
      oscillator.connect(partialGain).connect(envelope);
      oscillator.start(now);
      oscillator.stop(releaseEnd + 0.05);
    }
  }

  stopAll() {
    if (!this.ctx || !this.master) return;
    this.master.disconnect();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.3;
    this.master.connect(this.ctx.destination);
  }
}
