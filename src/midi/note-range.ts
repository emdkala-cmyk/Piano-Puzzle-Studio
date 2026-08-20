export type OutOfRangePolicy = "ignore" | "clamp" | "mark-invalid";
export interface MidiRange { first: number; last: number }
export const PIANO_RANGE: MidiRange = { first: 21, last: 108 };
export function isMidiNoteInRange(note: number, range: MidiRange = PIANO_RANGE): boolean { return note >= range.first && note <= range.last; }
