import type { SustainEvent } from "../midi/models";
import type { SustainExpressionSettings } from "./models";

export interface SustainDerived {
  sustainActiveAtNoteOff: boolean;
  sustainReleaseTimeMs?: number;
  sustainedUntilMs?: number;
}

export function computeSustainDerived(
  trackIndex: number,
  noteOffTimeMs: number,
  sustainEvents: SustainEvent[],
  timelineDurationMs: number,
  settings: SustainExpressionSettings
): SustainDerived {
  if (!settings.enabled) return { sustainActiveAtNoteOff: false };
  const trackEvents = sustainEvents.filter((event) => event.trackIndex === trackIndex).sort((a, b) => a.timeMs - b.timeMs);
  if (!trackEvents.length) return { sustainActiveAtNoteOff: false };

  let active = false;
  let releaseTimeMs: number | undefined;
  for (const event of trackEvents) {
    const isOn = event.value >= settings.ccThreshold;
    if (event.timeMs <= noteOffTimeMs) {
      active = isOn;
    } else if (active && !isOn && releaseTimeMs === undefined) {
      releaseTimeMs = event.timeMs;
    }
  }
  if (!active) return { sustainActiveAtNoteOff: false };

  const sustainedUntilMs = releaseTimeMs ?? Math.max(noteOffTimeMs, timelineDurationMs);
  return { sustainActiveAtNoteOff: true, sustainReleaseTimeMs: releaseTimeMs, sustainedUntilMs };
}
