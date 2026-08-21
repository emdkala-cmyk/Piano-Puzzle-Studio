import type { MappedChordEvent, MappedNoteEvent } from "../midi/event-models";
import type { ChordExpression, ChordExpressionSettings } from "./models";

export interface ChordMemberInfo {
  chordId: string;
  chordSize: number;
  chordIndex: number;
  delayMs: number;
}

export interface ChordExpressionResult {
  chordExpressions: Map<string, ChordExpression>;
  memberInfoByAssignmentId: Map<string, ChordMemberInfo>;
}

export function computeChordExpressions(
  chords: MappedChordEvent[],
  eventsById: Map<string, MappedNoteEvent>,
  assignmentIdByNoteEventId: Map<string, string>,
  settings: ChordExpressionSettings
): ChordExpressionResult {
  const chordExpressions = new Map<string, ChordExpression>();
  const memberInfoByAssignmentId = new Map<string, ChordMemberInfo>();
  if (!settings.enabled) return { chordExpressions, memberInfoByAssignmentId };

  for (const chord of chords) {
    const members = chord.noteEventIds
      .map((id) => eventsById.get(id))
      .filter((event): event is MappedNoteEvent => Boolean(event));
    if (!members.length) continue;

    const velocities = members.map((member) => member.normalizedVelocity);
    const averageVelocity = velocities.reduce((sum, value) => sum + value, 0) / velocities.length;
    const maxVelocity = Math.max(...velocities);
    const totalEnergy = velocities.reduce((sum, value) => sum + value, 0);
    const normalizedChordSize = Math.min(1, members.length / 8);
    const chordEmphasis = Math.min(1, (maxVelocity * 0.6 + normalizedChordSize * 0.4) * (1 + settings.emphasisInfluence));
    const spreadDelayMs = settings.spreadMs;

    chordExpressions.set(chord.id, {
      chordId: chord.id,
      startTimeMs: chord.startTimeMs,
      noteCount: members.length,
      averageVelocity,
      maxVelocity,
      totalEnergy,
      normalizedChordSize,
      chordEmphasis,
      spreadDelayMs,
      centerBias: 0.5
    });

    const ordered = [...members].sort((a, b) => {
      if (a.midiNote !== b.midiNote) return a.midiNote - b.midiNote;
      const aId = assignmentIdByNoteEventId.get(a.id) ?? "";
      const bId = assignmentIdByNoteEventId.get(b.id) ?? "";
      return aId < bId ? -1 : aId > bId ? 1 : 0;
    });
    ordered.forEach((member, index) => {
      const assignmentId = assignmentIdByNoteEventId.get(member.id);
      if (!assignmentId) return;
      const spreadFraction = ordered.length > 1 ? index / (ordered.length - 1) : 0;
      memberInfoByAssignmentId.set(assignmentId, {
        chordId: chord.id,
        chordSize: members.length,
        chordIndex: index,
        delayMs: spreadFraction * spreadDelayMs
      });
    });
  }

  return { chordExpressions, memberInfoByAssignmentId };
}
