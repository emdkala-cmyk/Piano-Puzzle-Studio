import type { MappedChordEvent, MappedNoteEvent } from "./event-models";
export function groupMappedChords(events: MappedNoteEvent[], windowMs: number): MappedChordEvent[] {
  const sorted = [...events].sort((a, b) => a.startTimeMs - b.startTimeMs); const groups: MappedChordEvent[] = [];
  for (let i = 0; i < sorted.length;) {
    const first = sorted[i]; const members = sorted.filter((event) => Math.abs(event.startTimeMs - first.startTimeMs) <= windowMs);
    if (members.length > 1) groups.push({ id: `mapped-chord-${groups.length + 1}`, noteEventIds: members.map((e) => e.id), midiNotes: members.map((e) => e.midiNote), startTimeMs: first.startTimeMs, durationMs: Math.max(...members.map((e) => e.durationMs)), spawnPoints: members.flatMap((e) => e.spawnPoint ? [e.spawnPoint] : []), pieceIds: [...new Set(members.flatMap((e) => e.assignedPieceIds))], velocity: members.reduce((sum, e) => sum + e.normalizedVelocity, 0) / members.length });
    i += Math.max(1, members.length);
  } return groups;
}
