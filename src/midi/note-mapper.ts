import type { NormalizedMidi } from "./models";
import type { Calibration } from "../keyboard/models";
import type { GeometryResult } from "../geometry/models";
import type { MappedNoteEvent, MappingWarning } from "./event-models";
import type { MidiMappingConfig, MidiMappingResult } from "../puzzle/puzzle-event-models";
import { getKeyByMidiNote } from "../keyboard/key-map-lookup";
import { isMidiNoteInRange } from "./note-range";
import { assignPieces, type SequenceAssignmentState } from "../puzzle/piece-assignment";
import { createSequenceCursor } from "../puzzle/sequence-assignment";
import { groupMappedChords } from "./chord-grouper";

export function mapMidiToPuzzle(midi: NormalizedMidi, calibration: Calibration | undefined, geometry: GeometryResult | undefined, config: MidiMappingConfig, sourceMidiAssetId?: string): MidiMappingResult {
  const assignments = []; const events: MappedNoteEvent[] = [];
  for (const source of midi.events) {
    const warnings: MappingWarning[] = []; const inRange = isMidiNoteInRange(source.midiNote, calibration?.noteRange);
    if (!calibration) warnings.push({ code: "NO_CALIBRATION", message: "Calibration is missing.", severity: "error", midiNote: source.midiNote, noteEventId: source.id });
    if (!geometry) warnings.push({ code: "NO_GEOMETRY", message: "Geometry is not built.", severity: "warning", midiNote: source.midiNote, noteEventId: source.id });
    if (!inRange) warnings.push({ code: "OUT_OF_RANGE", message: `MIDI ${source.midiNote} is outside the calibrated range.`, severity: config.outOfRangePolicy === "mark-invalid" ? "error" : "warning", midiNote: source.midiNote, noteEventId: source.id });
    const key = calibration && (inRange || config.outOfRangePolicy === "clamp") ? getKeyByMidiNote(Math.max(calibration.noteRange.first, Math.min(calibration.noteRange.last, source.midiNote)), calibration) : undefined;
    const event: MappedNoteEvent = { ...source, normalizedVelocity: source.velocity, startTimeMs: source.startTime * 1000, durationMs: source.duration * 1000, keyType: key?.keyType, keyMapEntryId: key ? `key-${key.midiNote}` : undefined, spawnPoint: key?.projectedSpawnPoint, centerPoint: key?.projectedCenterPoint, impactPoint: key?.projectedImpactPoint, projectedPolygon: key?.projectedPolygon, projectedBounds: key?.projectedBounds, assignedPieceIds: [], priority: key?.keyType === "black" ? 1 : 0, layer: key?.keyType === "black" ? 1 : 0, state: warnings.some((w) => w.severity === "error") ? "invalid" : key ? "mapped" : "unmapped", warnings };
    events.push(event);
  }
  // deterministic-sequence needs one shared cursor across the whole call, walked in musical (time) order
  // so pieces reveal in the order notes are played, independent of the events[] array's own ordering contract.
  const sequenceState: SequenceAssignmentState | undefined = config.mappingMode === "deterministic-sequence" && geometry
    ? { cursor: createSequenceCursor(geometry.pieces), usedPieceIds: new Set<string>(), cycle: config.sequenceCycle }
    : undefined;
  const assignmentOrder = sequenceState
    ? events.map((event, index) => ({ event, index })).sort((a, b) => a.event.startTimeMs - b.event.startTimeMs || a.index - b.index)
    : events.map((event, index) => ({ event, index }));
  const assignableCount = assignmentOrder.filter(({ event }) => event.spawnPoint && geometry).length;
  let assignableSeen = 0;
  for (const { event } of assignmentOrder) {
    if (event.spawnPoint && geometry) {
      assignableSeen += 1;
      const remainingEvents = assignableCount - assignableSeen + 1;
      const eventAssignments = assignPieces(event, geometry.pieces, config.mappingMode, sequenceState, remainingEvents);
      event.assignedPieceIds = eventAssignments.map((a) => a.pieceId);
      event.state = eventAssignments.length ? "assigned" : event.state;
      assignments.push(...eventAssignments);
    }
  }
  return { config, events, chords: groupMappedChords(events, config.chordWindowMs), assignments, generatedAt: Date.now(), sourceMidiAssetId, sourceCalibrationId: calibration?.id };
}
