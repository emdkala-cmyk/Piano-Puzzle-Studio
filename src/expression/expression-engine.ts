import type { MappedChordEvent, MappedNoteEvent } from "../midi/event-models";
import type { SustainEvent } from "../midi/models";
import type { PuzzlePieceAssignment } from "../puzzle/puzzle-event-models";
import type { ExpressionDiagnostics, ExpressionResult, ExpressionSettings, NoteExpression } from "./models";
import { computeChordExpressions } from "./chord-expression";
import { buildNoteExpression } from "./note-expression";

export interface ExpressionEngineInputs {
  mappedEvents: MappedNoteEvent[];
  assignments: PuzzlePieceAssignment[];
  chords: MappedChordEvent[];
  sustainEvents: SustainEvent[];
  timelineDurationMs: number;
  settings: ExpressionSettings;
}

function emptyResult(warnings: string[] = []): ExpressionResult {
  const diagnostics: ExpressionDiagnostics = {
    noteCount: 0, sustainedNoteCount: 0, chordCount: 0, averageEnergy: 0, maxEnergy: 0, skippedEvents: 0, warnings
  };
  return { noteExpressions: new Map(), chordExpressions: new Map(), diagnostics };
}

export function buildExpressionResult(inputs: ExpressionEngineInputs): ExpressionResult {
  const { mappedEvents, assignments, chords, sustainEvents, timelineDurationMs, settings } = inputs;
  if (!settings.enabled) return emptyResult();

  const eventsById = new Map(mappedEvents.map((event) => [event.id, event]));
  const assignmentIdByNoteEventId = new Map(assignments.map((assignment) => [assignment.noteEventId, assignment.id]));
  const { chordExpressions, memberInfoByAssignmentId } = computeChordExpressions(chords, eventsById, assignmentIdByNoteEventId, settings.chord);

  const noteExpressions = new Map<string, NoteExpression>();
  const warnings: string[] = [];
  let skippedEvents = 0;
  let sustainedNoteCount = 0;
  let totalEnergy = 0;
  let maxEnergy = 0;

  for (const assignment of assignments) {
    const event = eventsById.get(assignment.noteEventId);
    if (!event) {
      skippedEvents++;
      warnings.push(`Assignment ${assignment.id} references missing note event ${assignment.noteEventId}.`);
      continue;
    }
    const chordMemberInfo = memberInfoByAssignmentId.get(assignment.id);
    const chordEmphasis = chordMemberInfo ? chordExpressions.get(chordMemberInfo.chordId)?.chordEmphasis : undefined;
    const expression = buildNoteExpression({ assignment, event, sustainEvents, timelineDurationMs, chordMemberInfo, chordEmphasis, settings });
    noteExpressions.set(assignment.id, expression);
    if (expression.sustainActiveAtNoteOff) sustainedNoteCount++;
    totalEnergy += expression.energy;
    maxEnergy = Math.max(maxEnergy, expression.energy);
  }

  return {
    noteExpressions,
    chordExpressions,
    diagnostics: {
      noteCount: noteExpressions.size,
      sustainedNoteCount,
      chordCount: chordExpressions.size,
      averageEnergy: noteExpressions.size ? totalEnergy / noteExpressions.size : 0,
      maxEnergy,
      skippedEvents,
      warnings
    }
  };
}
