import type { CompositionLayout } from "./models";

export const DEFAULT_COMPOSITION_LAYOUT: CompositionLayout = {
  compositionWidth: 1080,
  compositionHeight: 1920,
  puzzleRegion: { x: 0, y: 0, width: 1080, height: 960 },
  pianoRegion: { x: 0, y: 960, width: 1080, height: 960 },
  previewMode: "split"
};

export function normalizeCompositionLayout(value?: Partial<CompositionLayout>): CompositionLayout {
  return { ...DEFAULT_COMPOSITION_LAYOUT, ...value };
}
