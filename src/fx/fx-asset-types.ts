export type FxTextureId =
  | "smoke-wisp-01"
  | "smoke-wisp-02"
  | "smoke-cloud-01"
  | "ember-small"
  | "spark-cross"
  | "micro-spark"
  | "spark-field"
  | "micro-streak"
  | "particle-cluster"
  | "dust-mote"
  | "soft-bokeh"
  | "light-streak"
  | "dissolve-noise";

export type FxAssetType = "smoke" | "ember" | "spark" | "dust" | "bokeh" | "streak" | "noise-mask";
export type FxAssetSource = "procedural" | "bundled" | "user";

export interface FxExternalAssetMetadata {
  license: string;
  commercialUse: boolean;
  source?: Exclude<FxAssetSource, "procedural">;
  type?: FxAssetType;
  atlasGroup?: FxAssetDescriptor["atlasGroup"];
  fallbackId?: FxTextureId;
  notes?: string;
}

export interface FxAssetDescriptor {
  id: FxTextureId;
  type: FxAssetType;
  source: FxAssetSource;
  license: string;
  commercialUse: boolean;
  procedural: boolean;
  atlasGroup: "smoke" | "particle" | "mask";
  fallbackId: FxTextureId;
  width: number;
  height: number;
  notes: string;
}

export const FX_TEXTURE_IDS: readonly FxTextureId[] = [
  "smoke-wisp-01",
  "smoke-wisp-02",
  "smoke-cloud-01",
  "ember-small",
  "spark-cross",
  "micro-spark",
  "spark-field",
  "micro-streak",
  "particle-cluster",
  "dust-mote",
  "soft-bokeh",
  "light-streak",
  "dissolve-noise"
];
