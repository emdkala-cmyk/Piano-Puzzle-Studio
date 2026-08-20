import type { NormalizedMidi } from "./models";
import type { Calibration } from "../keyboard/models";
import type { GeometryResult } from "../geometry/models";
import type { MappedNoteEvent, MappingWarning } from "./event-models";
import type { MidiMappingConfig, MidiMappingResult } from "../puzzle/puzzle-event-models";
import { getKeyByMidiNote } from "../keyboard/key-map-lookup";
import { isMidiNoteInRange } from "./note-range";
import { assignPieces } from "../puzzle/piece-assignment";
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
    if (event.spawnPoint && geometry) { const eventAssignments = assignPieces(event, geometry.pieces, config.mappingMode); event.assignedPieceIds = eventAssignments.map((a) => a.pieceId); event.state = eventAssignments.length ? "assigned" : event.state; assignments.push(...eventAssignments); }
    events.push(event);
  }
  return { config, events, chords: groupMappedChords(events, config.chordWindowMs), assignments, generatedAt: Date.now(), sourceMidiAssetId, sourceCalibrationId: calibration?.id };
}
