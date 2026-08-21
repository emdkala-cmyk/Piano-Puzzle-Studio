import type { Point } from "../geometry/models";
import type { OutOfRangePolicy } from "../midi/note-range";
export type PieceMappingMode = "nearest-centroid" | "target-region" | "deterministic-sequence" | "one-note-one-piece";
export interface PuzzlePieceAssignment { id: string; noteEventId: string; midiNote: number; pieceId: string; mappingMode: PieceMappingMode; distance?: number; assignedAt: number; reason: string; valid: boolean }
export interface PuzzleNoteMappingResult { noteEventId: string; midiNote: number; keyMapEntryId?: string; spawnPoint?: Point; pieceIds: string[]; assignments: PuzzlePieceAssignment[]; status: "mapped" | "partially-mapped" | "unmapped" | "invalid"; warnings: string[] }
export interface MidiMappingConfig { enabled: boolean; sourceAssetId?: string; calibrationId?: string; mappingMode: PieceMappingMode; outOfRangePolicy: OutOfRangePolicy; chordWindowMs: number; showDebugMarkers: boolean; showAssignmentLines: boolean; sequenceCycle: boolean }
export interface MidiMappingResult { config: MidiMappingConfig; events: import("../midi/event-models").MappedNoteEvent[]; chords: import("../midi/event-models").MappedChordEvent[]; assignments: PuzzlePieceAssignment[]; generatedAt: number; sourceMidiAssetId?: string; sourceCalibrationId?: string }
