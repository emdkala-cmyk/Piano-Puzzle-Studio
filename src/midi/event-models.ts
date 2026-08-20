import type { Bounds, Point } from "../geometry/models";
import type { KeyType } from "../keyboard/models";

export type MappingState = "unmapped" | "mapped" | "assigned" | "invalid";
export interface MappedNoteEvent {
  id: string; midiNote: number; noteName: string; channel: number; velocity: number; normalizedVelocity: number;
  startTick?: number; endTick?: number; durationTicks?: number; startTimeMs: number; durationMs: number;
  keyType?: KeyType; keyMapEntryId?: string; spawnPoint?: Point; centerPoint?: Point; impactPoint?: Point;
  projectedPolygon?: Point[]; projectedBounds?: Bounds; assignedPieceIds: string[]; priority?: number; layer?: number;
  state: MappingState; warnings: MappingWarning[];
}
export interface MappingWarning { code: string; message: string; severity: "info" | "warning" | "error"; midiNote?: number; noteEventId?: string }
export interface MappedChordEvent { id: string; noteEventIds: string[]; midiNotes: number[]; startTimeMs: number; durationMs: number; spawnPoints: Point[]; pieceIds: string[]; velocity: number }
