import { Midi } from "@tonejs/midi";
import type { NormalizedMidi, MidiNoteEvent, ChordGroup } from "./models";

const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

export function parseMidi(buffer: ArrayBuffer, fileName: string, selectedTrackIndices: number[] = [], tolerance = 0.045): NormalizedMidi {
  const midi = new Midi(buffer);
  const tracks = midi.tracks.map((track, index) => ({
    index,
    name: track.name || undefined,
    channel: track.channel,
    noteCount: track.notes.length
  }));
  const selected = selectedTrackIndices.length ? new Set(selectedTrackIndices) : undefined;
  const events: MidiNoteEvent[] = [];
  midi.tracks.forEach((track, trackIndex) => {
    if (selected && !selected.has(trackIndex)) return;
    track.notes.forEach((note, noteIndex) => {
      events.push({
        id: `note-${trackIndex}-${noteIndex}`,
        trackIndex,
        channel: track.channel,
        midiNote: note.midi,
        noteName: `${NOTE_NAMES[note.midi % 12]}${Math.floor(note.midi / 12) - 1}`,
        startTime: note.time,
        duration: note.duration,
        velocity: note.velocity
      });
    });
  });
  events.sort((a, b) => a.startTime - b.startTime || a.midiNote - b.midiNote);
  const chordGroups: ChordGroup[] = [];
  let groupIndex = 0;
  for (let i = 0; i < events.length;) {
    const first = events[i];
    const sameTime = events.filter((event) => Math.abs(event.startTime - first.startTime) <= tolerance);
    if (sameTime.length > 1) {
      const id = `chord-${groupIndex++}`;
      sameTime.forEach((event) => { event.chordGroupId = id; });
      chordGroups.push({ id, startTime: first.startTime, eventIds: sameTime.map((event) => event.id) });
    }
    i += Math.max(1, sameTime.length);
  }
  const pitches = events.map((event) => event.midiNote);
  const velocities = events.map((event) => event.velocity);
  return {
    fileName,
    duration: midi.duration,
    ppq: midi.header.ppq,
    tempos: midi.header.tempos.map((tempo) => ({ bpm: tempo.bpm, ticks: tempo.ticks, time: tempo.time ?? 0 })),
    timeSignatures: midi.header.timeSignatures.map((signature) => ({ numerator: signature.timeSignature[0], denominator: signature.timeSignature[1], ticks: signature.ticks, time: 0 })),
    tracks,
    events,
    chordGroups,
    totalNoteCount: events.length,
    minPitch: pitches.length ? Math.min(...pitches) : 0,
    maxPitch: pitches.length ? Math.max(...pitches) : 0,
    averageVelocity: velocities.length ? velocities.reduce((sum, value) => sum + value, 0) / velocities.length : 0
  };
}
