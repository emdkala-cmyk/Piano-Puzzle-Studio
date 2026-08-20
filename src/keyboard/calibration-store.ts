import type { Calibration } from "./models";
import { migrateCalibration } from "./calibration-workflow";
const STORAGE_KEY = "piano-puzzle-calibrations-v1";
export function saveCalibration(calibration: Calibration): void {
  const all = loadCalibrations().filter((item) => item.id !== calibration.id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...all, calibration]));
}
export function saveCalibrationWithTimestamp(calibration: Calibration): Calibration {
  const saved = { ...calibration, updatedAt: new Date().toISOString() };
  saveCalibration(saved);
  return saved;
}
export function loadCalibrations(): Calibration[] {
  try { const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); return Array.isArray(parsed) ? (parsed as Calibration[]).map(migrateCalibration) : []; } catch { return []; }
}
export function loadCalibration(id: string): Calibration | undefined { return loadCalibrations().find((item) => item.id === id); }
