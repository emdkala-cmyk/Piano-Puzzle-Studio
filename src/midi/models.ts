export interface MidiNoteEvent {
  id: string;
  trackIndex: number;
  channel: number;
  midiNote: number;
  noteName: string;
  startTime: number;
  duration: number;
  velocity: number;
  chordGroupId?: string;
}

export interface MidiTrackSummary {
  index: number;
  name?: string;
  channel?: number;
  noteCount: number;
}

export interface ChordGroup {
  id: string;
  startTime: number;
  eventIds: string[];
}

export interface NormalizedMidi {
  fileName: string;
  duration: number;
  ppq: number;
  tempos: Array<{ bpm: number; ticks: number; time: number }>;
  timeSignatures: Array<{ numerator: number; denominator: number; ticks: number; time: number }>;
  tracks: MidiTrackSummary[];
  events: MidiNoteEvent[];
  chordGroups: ChordGroup[];
  totalNoteCount: number;
  minPitch: number;
  maxPitch: number;
  averageVelocity: number;
}
