/**
 * Live MIDI Recording via Web MIDI API.
 *
 * Records note-on/note-off events from a MIDI controller,
 * then exports as a Standard MIDI File (.mid) that can be
 * imported into the puzzle animation pipeline.
 */

export interface RecordedMidiNote {
  note: number;       // MIDI note number (0–127)
  velocity: number;   // 0–127
  timestamp: number;  // ms since recording start
  duration: number;   // ms (filled when note-off received)
  channel: number;    // MIDI channel (0–15)
}

export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  startTime: number;
  notes: RecordedMidiNote[];
  durationMs: number;
}

type RecordingCallback = (state: RecordingState) => void;

export class MidiRecorder {
  private midiAccess: MIDIAccess | null = null;
  private inputPort: MIDIInput | null = null;
  private state: RecordingState = {
    isRecording: false,
    isPaused: false,
    startTime: 0,
    notes: [],
    durationMs: 0,
  };
  private pendingNotes = new Map<number, { velocity: number; timestamp: number; channel: number }>();
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private onChange: RecordingCallback | null = null;
  private _isSupported = false;

  get isSupported(): boolean {
    return this._isSupported;
  }

  get currentState(): Readonly<RecordingState> {
    return this.state;
  }

  set onChangeCallback(cb: RecordingCallback | null) {
    this.onChange = cb;
  }

