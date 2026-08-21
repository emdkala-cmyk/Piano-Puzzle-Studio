import type { Bounds } from "../geometry/models";

export type CompositionPreviewMode = "split" | "piano-only" | "puzzle-only";

export interface CompositionLayout {
  compositionWidth: number;
  compositionHeight: number;
  pianoRegion: Bounds;
  puzzleRegion: Bounds;
  previewMode: CompositionPreviewMode;
}
