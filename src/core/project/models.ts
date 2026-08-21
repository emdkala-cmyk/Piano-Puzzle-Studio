export type AssetType = "image" | "midi" | "audio";
export type AssetStatus = "empty" | "loading" | "loaded" | "error";
export type AssetRole = "reference-piano-frame" | "puzzle-artwork" | "midi";
import type { Calibration } from "../../keyboard/models";
import type { MidiMappingConfig } from "../../puzzle/puzzle-event-models";
import type { AnimationTimingSettings } from "../../animation/models";
import type { ExpressionSettings } from "../../expression/models";
import { DEFAULT_EXPRESSION_SETTINGS } from "../../expression/expression-store";

export interface Asset {
  id: string;
  type: AssetType;
  fileName: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  duration?: number;
  width?: number;
  height?: number;
  importedAt: string;
  status: AssetStatus;
  error?: string;
  dataUrl?: string;
  role?: AssetRole;
}

export interface Project {
  projectId: string;
  projectName: string;
  createdAt: string;
  updatedAt: string;
  imageAsset?: Asset;
  midiAsset?: Asset;
  audioAsset?: Asset;
  canvasSettings: { width: number; height: number; fit: "contain" | "cover" };
  midiSettings: { selectedTrackIndices: number[]; chordTolerance: number };
  previewSettings: { fps: 30 | 60; loop: boolean; currentTime: number };
  keyboardCalibration?: Calibration;
  midiMappingConfig?: MidiMappingConfig;
  animationTimingSettings: AnimationTimingSettings;
  animationEasing: AnimationTimingSettings["easing"];
  animationSpeed: number;
  overlapMode: AnimationTimingSettings["overlapMode"];
  debugVisible: boolean;
  expressionSettings: ExpressionSettings;
  version: string;
}

export function createProject(): Project {
  const now = new Date().toISOString();
  return {
    projectId: crypto.randomUUID(),
    projectName: "پروژه بدون نام",
    createdAt: now,
    updatedAt: now,
    canvasSettings: { width: 1080, height: 1920, fit: "contain" },
    midiSettings: { selectedTrackIndices: [], chordTolerance: 0.045 },
    previewSettings: { fps: 60, loop: false, currentTime: 0 },
    midiMappingConfig: { enabled: true, mappingMode: "deterministic-sequence", outOfRangePolicy: "mark-invalid", chordWindowMs: 45, showDebugMarkers: true, showAssignmentLines: false, sequenceCycle: true },
    animationTimingSettings: { baseTravelDurationMs: 520, minTravelDurationMs: 160, maxTravelDurationMs: 1100, preHitDelayMs: 0, postHitHoldMs: 120, durationInfluence: 0.25, velocityInfluence: 220, overlapMode: "allow-overlap", easing: "easeOut", animationSpeed: 1, debugVisible: true },
    animationEasing: "easeOut",
    animationSpeed: 1,
    overlapMode: "allow-overlap",
    debugVisible: true,
    expressionSettings: DEFAULT_EXPRESSION_SETTINGS,
    version: "0.2.0"
  };
}