  /**
   * Initialize Web MIDI and list available inputs.
   */
  async init(): Promise<{ inputs: Array<{ id: string; name: string; manufacturer: string }> }> {
    if (!navigator.requestMIDIAccess) {
      this._isSupported = false;
      return { inputs: [] };
    }
    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      this._isSupported = true;
      const inputs: Array<{ id: string; name: string; manufacturer: string }> = [];
      this.midiAccess.inputs.forEach((p) => {
        inputs.push({ id: p.id, name: p.name ?? "Unknown", manufacturer: p.manufacturer ?? "" });
      });
      return { inputs };
    } catch {
      this._isSupported = false;
      return { inputs: [] };
    }
  }

  /**
   * Connect to a specific MIDI input port.
   */
  connect(inputId: string): void {
    if (!this.midiAccess) return;
    // Disconnect previous
    this.disconnect();

    const port = this.midiAccess.inputs.get(inputId);
    if (!port) return;

    this.inputPort = port;
    port.onmidimessage = (event) => this.handleMidiMessage(event);
  }

  /**
   * Disconnect from the current input.
   */
  disconnect(): void {
    if (this.inputPort) {
      this.inputPort.onmidimessage = null;
      this.inputPort = null;
    }
  }

  /**
   * Start recording.
   */
  start(): void {
    if (this.state.isRecording) return;

    this.state = {
      isRecording: true,
      isPaused: false,
      startTime: performance.now(),
      notes: [],
      durationMs: 0,
    };
    this.pendingNotes.clear();

    // Update duration every 100ms
    this.tickInterval = setInterval(() => {
      if (this.state.isRecording && !this.state.isPaused) {
        this.state.durationMs = performance.now() - this.state.startTime;
        this.emitChange();
      }
    }, 100);

    this.emitChange();
  }

  /**
   * Pause/resume recording.
   */
  togglePause(): void {
    if (!this.state.isRecording) return;
    this.state.isPaused = !this.state.isPaused;
    this.emitChange();
  }

  /**
   * Stop recording and finalize all pending notes.
   */
  stop(): RecordingState {
    if (!this.state.isRecording) return this.state;

    // Finalize all pending notes
    const endTime = performance.now() - this.state.startTime;
    for (const [note, info] of this.pendingNotes) {
      this.state.notes.push({
        note,
        velocity: info.velocity,
        timestamp: info.timestamp,
        duration: Math.max(50, endTime - info.timestamp),
        channel: info.channel,
      });
    }
    this.pendingNotes.clear();

    this.state.isRecording = false;
    this.state.isPaused = false;
    this.state.durationMs = endTime;

    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    this.emitChange();
    return { ...this.state, notes: [...this.state.notes] };
  }

  /**
   * Export recorded notes as a Standard MIDI File (.mid) ArrayBuffer.
   */
  exportMidiFile(): ArrayBuffer | null {
    if (this.state.notes.length === 0) return null;

    const PPQ = 480; // pulses per quarter note
    const tempoUsPerBeat = 500000; // 120 BPM default
    const msPerPulse = tempoUsPerBeat / 1000 / PPQ;

    // Sort notes by timestamp
    const sorted = [...this.state.notes].sort((a, b) => a.timestamp - b.timestamp);

    // Build MIDI events as delta-time + event pairs
    const events: Array<{ deltaTicks: number; bytes: number[] }> = [];

    // Track 0: tempo meta event
    events.push({ deltaTicks: 0, bytes: [0xFF, 0x51, 0x03, (tempoUsPerBeat >> 16) & 0xff, (tempoUsPerBeat >> 8) & 0xff, tempoUsPerBeat & 0xff] });

    // Create note-on and note-off events
    const midiEvents: Array<{ timeMs: number; bytes: number[] }> = [];
    for (const note of sorted) {
      const channel = note.channel & 0x0f;
      midiEvents.push({ timeMs: note.timestamp, bytes: [0x90 | channel, note.note & 0x7f, note.velocity & 0x7f] });
      midiEvents.push({ timeMs: note.timestamp + note.duration, bytes: [0x80 | channel, note.note & 0x7f, 0] });
    }

    // Sort by time
    midiEvents.sort((a, b) => a.timeMs - b.timeMs);

    // Convert to delta ticks
    let lastTick = 0;
    for (const evt of midiEvents) {
      const tick = Math.round(evt.timeMs / msPerPulse);
      const delta = Math.max(0, tick - lastTick);
      events.push({ deltaTicks: delta, bytes: evt.bytes });
      lastTick = tick;
    }

    // End of track
    events.push({ deltaTicks: 0, bytes: [0xFF, 0x2F, 0x00] });

    // Encode as MIDI file
    return this.encodeMidiFile(PPQ, [events]);
  }

  /**
   * Export as a downloadable .mid file (triggers browser download).
   */
  downloadMidi(filename = "recording.mid"): void {
    const buffer = this.exportMidiFile();
    if (!buffer) return;

    const blob = new Blob([buffer], { type: "audio/midi" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  dispose(): void {
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.disconnect();
    this.midiAccess = null;
  }

  /* ------------------------------------------------------------------ */
  /* Private helpers                                                      */
  /* ------------------------------------------------------------------ */

  private handleMidiMessage(event: MIDIMessageEvent): void {
    if (!this.state.isRecording || this.state.isPaused) return;

    const data = event.data;
    if (!data || data.length < 2) return;

    const status = data[0] & 0xf0;
    const channel = data[0] & 0x0f;
    const note = data[1] & 0x7f;
    const velocity = data.length > 2 ? data[2] & 0x7f : 0;
    const relativeTime = performance.now() - this.state.startTime;

    if (status === 0x90 && velocity > 0) {
      // Note ON
      this.pendingNotes.set(note, { velocity, timestamp: relativeTime, channel });
    } else if (status === 0x80 || (status === 0x90 && velocity === 0)) {
      // Note OFF
      const pending = this.pendingNotes.get(note);
      if (pending) {
        this.pendingNotes.delete(note);
        this.state.notes.push({
          note,
          velocity: pending.velocity,
          timestamp: pending.timestamp,
          duration: Math.max(50, relativeTime - pending.timestamp),
          channel: pending.channel,
        });
        this.emitChange();
      }
    }
  }

  private emitChange(): void {
    if (this.onChange) {
      this.onChange({ ...this.state, notes: [...this.state.notes] });
    }
  }

  /**
   * Encode tracks into a Standard MIDI File (format 0, single track).
   */
  private encodeMidiFile(ticksPerBeat: number, tracks: Array<Array<{ deltaTicks: number; bytes: number[] }>>): ArrayBuffer {
    const trackData: number[] = [];

    for (const track of tracks) {
      for (const event of track) {
        // Write variable-length delta time
        this.writeVarLen(trackData, event.deltaTicks);
        // Write event bytes
        trackData.push(...event.bytes);
      }
    }

    // Build file
    const header = [
      0x4d, 0x54, 0x68, 0x64, // "MThd"
      0x00, 0x00, 0x00, 0x06, // header length = 6
      0x00, 0x00,             // format 0
      0x00, 0x01,             // 1 track
      (ticksPerBeat >> 8) & 0xff, ticksPerBeat & 0xff,
    ];

    const trackHeader = [
      0x4d, 0x54, 0x72, 0x6b, // "MTrk"
      (trackData.length >> 24) & 0xff,
      (trackData.length >> 16) & 0xff,
      (trackData.length >> 8) & 0xff,
      trackData.length & 0xff,
    ];

    const totalLength = header.length + trackHeader.length + trackData.length;
    const result = new Uint8Array(totalLength);
    result.set(header, 0);
    result.set(trackHeader, header.length);
    result.set(trackData, header.length + trackHeader.length);

    return result.buffer;
  }

  private writeVarLen(arr: number[], value: number): void {
    if (value < 0) value = 0;
    const bytes: number[] = [];
    bytes.push(value & 0x7f);
    value >>= 7;
    while (value > 0) {
      bytes.push((value & 0x7f) | 0x80);
      value >>= 7;
    }
    for (let i = bytes.length - 1; i >= 0; i--) {
      arr.push(bytes[i]);
    }
  }
}
