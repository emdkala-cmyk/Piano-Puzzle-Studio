import { useEffect, useRef, useState } from "react";
import "pixi.js/unsafe-eval";
import { Application, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { createProject, type Asset } from "../../core/project/models";
import { generateGeometry, suggestDensity, drawDensityPreview } from "../../geometry/generator";
import { renderCalibration } from "../../keyboard/calibration-renderer";
import { createOverlaySvg } from "../../keyboard/overlay-generator";
import { loadCalibrations, saveCalibrationWithTimestamp } from "../../keyboard/calibration-store";
import { calibrationIsValid, createDefaultCalibration, migrateCalibration, updateAnchorDiagnostics, viewTransform } from "../../keyboard/calibration-workflow";
import { isValidQuadrilateral } from "../../keyboard/homography";
import { anchorReferencePoint, baseProject, computeCornerHomography } from "../../keyboard/key-projection";
import { computeViewProjection, toSourcePoint, toViewPoint } from "../../keyboard/view-projection";
import { parseMidi } from "../../midi/parser";
import { mapMidiToPuzzle } from "../../midi/note-mapper";
import type { NormalizedMidi } from "../../midi/models";
import type { GeometryMode, GeometryResult } from "../../geometry/models";
import type { MidiMappingConfig, MidiMappingResult } from "../../puzzle/puzzle-event-models";
import type { Calibration, KeyboardType, PianoKey, ViewType } from "../../keyboard/models";
import { AnimationClock } from "../../animation/animation-clock";
import { AnimationEngine } from "../../animation/animation-engine";
import { normalizeAnimationTiming } from "../../animation/models";
import type { AnimationClockState, AnimationTimingSettings, EasingName, PieceAnimationFrame } from "../../animation/models";
import { PuzzleRenderer } from "../../puzzle/puzzle-renderer";
import { buildExpressionResult } from "../../expression/expression-engine";
import { DEFAULT_EXPRESSION_SETTINGS, normalizeExpressionSettings } from "../../expression/expression-store";
import type { ExpressionResult, ExpressionSettings } from "../../expression/models";
import { computeAlignedPlacement, projectGeometry, projectSpawnPoints, toAbsolutePlacement, drawPlacementPreview, DEFAULT_PIANO_PLACEMENT, DEFAULT_ARTWORK_PLACEMENT } from "../../composition/coordinate-transform";
import type { ArtworkPlacementConfig, PianoPlacementConfig, PlacementAlignX, PlacementAlignY } from "../../composition/coordinate-transform";
import { normalizeCompositionLayout } from "../../composition/composition-store";
import { PianoSynth } from "../../audio/piano-synth";
import { VisualFxEngine } from "../../fx/fx-engine";
import { DEFAULT_VISUAL_FX_CONFIG, type FxAnimationFrame, type VisualFxConfig } from "../../fx/fx-types";

const views: ViewType[] = ["top", "top-angle", "three-quarter", "side", "custom"];
const viewLabels: Record<ViewType, string> = { top: "top (از بالا)", "top-angle": "top-angle (زاویه‌ی بالا)", "three-quarter": "three-quarter (سه‌ربعی)", side: "side (از بغل)", custom: "custom (سفارشی)" };
const corners = ["topLeft", "topRight", "bottomRight", "bottomLeft"] as const;
type Corner = typeof corners[number];
const cornerColors: Record<Corner, string> = { topLeft: "#ff6b8a", topRight: "#65d8ff", bottomRight: "#ffc45c", bottomLeft: "#8ef0a3" };
const anchorHints: Partial<Record<string, string>> = {
  leftKeyboardEdge: "Left edge — physical left edge of the leftmost key (لبه‌ی چپ کیبورد)",
  rightKeyboardEdge: "Right edge — physical right edge of the rightmost key (لبه‌ی راست کیبورد)",
  C2: "C2 — two octaves below middle C (دو اکتاو پایین‌تر از C وسط)",
  C3: "C3 — one octave below middle C (یک اکتاو پایین‌تر از C وسط)",
  C4: "C4 — middle C: white key just left of the 2-black-key group nearest the keyboard's center (C وسط: کلید سفید سمت چپ گروه دو کلید سیاه نزدیک وسط کیبورد)",
  C5: "C5 — one octave above middle C (یک اکتاو بالاتر از C وسط)",
  C6: "C6 — two octaves above middle C (دو اکتاو بالاتر از C وسط)"
};
const keyboardTypes: KeyboardType[] = ["88-key", "76-key"];
const keyboardTypeLabels: Record<KeyboardType, string> = { "88-key": "88-key Piano (پیانو ۸۸ کلید)", "76-key": "76-key Korg Pa4X (کرگ Pa4X ۷۶ کلید)", "61-key": "61-key", "49-key": "49-key", custom: "Custom" };
const geometryModes: GeometryMode[] = ["grid", "voronoi", "delaunay", "hybrid"];
const geometryModeLabels: Record<GeometryMode, string> = { grid: "Grid (شبکه‌ای)", voronoi: "Voronoi", delaunay: "Delaunay", hybrid: "Hybrid (ترکیبی)" };
const DEFAULT_LAYOUT = normalizeCompositionLayout();
const EMPTY_GEOMETRY: GeometryResult = { mode: "grid", width: 0, height: 0, pieces: [], importanceMap: { width: 0, height: 0, values: [], average: 0 } };

function formatTime(ms: number): string {
  const clamped = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(clamped / 60000);
  const seconds = Math.floor((clamped % 60000) / 1000);
  const millis = clamped % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

export function App() {
  const host = useRef<HTMLDivElement>(null); const pixi = useRef<Application | null>(null); const overlay = useRef<Container | null>(null);
  const puzzleHost = useRef<HTMLDivElement>(null); const puzzlePixi = useRef<Application | null>(null);
  const [project] = useState(() => createProject());
  const [referenceFrame, setReferenceFrame] = useState<Asset>(); const [midiAsset, setMidiAsset] = useState<Asset>();
  const [puzzleArtwork, setPuzzleArtwork] = useState<Asset>();
  const [calibration, setCalibration] = useState<Calibration>(); const [geometry, setGeometry] = useState<GeometryResult>();
  const [midi, setMidi] = useState<NormalizedMidi>(); const [mapping, setMapping] = useState<MidiMappingResult>();
  const [referenceStatus, setReferenceStatus] = useState<"empty" | "loading" | "loaded" | "error">("empty"); const [midiStatus, setMidiStatus] = useState<"empty" | "loading" | "loaded" | "error">("empty");
  const [puzzleArtworkStatus, setPuzzleArtworkStatus] = useState<"empty" | "loading" | "loaded" | "error">("empty");
  const [referenceError, setReferenceError] = useState(""); const [mappingError, setMappingError] = useState(""); const [puzzleArtworkError, setPuzzleArtworkError] = useState("");
  const [savedAt, setSavedAt] = useState(""); const [hoveredKey, setHoveredKey] = useState<string>(); const [viewSize, setViewSize] = useState({ width: 0, height: 0 });
  const [manualModeActive, setManualModeActive] = useState(false);
  const [mappingMode, setMappingMode] = useState(project.midiMappingConfig?.mappingMode ?? "deterministic-sequence"); const [outOfRangePolicy, setOutOfRangePolicy] = useState(project.midiMappingConfig?.outOfRangePolicy ?? "mark-invalid"); const [chordWindowMs, setChordWindowMs] = useState(project.midiMappingConfig?.chordWindowMs ?? 45);
  const [sequenceCycle, setSequenceCycle] = useState(project.midiMappingConfig?.sequenceCycle ?? true);
  const [keyboardType, setKeyboardType] = useState<KeyboardType>("88-key");
  const [geometryMode, setGeometryMode] = useState<GeometryMode>("grid"); const [geometryDensity, setGeometryDensity] = useState(8); const [showPieceBorders, setShowPieceBorders] = useState(false);
  const [previewTab, setPreviewTab] = useState<"calibration" | "puzzle">("calibration");
  const [inspectorTab, setInspectorTab] = useState<"mapping" | "playback" | "expression" | "fx">("mapping");
  const [fxSettings, setFxSettings] = useState<VisualFxConfig>(DEFAULT_VISUAL_FX_CONFIG);
  const [previewPieceCount, setPreviewPieceCount] = useState(0);
  const densityPreviewRef = useRef<HTMLCanvasElement>(null);
  const [calibZoom, setCalibZoom] = useState({ scale: 1, panX: 0, panY: 0 });
  const calibZoomRef = useRef(calibZoom);
  const [pianoPlacement, setPianoPlacement] = useState<PianoPlacementConfig>(DEFAULT_PIANO_PLACEMENT);
  const pianoPlacementRef = useRef(pianoPlacement);
  const placementPreviewRef = useRef<HTMLCanvasElement>(null);
  const [artworkPlacement, setArtworkPlacement] = useState<ArtworkPlacementConfig>(DEFAULT_ARTWORK_PLACEMENT);
  const artworkPlacementRef = useRef(artworkPlacement);
  const artworkPlacementPreviewRef = useRef<HTMLCanvasElement>(null);

  // Animation (Phase 6)
  const engineRef = useRef(new AnimationEngine());
  const clockRef = useRef(new AnimationClock());
  const rendererRef = useRef<PuzzleRenderer | null>(null);
  const debugLayerRef = useRef<Container | null>(null);
  const fxRef = useRef<VisualFxEngine | null>(null);
  const previousFrameStateRef = useRef(new Map<string, string>());
  const lastFxTickTimeRef = useRef(performance.now());
  const pianoBackgroundRef = useRef<Container | null>(null);
  const referenceFrameImageRef = useRef<HTMLImageElement | undefined>(undefined);
  const spriteRef = useRef<Sprite | null>(null);
  const markersLayerRef = useRef<Container | null>(null);
  const transformRef = useRef({ k: 1, offsetX: 0, offsetY: 0 });
  const puzzleTransformRef = useRef({ k: 1, offsetX: 0, offsetY: 0 });
  const framesRef = useRef<PieceAnimationFrame[]>([]);
  const referenceFrameRef = useRef<Asset | undefined>(undefined);
  const puzzleArtworkImageRef = useRef<HTMLImageElement | undefined>(undefined);
  const artworkTextureRef = useRef<Texture | undefined>(undefined);
  const showPieceBordersRef = useRef(true);
  const geometryRef = useRef<GeometryResult | undefined>(undefined);
  const mappingRef = useRef<MidiMappingResult | undefined>(undefined);
  const projectedMappingRef = useRef<MidiMappingResult | undefined>(undefined);
  const timingRef = useRef<AnimationTimingSettings>(normalizeAnimationTiming(project.animationTimingSettings));
  const lastUiSync = useRef(0);
  const [timingSettings, setTimingSettings] = useState<AnimationTimingSettings>(() => normalizeAnimationTiming(project.animationTimingSettings));
  const [clockState, setClockState] = useState<{ currentTimeMs: number; state: AnimationClockState }>({ currentTimeMs: 0, state: "stopped" });
  const [timelineInfo, setTimelineInfo] = useState<{ count: number; totalDurationMs: number }>({ count: 0, totalDurationMs: 0 });
  const [debugFrames, setDebugFrames] = useState<PieceAnimationFrame[]>([]);
  const [fxStats, setFxStats] = useState<ReturnType<VisualFxEngine["getStats"]>>();
  const [showHelp, setShowHelp] = useState(false);

  const [audioEnabled, setAudioEnabled] = useState(true);
  const audioEnabledRef = useRef(true);
  const audioRef = useRef<PianoSynth>(new PianoSynth());
  const lastAudioTimeMsRef = useRef(0);

  // Musical Expression (Phase 7)
  const [expressionSettings, setExpressionSettings] = useState<ExpressionSettings>(() => normalizeExpressionSettings(project.expressionSettings));
  const expressionRef = useRef<ExpressionSettings>(expressionSettings);
  const expressionResultRef = useRef<ExpressionResult | undefined>(undefined);

  useEffect(() => { referenceFrameRef.current = referenceFrame; geometryRef.current = geometry; mappingRef.current = mapping; timingRef.current = timingSettings; expressionRef.current = expressionSettings; showPieceBordersRef.current = showPieceBorders; audioEnabledRef.current = audioEnabled; calibZoomRef.current = calibZoom; pianoPlacementRef.current = pianoPlacement; artworkPlacementRef.current = artworkPlacement; }, [referenceFrame, geometry, mapping, timingSettings, expressionSettings, showPieceBorders, audioEnabled, calibZoom, pianoPlacement, artworkPlacement]);
  useEffect(() => { setArtworkPlacement(DEFAULT_ARTWORK_PLACEMENT); }, [puzzleArtwork?.id]);
  useEffect(() => { fxRef.current?.setConfig(fxSettings); }, [fxSettings]);
  useEffect(() => {
    const tabs = document.querySelector<HTMLElement>(".inspector-tabs");
    const inspector = document.querySelector<HTMLElement>(".inspector");
    if (!tabs || !inspector || tabs.querySelector("[data-fx-tab]")) return;

    const fxTab = document.createElement("button");
    fxTab.type = "button";
    fxTab.dataset.fxTab = "true";
    fxTab.className = "inspector-tab";
    fxTab.textContent = "Visual FX (جلوه‌ها)";

    const panel = document.createElement("div");
    panel.className = "fx-dom-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <div class="fx-dom-heading">Visual FX / جلوه‌های بصری</div>
      <label>FX Preset<select data-fx="preset"><option value="stardust-stream">Stardust Energy Stream</option><option value="cinematic-orbit">Cinematic Orbit</option><option value="smoke-ember">Smoke & Ember</option><option value="golden-dust">Golden Dust</option><option value="neon-ribbon">Neon Ribbon</option><option value="pink-nebula">Pink Nebula 🌸</option><option value="sparkle-burst">Sparkle Burst ✨</option><option value="firework-streaks">Firework Streaks 🎆</option><option value="purple-vortex">Purple Vortex 🌀</option><option value="minimal">Minimal</option></select></label>
      <label class="toggle-row"><span>Enable Visual FX</span><input data-fx="enabled" type="checkbox"></label>
      <label class="toggle-row"><span>Keyboard Glow</span><input data-fx="glowEnabled" type="checkbox"></label>
      <label class="toggle-row"><span>Particle Trails</span><input data-fx="trailEnabled" type="checkbox"></label>
      <label class="toggle-row"><span>Smoke Layer</span><input data-fx="smokeEnabled" type="checkbox"></label>
      <label class="toggle-row"><span>Lock-in Impact</span><input data-fx="lockImpactEnabled" type="checkbox"></label>
      <label class="toggle-row"><span>Artwork Lighting</span><input data-fx="lightingEnabled" type="checkbox"></label>
      <label class="range-label">Glow Intensity <input data-fx-value="glowIntensity" type="text" class="fx-value-input"></label>
      <input data-fx="glowIntensity" type="range" min="0" max="1" step="0.01">
      <label class="range-label">Particle Density <input data-fx-value="particleDensity" type="text" class="fx-value-input"></label>
      <input data-fx="particleDensity" type="range" min="0" max="1" step="0.01">
      <label class="range-label">Smoke Density <input data-fx-value="smokeDensity" type="text" class="fx-value-input"></label>
      <input data-fx="smokeDensity" type="range" min="0" max="1" step="0.01">
      <label class="range-label">Particle Size <input data-fx-value="particleSize" type="text" class="fx-value-input"></label>
      <input data-fx="particleSize" type="range" min="0.35" max="2.5" step="0.05">
      <label class="range-label">Trail Length <input data-fx-value="trailLength" type="text" class="fx-value-input"></label>
      <input data-fx="trailLength" type="range" min="0" max="1" step="0.01">
      <label class="range-label">Path Curvature <input data-fx-value="pathCurvature" type="text" class="fx-value-input"></label>
      <input data-fx="pathCurvature" type="range" min="0" max="1" step="0.01">
      <label class="range-label">Reveal Duration <input data-fx-value="revealDurationMs" type="text" class="fx-value-input"> ms</label>
      <input data-fx="revealDurationMs" type="range" min="120" max="1400" step="20">
      <label class="range-label">Impact Intensity <input data-fx-value="impactIntensity" type="text" class="fx-value-input"></label>
      <input data-fx="impactIntensity" type="range" min="0" max="1" step="0.01">
      <label class="range-label">Lighting Intensity <input data-fx-value="lightingIntensity" type="text" class="fx-value-input"></label>
      <input data-fx="lightingIntensity" type="range" min="0" max="1" step="0.01">
      <label class="toggle-row"><span>Keyboard Glow (خط درخشان کیبورد)</span><input data-fx="keyboardGlowEnabled" type="checkbox"></label>
      <label class="range-label">Keyboard Glow Intensity <input data-fx-value="keyboardGlowIntensity" type="text" class="fx-value-input"></label>
      <input data-fx="keyboardGlowIntensity" type="range" min="0" max="1" step="0.01">
      <label class="toggle-row"><span>Light Trail (مسیر نورانی)</span><input data-fx="lightTrailEnabled" type="checkbox"></label>
      <label class="range-label">Trail Width <input data-fx-value="lightTrailWidth" type="text" class="fx-value-input"></label>
      <input data-fx="lightTrailWidth" type="range" min="2" max="40" step="1">
      <label class="range-label">Trail Glow Layers <input data-fx-value="lightTrailGlowLayers" type="text" class="fx-value-input"></label>
      <input data-fx="lightTrailGlowLayers" type="range" min="1" max="5" step="1">
      <label class="range-label">Trail Lifetime (ms) <input data-fx-value="lightTrailLifetimeMs" type="text" class="fx-value-input"></label>
      <input data-fx="lightTrailLifetimeMs" type="range" min="200" max="3000" step="100">
      <label class="range-label">Core Brightness <input data-fx-value="lightTrailCoreBrightness" type="text" class="fx-value-input"></label>
      <input data-fx="lightTrailCoreBrightness" type="range" min="0" max="1" step="0.01">
      <label>Color Palette<select data-fx="palette"><option value="artwork">Artwork</option><option value="gold">Gold</option><option value="neon">Neon</option><option value="fire">🔥 Fire</option><option value="ice">❄️ Ice</option><option value="rainbow">🌈 Rainbow</option><option value="custom">🎨 Custom</option><option value="pitch-gradient">Pitch Gradient</option></select></label>
      <label class="range-label">Custom Color <input data-fx="customColor" type="color" value="#ff6600" style="width:40px;height:24px;border:0;background:transparent;cursor:pointer;"></label>
      <label>Path Style<select data-fx="pathStyle"><option value="sequential">Sequential ➡️</option><option value="random">Random 🎲</option><option value="spiral">Spiral 🌀</option><option value="reverse">Reverse ⬅️</option><option value="scattered">Scattered 💫</option></select></label>
      <label>Particle Motion<select data-fx="particleMotion"><option value="curved">Curved 🌊</option><option value="spiral">Spiral 🌀</option><option value="linear">Linear ➡️</option><option value="orbital">Orbital ⭕</option><option value="random-wobble">Wobble 🎭</option></select></label>
      <div class="control-row"><button type="button" data-fx-action="reset" class="ghost-button">Reset FX Settings</button><button type="button" data-fx-action="demo" class="ghost-button">Run Demo Scene</button></div>
      <div class="debug-grid"><span>Active particles</span><strong data-fx-stat="activeParticles">0</strong><span>Particle capacity</span><strong data-fx-stat="maxActiveParticles">0</strong><span>Active smoke</span><strong data-fx-stat="activeSmoke">0</strong><span>Smoke capacity</span><strong data-fx-stat="maxActiveSmoke">0</strong><span>Smoke layers</span><strong data-fx-stat="smokeLayerCount">3</strong><span>Emitted particles/frame</span><strong data-fx-stat="emittedParticles">0</strong><span>Emitted smoke/frame</span><strong data-fx-stat="emittedSmoke">0</strong><span>Particle budget/frame</span><strong data-fx-stat="particleFrameBudget">24</strong><span>Smoke budget/frame</span><strong data-fx-stat="smokeFrameBudget">12</strong><span>Estimated FPS</span><strong data-fx-stat="estimatedFps">60</strong><span>Dropped particles</span><strong data-fx-stat="droppedParticles">0</strong><span>Dropped smoke</span><strong data-fx-stat="droppedSmoke">0</strong><span>Dropped: pool capacity</span><strong data-fx-stat="droppedByPoolCapacity">0</strong><span>Dropped: frame budget</span><strong data-fx-stat="droppedByFrameBudget">0</strong><span>Dropped: invalid event</span><strong data-fx-stat="droppedByInvalidEvent">0</strong><span>Dropped: inactive state</span><strong data-fx-stat="droppedByInactiveState">0</strong><span>Last FX event</span><strong data-fx-stat="lastFxEvent">none</strong></div>`;

    const content = Array.from(inspector.children).filter((child) => child !== inspector.firstElementChild && child !== tabs);
    const setContentVisible = (visible: boolean) => {
      content.forEach((child) => { (child as HTMLElement).style.display = visible ? "" : "none"; });
      panel.hidden = !visible;
      fxTab.classList.toggle("inspector-tab-active", visible);
    };
    const syncControls = () => {
      panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-fx]").forEach((control) => {
        const key = control.dataset.fx as keyof VisualFxConfig;
        const value = fxSettings[key];
        if (control instanceof HTMLInputElement && control.type === "checkbox") control.checked = Boolean(value);
        else control.value = String(value);
      });
      panel.querySelectorAll<HTMLInputElement>("[data-fx-value]").forEach((input) => {
        const key = input.dataset.fxValue as keyof VisualFxConfig;
        const value = fxSettings[key];
        input.value = typeof value === "number" ? value.toFixed(2) : String(value);
      });
      const stats = fxStats ?? fxRef.current?.getStats();
      panel.querySelector('[data-fx-stat="activeParticles"]')!.textContent = String(stats?.activeParticles ?? 0);
      panel.querySelector('[data-fx-stat="maxActiveParticles"]')!.textContent = String(stats?.maxActiveParticles ?? 0);
      panel.querySelector('[data-fx-stat="activeSmoke"]')!.textContent = String(stats?.activeSmoke ?? 0);
      panel.querySelector('[data-fx-stat="maxActiveSmoke"]')!.textContent = String(stats?.maxActiveSmoke ?? 0);
      panel.querySelector('[data-fx-stat="smokeLayerCount"]')!.textContent = String(stats?.smokeLayerCount ?? 3);
      panel.querySelector('[data-fx-stat="emittedParticles"]')!.textContent = String(stats?.emittedParticles ?? 0);
      panel.querySelector('[data-fx-stat="emittedSmoke"]')!.textContent = String(stats?.emittedSmoke ?? 0);
      panel.querySelector('[data-fx-stat="particleFrameBudget"]')!.textContent = String(stats?.particleFrameBudget ?? 24);
      panel.querySelector('[data-fx-stat="smokeFrameBudget"]')!.textContent = String(stats?.smokeFrameBudget ?? 12);
      panel.querySelector('[data-fx-stat="estimatedFps"]')!.textContent = String(stats?.estimatedFps ?? 60);
      panel.querySelector('[data-fx-stat="droppedParticles"]')!.textContent = String(stats?.droppedParticles ?? 0);
      panel.querySelector('[data-fx-stat="droppedSmoke"]')!.textContent = String(stats?.droppedSmoke ?? 0);
      panel.querySelector('[data-fx-stat="droppedByPoolCapacity"]')!.textContent = String(stats?.droppedByPoolCapacity ?? 0);
      panel.querySelector('[data-fx-stat="droppedByFrameBudget"]')!.textContent = String(stats?.droppedByFrameBudget ?? 0);
      panel.querySelector('[data-fx-stat="droppedByInvalidEvent"]')!.textContent = String(stats?.droppedByInvalidEvent ?? 0);
      panel.querySelector('[data-fx-stat="droppedByInactiveState"]')!.textContent = String(stats?.droppedByInactiveState ?? 0);
      panel.querySelector('[data-fx-stat="lastFxEvent"]')!.textContent = String(stats?.lastFxEvent ?? "none");
    };
    const onInput = (event: Event) => {
      const control = event.target as HTMLInputElement | HTMLSelectElement;
      const key = control.dataset.fx as keyof VisualFxConfig | undefined;
      if (!key) return;
      const value = control instanceof HTMLInputElement && control.type === "checkbox" ? control.checked : control.value;
      setFxSettings((current) => ({ ...current, [key]: typeof current[key] === "number" ? Number(value) : value } as VisualFxConfig));
    };
    const onPanelClick = (event: Event) => {
      const action = (event.target as HTMLElement).dataset.fxAction;
      if (action === "reset") setFxSettings(DEFAULT_VISUAL_FX_CONFIG);
      if (action === "demo") {
        Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
          .find((button) => button.textContent?.includes("Puzzle Animation Preview"))
          ?.click();
        puzzleHost.current?.querySelector<HTMLElement>(".empty-reference")?.style.setProperty("display", "none");
        fxRef.current?.startDemo();
        setFxStats(fxRef.current?.getStats());
        window.setTimeout(() => puzzleHost.current?.querySelector<HTMLElement>(".empty-reference")?.style.setProperty("display", "none"), 0);
      }
    };
    const onTabsClick = (event: Event) => {
      if (event.target === fxTab) { event.preventDefault(); setContentVisible(true); }
      else if ((event.target as HTMLElement).closest("button") !== fxTab) setContentVisible(false);
    };
    fxTab.addEventListener("click", onTabsClick);
    tabs.addEventListener("click", onTabsClick);
    panel.addEventListener("input", onInput);
    panel.addEventListener("change", onInput);
    panel.addEventListener("click", onPanelClick);
    panel.addEventListener("wheel", (e) => {
      const target = e.target as HTMLInputElement;
      if (target.tagName === "INPUT" && target.type === "range") {
        e.preventDefault();
        const step = target.step ? parseFloat(target.step) : (parseFloat(target.max) - parseFloat(target.min)) / 100;
        const delta = e.deltaY < 0 ? step : -step;
        const newVal = Math.min(parseFloat(target.max), Math.max(parseFloat(target.min), parseFloat(target.value) + delta));
        target.value = String(newVal);
        target.dispatchEvent(new Event("input", { bubbles: true }));
        target.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }, { passive: false });
    // Text input sync: when user types a value in the fx-value-input, sync to the slider
    panel.addEventListener("keydown", (e) => {
      const target = e.target as HTMLInputElement;
      if (target.classList.contains("fx-value-input") && (e.key === "Enter" || e.key === "Tab")) {
        const key = target.dataset.fxValue as keyof VisualFxConfig | undefined;
        if (!key) return;
        const numVal = parseFloat(target.value);
        if (!isNaN(numVal)) {
          // Find the corresponding slider
          const slider = panel.querySelector(`input[type=range][data-fx="${key}"]`) as HTMLInputElement | null;
          if (slider) {
            const min = parseFloat(slider.min);
            const max = parseFloat(slider.max);
            const clamped = Math.min(max, Math.max(min, numVal));
            slider.value = String(clamped);
            slider.dispatchEvent(new Event("input", { bubbles: true }));
            slider.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
        target.blur();
      }
    });
    tabs.appendChild(fxTab);
    inspector.appendChild(panel);
    syncControls();
    return () => { fxTab.removeEventListener("click", onTabsClick); tabs.removeEventListener("click", onTabsClick); panel.removeEventListener("input", onInput); panel.removeEventListener("change", onInput); panel.removeEventListener("click", onPanelClick); fxTab.remove(); panel.remove(); };
  }, []);

  useEffect(() => {
    const panel = document.querySelector<HTMLElement>(".fx-dom-panel");
    if (!panel) return;
    if (!panel.querySelector("[data-fx-asset-gallery]")) {
      const gallery = fxRef.current?.createAssetGallery();
      if (gallery) panel.appendChild(gallery);
    }
    panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-fx]").forEach((control) => {
      const key = control.dataset.fx as keyof VisualFxConfig;
      const value = fxSettings[key];
      if (control instanceof HTMLInputElement && control.type === "checkbox") control.checked = Boolean(value);
      else control.value = String(value);
    });
    panel.querySelectorAll<HTMLInputElement>("[data-fx-value]").forEach((input) => {
      const key = input.dataset.fxValue as keyof VisualFxConfig;
      const value = fxSettings[key];
      input.value = typeof value === "number" ? value.toFixed(2) : String(value);
    });
    const stats = fxStats ?? fxRef.current?.getStats();
    panel.querySelector('[data-fx-stat="activeParticles"]')!.textContent = String(stats?.activeParticles ?? 0);
    panel.querySelector('[data-fx-stat="maxActiveParticles"]')!.textContent = String(stats?.maxActiveParticles ?? 0);
    panel.querySelector('[data-fx-stat="activeSmoke"]')!.textContent = String(stats?.activeSmoke ?? 0);
    panel.querySelector('[data-fx-stat="maxActiveSmoke"]')!.textContent = String(stats?.maxActiveSmoke ?? 0);
    panel.querySelector('[data-fx-stat="smokeLayerCount"]')!.textContent = String(stats?.smokeLayerCount ?? 3);
    panel.querySelector('[data-fx-stat="emittedParticles"]')!.textContent = String(stats?.emittedParticles ?? 0);
    panel.querySelector('[data-fx-stat="emittedSmoke"]')!.textContent = String(stats?.emittedSmoke ?? 0);
    panel.querySelector('[data-fx-stat="particleFrameBudget"]')!.textContent = String(stats?.particleFrameBudget ?? 24);
    panel.querySelector('[data-fx-stat="smokeFrameBudget"]')!.textContent = String(stats?.smokeFrameBudget ?? 12);
    panel.querySelector('[data-fx-stat="estimatedFps"]')!.textContent = String(stats?.estimatedFps ?? 60);
    panel.querySelector('[data-fx-stat="droppedParticles"]')!.textContent = String(stats?.droppedParticles ?? 0);
    panel.querySelector('[data-fx-stat="droppedSmoke"]')!.textContent = String(stats?.droppedSmoke ?? 0);
    panel.querySelector('[data-fx-stat="droppedByPoolCapacity"]')!.textContent = String(stats?.droppedByPoolCapacity ?? 0);
    panel.querySelector('[data-fx-stat="droppedByFrameBudget"]')!.textContent = String(stats?.droppedByFrameBudget ?? 0);
    panel.querySelector('[data-fx-stat="droppedByInvalidEvent"]')!.textContent = String(stats?.droppedByInvalidEvent ?? 0);
    panel.querySelector('[data-fx-stat="droppedByInactiveState"]')!.textContent = String(stats?.droppedByInactiveState ?? 0);
    panel.querySelector('[data-fx-stat="lastFxEvent"]')!.textContent = String(stats?.lastFxEvent ?? "none");
  }, [fxSettings, fxStats]);

  useEffect(() => {
    const card = Array.from(document.querySelectorAll<HTMLElement>(".asset-card"))
      .find((candidate) => candidate.textContent?.includes("Puzzle Artwork"));
    if (!card || document.querySelector("[data-artwork-placement-panel]")) return;

    const panel = document.createElement("div");
    panel.dataset.artworkPlacementPanel = "true";
    panel.className = "artwork-placement-dom";
    panel.innerHTML = `
      <div class="fx-dom-heading">Artwork Framing / کادر تصویر پازل</div>
      <label class="range-label">Zoom <output data-artwork-value="zoom"></output></label>
      <input data-artwork="zoom" type="range" min="0.5" max="3" step="0.05">
      <label class="range-label">Pan X <output data-artwork-value="panX"></output></label>
      <input data-artwork="panX" type="range" min="-640" max="640" step="1">
      <label class="range-label">Pan Y <output data-artwork-value="panY"></output></label>
      <input data-artwork="panY" type="range" min="-520" max="520" step="1">
      <div class="control-row">
        <label>Horizontal<select data-artwork="alignX"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
        <label>Vertical<select data-artwork="alignY"><option value="top">Top</option><option value="center">Center</option><option value="bottom">Bottom</option></select></label>
      </div>
      <canvas data-artwork-placement-preview class="density-preview artwork-placement-preview" width="248" height="166"></canvas>
      <small class="anchor-hint">Drag the preview to reposition the artwork. This framing is used by the generated puzzle pieces.</small>
      <button type="button" data-artwork-action="reset" class="ghost-button mapping-button">Reset Artwork Framing</button>`;
    card.appendChild(panel);

    const onInput = (event: Event) => {
      const control = event.target as HTMLInputElement | HTMLSelectElement;
      const key = control.dataset.artwork as keyof ArtworkPlacementConfig | undefined;
      if (!key || key === "alignX" || key === "alignY") return;
      setArtworkPlacement((current) => ({ ...current, [key]: Number(control.value) }));
    };
    const onChange = (event: Event) => {
      const control = event.target as HTMLInputElement | HTMLSelectElement;
      const key = control.dataset.artwork as keyof ArtworkPlacementConfig | undefined;
      if (key !== "alignX" && key !== "alignY") return;
      setArtworkPlacement((current) => ({ ...current, [key]: control.value as ArtworkPlacementConfig[typeof key] }));
    };
    const onClick = (event: Event) => {
      if ((event.target as HTMLElement).dataset.artworkAction === "reset") setArtworkPlacement(DEFAULT_ARTWORK_PLACEMENT);
    };
    const preview = panel.querySelector<HTMLCanvasElement>("[data-artwork-placement-preview]");
    let dragStart: { x: number; y: number; panX: number; panY: number } | undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!preview || !puzzleArtworkImageRef.current) return;
      dragStart = { x: event.clientX, y: event.clientY, panX: artworkPlacementRef.current.panX, panY: artworkPlacementRef.current.panY };
      preview.setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragStart || !preview) return;
      const region = DEFAULT_LAYOUT.puzzleRegion;
      const canvasScale = Math.min(preview.width / region.width, preview.height / region.height);
      setArtworkPlacement((current) => ({
        ...current,
        panX: dragStart!.panX + (event.clientX - dragStart!.x) / canvasScale,
        panY: dragStart!.panY + (event.clientY - dragStart!.y) / canvasScale
      }));
    };
    const onPointerUp = () => { dragStart = undefined; };
    preview?.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    panel.addEventListener("input", onInput);
    panel.addEventListener("change", onChange);
    panel.addEventListener("click", onClick);
    return () => {
      preview?.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      panel.removeEventListener("input", onInput);
      panel.removeEventListener("change", onChange);
      panel.removeEventListener("click", onClick);
      panel.remove();
    };
  }, []);

  useEffect(() => {
    const panel = document.querySelector<HTMLElement>("[data-artwork-placement-panel]");
    if (!panel) return;
    panel.style.display = puzzleArtwork ? "" : "none";
    panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-artwork]").forEach((control) => {
      const key = control.dataset.artwork as keyof ArtworkPlacementConfig;
      const value = artworkPlacement[key];
      control.value = String(value);
    });
    panel.querySelectorAll<HTMLOutputElement>("[data-artwork-value]").forEach((output) => {
      const key = output.dataset.artworkValue as keyof ArtworkPlacementConfig;
      const value = artworkPlacement[key];
      output.textContent = typeof value === "number" ? (key === "zoom" ? `${value.toFixed(2)}x` : `${Math.round(value)}`) : String(value);
    });
    const preview = panel.querySelector<HTMLCanvasElement>("[data-artwork-placement-preview]");
    const image = puzzleArtworkImageRef.current;
    if (preview && image) drawPlacementPreview(preview, image, DEFAULT_LAYOUT.puzzleRegion, artworkPlacement);
  }, [artworkPlacement, puzzleArtwork]);

  function applyImageTransform(explicitDims?: { width: number; height: number }) {
    const app = pixi.current;
    const width = explicitDims?.width ?? referenceFrameRef.current?.width;
    const height = explicitDims?.height ?? referenceFrameRef.current?.height;
    if (!app || !app.renderer || !width || !height) return;
    setViewSize((prev) => (prev.width === app.screen.width && prev.height === app.screen.height) ? prev : { width: app.screen.width, height: app.screen.height });
    const k = Math.min(app.screen.width / width, app.screen.height / height);
    const offsetX = (app.screen.width - width * k) / 2; const offsetY = (app.screen.height - height * k) / 2;
    transformRef.current = { k, offsetX, offsetY };
    if (spriteRef.current) { spriteRef.current.width = width * k; spriteRef.current.height = height * k; spriteRef.current.x = offsetX; spriteRef.current.y = offsetY; }
    redrawDebugMarkers(mappingRef.current);
  }

  function projectedGeometryFor(): GeometryResult | undefined {
    const geo = geometryRef.current; const artwork = puzzleArtworkImageRef.current;
    if (!geo || !artwork) return undefined;
    const placement = computeAlignedPlacement(artwork.naturalWidth, artwork.naturalHeight, DEFAULT_LAYOUT.puzzleRegion, artworkPlacementRef.current);
    return projectGeometry(geo, DEFAULT_LAYOUT.puzzleRegion, placement);
  }

  function projectedMappingFor(): MidiMappingResult | undefined {
    const mappingResult = mappingRef.current; if (!mappingResult) return undefined;
    const referenceImg = referenceFrameRef.current;
    const spawnPlacement = referenceImg?.width && referenceImg.height ? computeAlignedPlacement(referenceImg.width, referenceImg.height, DEFAULT_LAYOUT.pianoRegion, pianoPlacementRef.current) : { offsetX: 0, offsetY: 0, scale: 1 };
    return { ...mappingResult, events: projectSpawnPoints(mappingResult.events, DEFAULT_LAYOUT.pianoRegion, spawnPlacement) };
  }

  function rebuildPuzzleRenderer() {
    const renderer = rendererRef.current; if (!renderer) return;
    const { k } = puzzleTransformRef.current;
    const projected = projectedGeometryFor();
    if (!projected) { renderer.rebuild(EMPTY_GEOMETRY, k); return; }
    const artwork = puzzleArtworkImageRef.current!;
    const placement = computeAlignedPlacement(artwork.naturalWidth, artwork.naturalHeight, DEFAULT_LAYOUT.puzzleRegion, artworkPlacementRef.current);
    const absolutePlacement = toAbsolutePlacement(DEFAULT_LAYOUT.puzzleRegion, placement);
    renderer.rebuild(
      projected,
      k,
      artworkTextureRef.current,
      absolutePlacement,
      showPieceBordersRef.current,
      fxRef.current?.getDissolveNoiseTexture()
    );
  }

  function rebuildPianoBackground(k: number) {
    const layer = pianoBackgroundRef.current; if (!layer) return;
    layer.removeChildren();
    const region = DEFAULT_LAYOUT.pianoRegion;
    const refImage = referenceFrameImageRef.current;
    if (refImage) {
      const placement = computeAlignedPlacement(refImage.naturalWidth, refImage.naturalHeight, region, pianoPlacementRef.current);
      const absolutePlacement = toAbsolutePlacement(region, placement);
      const sprite = new Sprite(Texture.from(refImage));
      sprite.x = absolutePlacement.offsetX * k;
      sprite.y = absolutePlacement.offsetY * k;
      sprite.width = refImage.naturalWidth * absolutePlacement.scale * k;
      sprite.height = refImage.naturalHeight * absolutePlacement.scale * k;
      sprite.alpha = 0.5;
      layer.addChild(sprite);
    } else {
      const g = new Graphics();
      const whiteCount = 14; const keyW = region.width / whiteCount;
      for (let i = 0; i < whiteCount; i += 1) {
        g.rect((region.x + i * keyW) * k, region.y * k, (keyW - 1) * k, region.height * k).fill({ color: 0x1c2340, alpha: 0.5 }).stroke({ color: 0x39436f, width: 1, alpha: 0.6 });
      }
      for (let i = 0; i < whiteCount - 1; i += 1) {
        if (i % 7 === 2 || i % 7 === 6) continue;
        g.rect((region.x + (i + 1) * keyW - keyW * 0.28) * k, region.y * k, keyW * 0.56 * k, region.height * 0.6 * k).fill({ color: 0x0c0f1c, alpha: 0.7 });
      }
      layer.addChild(g);
    }
  }

  function applyPuzzleTransform() {
    const app = puzzlePixi.current; if (!app || !app.renderer) return;
    const k = Math.min(app.screen.width / DEFAULT_LAYOUT.compositionWidth, app.screen.height / DEFAULT_LAYOUT.compositionHeight);
    const offsetX = (app.screen.width - DEFAULT_LAYOUT.compositionWidth * k) / 2; const offsetY = (app.screen.height - DEFAULT_LAYOUT.compositionHeight * k) / 2;
    puzzleTransformRef.current = { k, offsetX, offsetY };
    if (pianoBackgroundRef.current) pianoBackgroundRef.current.position.set(offsetX, offsetY);
    if (rendererRef.current) rendererRef.current.layer.position.set(offsetX, offsetY);
    if (debugLayerRef.current) debugLayerRef.current.position.set(offsetX, offsetY);
    if (fxRef.current) {
      fxRef.current.layer.position.set(offsetX, offsetY);
      fxRef.current.layer.scale.set(k);
      fxRef.current.setKeyboardGlowSize(DEFAULT_LAYOUT.compositionWidth, DEFAULT_LAYOUT.compositionHeight, DEFAULT_LAYOUT.pianoRegion.y);
    }
    rebuildPianoBackground(k);
    rebuildPuzzleRenderer();
  }

  function tick() {
    const now = performance.now();
    const deltaSeconds = Math.min(0.05, Math.max(0, (now - lastFxTickTimeRef.current) / 1000));
    lastFxTickTimeRef.current = now;
    const frames = engineRef.current.evaluate(clockRef.current.currentTimeMs);
    framesRef.current = frames;
    rendererRef.current?.update(frames, puzzleTransformRef.current.k);
    if (debugLayerRef.current) { const visible = timingRef.current.debugVisible || expressionRef.current.debugVisible; debugLayerRef.current.visible = visible; if (visible) updateDebugOverlay(frames); }
    const currentTimeMs = clockRef.current.currentTimeMs;
    const previousAudioTimeMs = lastAudioTimeMsRef.current;
    if (mappingRef.current && currentTimeMs > previousAudioTimeMs) {
      const events = projectedMappingRef.current?.events ?? mappingRef.current.events;
      for (const event of events) {
        if ((event.startTimeMs > previousAudioTimeMs || (previousAudioTimeMs === 0 && event.startTimeMs === 0)) && event.startTimeMs <= currentTimeMs) {
          if (audioEnabledRef.current) audioRef.current.noteOn(event.midiNote, event.normalizedVelocity, event.durationMs);
          fxRef.current?.onNoteOn({
            id: event.id,
            midiNote: event.midiNote,
            velocity: event.velocity,
            normalizedVelocity: event.normalizedVelocity,
            position: event.spawnPoint ?? event.centerPoint ?? { x: 0, y: 0 },
            durationMs: event.durationMs,
            playbackTimeMs: event.startTimeMs
          });
        }
      }
    }
    const previousStates = previousFrameStateRef.current;
    for (const frame of frames) {
      const previousState = previousStates.get(frame.pieceId);
      if (frame.state === "moving" && previousState !== "moving") {
        fxRef.current?.onPieceLaunch({ pieceId: frame.pieceId, position: frame.currentPosition, targetPosition: frame.targetPosition, midiNote: frame.midiNote, intensity: frame.opacity, playbackTimeMs: currentTimeMs });
      }
      if (frame.state === "arrived" && previousState !== "arrived") {
        fxRef.current?.onPieceLock({ pieceId: frame.pieceId, position: frame.targetPosition, midiNote: frame.midiNote, intensity: frame.opacity, playbackTimeMs: currentTimeMs });
      }
      previousStates.set(frame.pieceId, frame.state);
    }
    fxRef.current?.update(deltaSeconds, currentTimeMs, frames as FxAnimationFrame[]);
    if (now - lastUiSync.current > 120) { lastUiSync.current = now; setFxStats(fxRef.current?.getStats()); }
    lastAudioTimeMsRef.current = currentTimeMs;
  }

  function updateDebugOverlay(frames: PieceAnimationFrame[]) {
    const layer = debugLayerRef.current; if (!layer) return;
    layer.removeChildren();
    const { k } = puzzleTransformRef.current;
    const expression = expressionResultRef.current;
    const showAnimationDebug = timingRef.current.debugVisible;
    const showExpressionDebug = expressionRef.current.debugVisible && Boolean(expression);
    for (const frame of frames) {
      if (frame.state === "cancelled") continue;
      if (showAnimationDebug) {
        const g = new Graphics();
        g.moveTo(frame.spawnPosition.x * k, frame.spawnPosition.y * k).lineTo(frame.targetPosition.x * k, frame.targetPosition.y * k).stroke({ color: 0x55d9ff, width: 1, alpha: 0.35 });
        g.circle(frame.spawnPosition.x * k, frame.spawnPosition.y * k, 3).fill({ color: 0xffc45c, alpha: 0.8 });
        g.circle(frame.targetPosition.x * k, frame.targetPosition.y * k, 3).fill({ color: 0x8ef0a3, alpha: 0.8 });
        g.circle(frame.currentPosition.x * k, frame.currentPosition.y * k, 4).fill({ color: 0xffffff, alpha: 0.9 });
        layer.addChild(g);
      }
      if (showExpressionDebug && (frame.state === "moving" || frame.state === "arrived")) {
        const note = expression?.noteExpressions.get(frame.assignmentId);
        if (note) {
          const chordLabel = note.chordId ? ` chord ${note.chordIndex + 1}/${note.chordSize}` : "";
          const sustainLabel = note.sustainActiveAtNoteOff ? " sus" : "";
          const text = new Text({ text: `${note.midiNote} v${Math.round(note.velocity)} dur${Math.round(note.effectiveDurationMs)}ms${sustainLabel}${chordLabel} e${note.energy.toFixed(2)} sc${note.motionProfile.scalePeak.toFixed(2)} hold${Math.round(note.motionProfile.arrivalHoldMs)}ms`, style: { fill: 0xffe08a, fontSize: 9 } });
          text.position.set(frame.currentPosition.x * k + 6, frame.currentPosition.y * k - 6);
          layer.addChild(text);
        }
      }
    }
  }

  useEffect(() => {
    const unsubscribe = clockRef.current.subscribe((timeMs, state) => {
      const now = performance.now();
      if (state !== "playing" || now - lastUiSync.current > 80) { lastUiSync.current = now; setClockState({ currentTimeMs: timeMs, state }); setDebugFrames(framesRef.current); }
    });
    return () => { unsubscribe(); clockRef.current.dispose(); };
  }, []);

  useEffect(() => {
    const projectedGeometryResult = projectedGeometryFor();
    if (mapping && projectedGeometryResult) {
      const expressionResult = expressionSettings.enabled && midi
        ? buildExpressionResult({ mappedEvents: mapping.events, assignments: mapping.assignments, chords: mapping.chords, sustainEvents: midi.sustainEvents, timelineDurationMs: midi.duration * 1000, settings: expressionSettings })
        : undefined;
      expressionResultRef.current = expressionResult;
      const projectedMapping = projectedMappingFor()!;
      projectedMappingRef.current = projectedMapping;
      const timeline = engineRef.current.rebuild({ mapping: projectedMapping, pieces: projectedGeometryResult.pieces, timing: timingSettings, expression: expressionResult });
      clockRef.current.setTotalDuration(timeline.totalDurationMs);
      setTimelineInfo({ count: timeline.animations.length, totalDurationMs: timeline.totalDurationMs });
    } else {
      expressionResultRef.current = undefined;
      projectedMappingRef.current = undefined;
      engineRef.current.timeline = { animations: [], totalDurationMs: 0 };
      clockRef.current.setTotalDuration(0);
      setTimelineInfo({ count: 0, totalDurationMs: 0 });
    }
    rebuildPuzzleRenderer();
    rebuildPianoBackground(puzzleTransformRef.current.k);
    const frames = engineRef.current.evaluate(clockRef.current.currentTimeMs);
    framesRef.current = frames;
    rendererRef.current?.update(frames, puzzleTransformRef.current.k);
    setDebugFrames(frames);
  }, [mapping, geometry, timingSettings, expressionSettings, midi, puzzleArtwork, referenceFrame, showPieceBorders, artworkPlacement]);

  useEffect(() => { if (previewTab === "puzzle") applyPuzzleTransform(); }, [previewTab]);

  useEffect(() => {
    if (!midi || geometry || !puzzleArtworkImageRef.current) return;
    const image = puzzleArtworkImageRef.current;
    setGeometryDensity(suggestDensity(geometryMode, image.naturalWidth, image.naturalHeight, midi.events.length));
  }, [midi]);

  useEffect(() => {
    const canvas = densityPreviewRef.current; const image = puzzleArtworkImageRef.current;
    if (!canvas || !image) { setPreviewPieceCount(0); return; }
    setPreviewPieceCount(drawDensityPreview(canvas, image, geometryMode, geometryDensity));
  }, [puzzleArtwork, geometryMode, geometryDensity]);

  useEffect(() => {
    const canvas = placementPreviewRef.current; const image = referenceFrameImageRef.current;
    if (!canvas || !image) return;
    drawPlacementPreview(canvas, image, DEFAULT_LAYOUT.pianoRegion, pianoPlacement);
  }, [referenceFrame, pianoPlacement]);

  useEffect(() => {
    if (!host.current) return;
    const app = new Application(); pixi.current = app; let disposed = false; let initialized = false;
    const onResize = () => applyImageTransform();
    void app.init({ background: "#111528", resizeTo: host.current, antialias: true }).then(() => {
      if (disposed) { app.destroy(true); return; }
      initialized = true;
      if (!host.current) return;
      host.current.appendChild(app.canvas);
      overlay.current = new Container(); app.stage.addChild(overlay.current);
      app.renderer.on("resize", onResize);
      applyImageTransform();
    });
    return () => { disposed = true; app.renderer?.off("resize", onResize); if (initialized) app.destroy(true); };
  }, []);

  useEffect(() => {
    if (!puzzleHost.current) return;
    const app = new Application(); puzzlePixi.current = app; let disposed = false; let initialized = false;
    const onResize = () => applyPuzzleTransform();
    void app.init({ background: "#0c0f1c", resizeTo: puzzleHost.current, antialias: true }).then(() => {
      if (disposed) { app.destroy(true); return; }
      initialized = true;
      if (!puzzleHost.current) return;
      puzzleHost.current.appendChild(app.canvas);
      const pianoBackground = new Container(); pianoBackgroundRef.current = pianoBackground; app.stage.addChild(pianoBackground);
      const renderer = new PuzzleRenderer(); rendererRef.current = renderer; app.stage.addChild(renderer.layer);
      const debugLayer = new Container(); debugLayer.visible = timingRef.current.debugVisible; debugLayerRef.current = debugLayer; app.stage.addChild(debugLayer);
      const fx = new VisualFxEngine(); fx.initialize(app.stage, fxSettings); fxRef.current = fx;
      app.renderer.on("resize", onResize);
      app.ticker.add(tick);
      applyPuzzleTransform();
    });
    return () => { disposed = true; app.renderer?.off("resize", onResize); app.ticker?.remove(tick); audioRef.current.stopAll(); fxRef.current?.dispose(); fxRef.current = null; previousFrameStateRef.current.clear(); if (initialized) app.destroy(true); };
  }, []);

  useEffect(() => { if (calibration && overlay.current && pixi.current) renderCalibration(overlay.current, calibration, pixi.current.screen.width, pixi.current.screen.height); }, [calibration]);

  function redrawDebugMarkers(result: MidiMappingResult | undefined) {
    if (!pixi.current) return;
    if (markersLayerRef.current) { markersLayerRef.current.destroy({ children: true }); markersLayerRef.current = null; }
    if (!result) return;
    const { k, offsetX, offsetY } = transformRef.current;
    const layer = new Container(); layer.position.set(offsetX, offsetY);
    result.events.filter((event) => event.spawnPoint).forEach((event) => { const p = event.spawnPoint!; layer.addChild(new Graphics().circle(p.x * k, p.y * k, 4).fill(event.state === "assigned" ? 0x8ef0a3 : event.state === "invalid" ? 0xff6b8a : 0xffc45c)); });
    pixi.current.stage.addChild(layer);
    markersLayerRef.current = layer;
  }
  async function acceptReferenceFrame(filePath: string, fileName: string, mimeType: string, dataUrl: string, fileSize: number) {
    const image = new Image(); image.onload = () => { referenceFrameImageRef.current = image; const a: Asset = { id: crypto.randomUUID(), type: "image", fileName, filePath, mimeType, fileSize, width: image.naturalWidth, height: image.naturalHeight, importedAt: new Date().toISOString(), status: "loaded", dataUrl, role: "reference-piano-frame" }; const c = createDefaultCalibration(image.naturalWidth, image.naturalHeight, keyboardType); setReferenceFrame(a); setCalibration(c); setReferenceStatus("loaded"); setMapping(undefined); setCalibZoom({ scale: 1, panX: 0, panY: 0 }); setPianoPlacement(DEFAULT_PIANO_PLACEMENT); if (pixi.current) { pixi.current.stage.removeChildren(); const sprite = new Sprite(Texture.from(image)); spriteRef.current = sprite; pixi.current.stage.addChild(sprite); overlay.current = new Container(); pixi.current.stage.addChild(overlay.current); applyImageTransform({ width: image.naturalWidth, height: image.naturalHeight }); } }; image.onerror = () => { setReferenceStatus("error"); setReferenceError("فایل تصویر معتبر نیست یا خراب است."); }; image.src = dataUrl;
  }
  async function importReferenceFrame() { setReferenceStatus("loading"); try { const file = await window.pianoPuzzle?.chooseAsset("image"); if (!file) { setReferenceStatus("empty"); return; } await acceptReferenceFrame(file.filePath, file.fileName, file.mimeType, `data:${file.mimeType};base64,${file.dataBase64}`, file.fileSize); } catch (caught) { setReferenceStatus("error"); setReferenceError(caught instanceof Error ? caught.message : "بارگذاری تصویر ناموفق بود."); } }
  function dropReferenceFrame(event: React.DragEvent<HTMLDivElement>) { event.preventDefault(); const file = event.dataTransfer.files[0]; if (!file || !file.type.startsWith("image/")) { setReferenceStatus("error"); setReferenceError("لطفاً یک فایل تصویری PNG/JPG انتخاب کنید."); return; } const reader = new FileReader(); reader.onload = () => void acceptReferenceFrame("", file.name, file.type, String(reader.result), file.size); reader.onerror = () => { setReferenceStatus("error"); setReferenceError("خواندن تصویر ناموفق بود."); }; setReferenceStatus("loading"); reader.readAsDataURL(file); }
  function removeReferenceFrame() { setReferenceFrame(undefined); setReferenceStatus("empty"); setReferenceError(""); setCalibration(undefined); setMapping(undefined); referenceFrameImageRef.current = undefined; setCalibZoom({ scale: 1, panX: 0, panY: 0 }); setPianoPlacement(DEFAULT_PIANO_PLACEMENT); if (pixi.current) { pixi.current.stage.removeChildren(); spriteRef.current = null; overlay.current = new Container(); pixi.current.stage.addChild(overlay.current); } }

  async function acceptPuzzleArtwork(filePath: string, fileName: string, mimeType: string, dataUrl: string, fileSize: number) {
    const image = new Image(); image.onload = () => { puzzleArtworkImageRef.current = image; artworkTextureRef.current = Texture.from(image); const a: Asset = { id: crypto.randomUUID(), type: "image", fileName, filePath, mimeType, fileSize, width: image.naturalWidth, height: image.naturalHeight, importedAt: new Date().toISOString(), status: "loaded", dataUrl, role: "puzzle-artwork" }; setPuzzleArtwork(a); setPuzzleArtworkStatus("loaded"); setGeometry(undefined); setMapping(undefined); }; image.onerror = () => { setPuzzleArtworkStatus("error"); setPuzzleArtworkError("فایل تصویر پازل معتبر نیست یا خراب است."); }; image.src = dataUrl;
  }
  async function importPuzzleArtwork() { setPuzzleArtworkStatus("loading"); try { const file = await window.pianoPuzzle?.chooseAsset("image"); if (!file) { setPuzzleArtworkStatus("empty"); return; } await acceptPuzzleArtwork(file.filePath, file.fileName, file.mimeType, `data:${file.mimeType};base64,${file.dataBase64}`, file.fileSize); } catch (caught) { setPuzzleArtworkStatus("error"); setPuzzleArtworkError(caught instanceof Error ? caught.message : "بارگذاری تصویر پازل ناموفق بود."); } }
  function dropPuzzleArtwork(event: React.DragEvent<HTMLDivElement>) { event.preventDefault(); const file = event.dataTransfer.files[0]; if (!file || !file.type.startsWith("image/")) { setPuzzleArtworkStatus("error"); setPuzzleArtworkError("لطفاً یک فایل تصویری PNG/JPG انتخاب کنید."); return; } const reader = new FileReader(); reader.onload = () => void acceptPuzzleArtwork("", file.name, file.type, String(reader.result), file.size); reader.onerror = () => { setPuzzleArtworkStatus("error"); setPuzzleArtworkError("خواندن تصویر پازل ناموفق بود."); }; setPuzzleArtworkStatus("loading"); reader.readAsDataURL(file); }
  function removePuzzleArtwork() { setPuzzleArtwork(undefined); setPuzzleArtworkStatus("empty"); setPuzzleArtworkError(""); puzzleArtworkImageRef.current = undefined; artworkTextureRef.current = undefined; setGeometry(undefined); setMapping(undefined); }
  function generatePieces() { const image = puzzleArtworkImageRef.current; if (!image) return; setGeometry(generateGeometry(image, geometryMode, geometryDensity)); setMapping(undefined); }

  function removeMidi() { setMidiAsset(undefined); setMidi(undefined); setMidiStatus("empty"); setMappingError(""); setMapping(undefined); }
  async function importMidi() { setMidiStatus("loading"); setMappingError(""); try { const file = await window.pianoPuzzle?.chooseAsset("midi"); if (!file) { setMidiStatus("empty"); return; } const bytes = Uint8Array.from(atob(file.dataBase64), (char) => char.charCodeAt(0)); const parsed = parseMidi(bytes.buffer, file.fileName, project.midiSettings.selectedTrackIndices, project.midiSettings.chordTolerance); setMidi(parsed); setMidiAsset({ id: crypto.randomUUID(), type: "midi", ...file, duration: parsed.duration, importedAt: new Date().toISOString(), status: "loaded", role: "midi" }); setMidiStatus("loaded"); setMapping(undefined); } catch (caught) { setMidiStatus("error"); setMappingError(caught instanceof Error ? caught.message : "بارگذاری MIDI ناموفق بود."); } }

  const valid = calibration ? calibrationIsValid(calibration) : false;
  const hasReferenceFrame = Boolean(referenceFrame);
  const hasValidCalibration = Boolean(calibration) && valid;
  const hasPuzzleArtwork = Boolean(puzzleArtwork);
  const hasGeneratedPieces = Boolean(geometry);
  const hasMidi = Boolean(midi);
  const canRunMapping = hasReferenceFrame && hasValidCalibration && hasPuzzleArtwork && hasGeneratedPieces && hasMidi;

  function runMappingHelperText(): string | undefined {
    if (!hasReferenceFrame) return "ابتدا تصویر مرجع پیانو را اضافه کنید.";
    if (!hasValidCalibration) return "Calibration معتبر لازم است (گوشه‌ها و نشانگرها را تنظیم کنید).";
    if (!hasPuzzleArtwork) return "ابتدا تصویر مستقل پازل را اضافه کنید.";
    if (!hasGeneratedPieces) return "ابتدا روی «Generate Puzzle Pieces» کلیک کنید.";
    if (!hasMidi) return "ابتدا فایل MIDI را اضافه کنید.";
    return undefined;
  }

  function runMapping() {
    if (!canRunMapping || !calibration || !midi) { setMappingError(runMappingHelperText() ?? "پیش‌نیازها کامل نیست."); return; }
    const config: MidiMappingConfig = { enabled: true, sourceAssetId: midiAsset?.id, calibrationId: calibration.id, mappingMode, outOfRangePolicy, chordWindowMs, showDebugMarkers: true, showAssignmentLines: false, sequenceCycle };
    const result = mapMidiToPuzzle(midi, calibration, geometry, config, midiAsset?.id);
    setMapping(result); setMappingError(""); redrawDebugMarkers(result);
  }
  function update(next: Calibration) { if (!calibration || calibration.cameraSettings.locked) return; setCalibration(updateAnchorDiagnostics(next)); }
  function zoomBy(delta: number) { setCalibZoom((prev) => { const scale = Math.max(1, Math.min(4, prev.scale + delta)); return scale === 1 ? { scale: 1, panX: 0, panY: 0 } : { ...prev, scale }; }); }
  function resetCalibZoom() { setCalibZoom({ scale: 1, panX: 0, panY: 0 }); }
  function handleCalibWheel(event: React.WheelEvent<HTMLDivElement>) { if (!calibration) return; event.preventDefault(); zoomBy(event.deltaY < 0 ? 0.15 : -0.15); }
  function startCalibPan(event: React.PointerEvent<HTMLDivElement>) {
    if (!calibration || calibZoomRef.current.scale <= 1) return;
    if ((event.target as HTMLElement).closest(".corner-handle,.anchor-handle,.manual-key-handle")) return;
    const startX = event.clientX, startY = event.clientY;
    const startPan = { x: calibZoomRef.current.panX, y: calibZoomRef.current.panY };
    const scale = calibZoomRef.current.scale;
    const move = (e: PointerEvent) => { setCalibZoom((prev) => ({ ...prev, panX: startPan.x + (e.clientX - startX) / scale, panY: startPan.y + (e.clientY - startY) / scale })); };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }
  function drag(corner: Corner, event: React.PointerEvent<HTMLDivElement>) {
    if (!calibration || calibration.cameraSettings.locked || !host.current) return;
    event.preventDefault(); event.stopPropagation();
    const rect = host.current.getBoundingClientRect();
    const move = (e: PointerEvent) => {
      const point = { x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)) };
      const transform = { ...calibration.transform, [corner]: point };
      const q = [transform.topLeft, transform.topRight, transform.bottomRight, transform.bottomLeft];
      if (!isValidQuadrilateral(q)) return;
      const next = { ...calibration, transform };
      const homography = computeCornerHomography(next);
      const anchorPoints = calibration.anchorPoints.map((anchor) => {
        if (anchor.placed) return anchor;
        const ref = anchorReferencePoint(anchor, calibration.keyMap);
        return ref ? { ...anchor, point: baseProject(next, ref, homography) } : anchor;
      });
      update({ ...next, homography, anchorPoints, updatedAt: new Date().toISOString() });
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }
  function dragAnchor(anchorId: string, event: React.PointerEvent<HTMLDivElement>) {
    if (!calibration || calibration.cameraSettings.locked || !host.current || !pixi.current) return;
    event.preventDefault(); event.stopPropagation();
    const rect = host.current.getBoundingClientRect();
    const projection = computeViewProjection(calibration, pixi.current.screen.width, pixi.current.screen.height);
    const move = (e: PointerEvent) => {
      const zoom = calibZoomRef.current.scale;
      const source = toSourcePoint({ x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom }, projection);
      const point = { x: Math.max(0, Math.min(calibration.sourceWidth, source.x)), y: Math.max(0, Math.min(calibration.sourceHeight, source.y)) };
      update({ ...calibration, anchorPoints: calibration.anchorPoints.map((a) => a.id === anchorId ? { ...a, point, placed: true } : a) });
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }
  function anchorHandles() {
    if (!calibration || !viewSize.width || !viewSize.height) return null;
    const projection = computeViewProjection(calibration, viewSize.width, viewSize.height);
    return calibration.anchorPoints.map((anchor) => {
      const p = toViewPoint(anchor.point, projection);
      return <div key={anchor.id} className={`anchor-handle ${anchor.placed ? "placed" : "unplaced"} ${calibration.cameraSettings.locked ? "locked" : ""}`} style={{ left: `${p.x}px`, top: `${p.y}px` }} title={anchorHints[anchor.kind] ?? anchor.label} onPointerDown={(e) => dragAnchor(anchor.id, e)}>{anchor.label}</div>;
    });
  }
  function whiteKeys(): PianoKey[] { return calibration?.keyMap.filter((key) => key.keyType === "white") ?? []; }
  function nextManualTarget(): PianoKey | undefined { return whiteKeys().find((key) => !calibration?.manualKeyPoints?.[key.midiNote]); }
  function placeManualPoint(midiNote: number, event: React.MouseEvent<HTMLDivElement>) {
    if (!calibration || calibration.cameraSettings.locked || !host.current || !pixi.current) return;
    if ((event.target as HTMLElement).closest(".corner-handle,.anchor-handle,.manual-key-handle")) return;
    const rect = host.current.getBoundingClientRect();
    const projection = computeViewProjection(calibration, pixi.current.screen.width, pixi.current.screen.height);
    const zoom = calibZoomRef.current.scale;
    const source = toSourcePoint({ x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom }, projection);
    const point = { x: Math.max(0, Math.min(calibration.sourceWidth, source.x)), y: Math.max(0, Math.min(calibration.sourceHeight, source.y)) };
    update({ ...calibration, manualKeyPoints: { ...calibration.manualKeyPoints, [midiNote]: point } });
  }
  function dragManualPoint(midiNote: number, event: React.PointerEvent<HTMLDivElement>) {
    if (!calibration || calibration.cameraSettings.locked || !host.current || !pixi.current) return;
    event.preventDefault(); event.stopPropagation();
    const rect = host.current.getBoundingClientRect();
    const projection = computeViewProjection(calibration, pixi.current.screen.width, pixi.current.screen.height);
    const move = (e: PointerEvent) => {
      const zoom = calibZoomRef.current.scale;
      const source = toSourcePoint({ x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom }, projection);
      const point = { x: Math.max(0, Math.min(calibration.sourceWidth, source.x)), y: Math.max(0, Math.min(calibration.sourceHeight, source.y)) };
      update({ ...calibration, manualKeyPoints: { ...calibration.manualKeyPoints, [midiNote]: point } });
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }
  function undoManualPoint() {
    if (!calibration) return;
    const target = nextManualTarget();
    const previous = [...whiteKeys()].reverse().find((key) => calibration.manualKeyPoints?.[key.midiNote] && key.midiNote < (target?.midiNote ?? Infinity));
    if (!previous) return;
    const manualKeyPoints = { ...calibration.manualKeyPoints }; delete manualKeyPoints[previous.midiNote];
    update({ ...calibration, manualKeyPoints });
  }
  function clearManualPoints() { if (calibration) update({ ...calibration, manualKeyPoints: {} }); }
  function manualKeyMarkers() {
    if (!calibration || !viewSize.width || !viewSize.height || !calibration.manualKeyPoints) return null;
    const projection = computeViewProjection(calibration, viewSize.width, viewSize.height);
    return whiteKeys().filter((key) => calibration.manualKeyPoints?.[key.midiNote]).map((key) => {
      const p = toViewPoint(calibration.manualKeyPoints![key.midiNote], projection);
      return <div key={key.midiNote} className={`manual-key-handle ${calibration.cameraSettings.locked ? "locked" : ""}`} style={{ left: `${p.x}px`, top: `${p.y}px` }} title={key.noteName} onPointerDown={(e) => dragManualPoint(key.midiNote, e)}>{key.noteName}</div>;
    });
  }
  function updatePianoPlacement(patch: Partial<PianoPlacementConfig>) { setPianoPlacement((prev) => ({ ...prev, ...patch })); }
  function startPlacementPan(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = placementPreviewRef.current; if (!canvas || !referenceFrameImageRef.current) return;
    const region = DEFAULT_LAYOUT.pianoRegion;
    const canvasScale = Math.min(canvas.width / region.width, canvas.height / region.height);
    const startX = event.clientX, startY = event.clientY;
    const startPan = { x: pianoPlacementRef.current.panX, y: pianoPlacementRef.current.panY };
    const move = (e: PointerEvent) => { updatePianoPlacement({ panX: startPan.x + (e.clientX - startX) / canvasScale, panY: startPan.y + (e.clientY - startY) / canvasScale }); };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }
  function save() { if (!calibration) return; const saved = saveCalibrationWithTimestamp(calibration); setCalibration(saved); setSavedAt(saved.updatedAt); }
  function load() { const item = loadCalibrations().find((c) => c.keyboardType === keyboardType); if (item) { const migrated = migrateCalibration(item); setCalibration(migrated); setSavedAt(migrated.updatedAt); } else if (referenceFrame?.width && referenceFrame.height) { setCalibration(createDefaultCalibration(referenceFrame.width, referenceFrame.height, keyboardType)); setMapping(undefined); } }
  function reset() { if (referenceFrame?.width && referenceFrame.height) { setCalibration(createDefaultCalibration(referenceFrame.width, referenceFrame.height, keyboardType)); setMapping(undefined); } }
  function changeKeyboardType(type: KeyboardType) {
    setKeyboardType(type);
    if (!referenceFrame?.width || !referenceFrame.height) return;
    const item = loadCalibrations().find((c) => c.keyboardType === type);
    if (item) { const migrated = migrateCalibration(item); setCalibration(migrated); setSavedAt(migrated.updatedAt); } else { setCalibration(createDefaultCalibration(referenceFrame.width, referenceFrame.height, type)); setSavedAt(""); }
    setMapping(undefined);
  }
  function exportOverlay(kind: "svg" | "png") { if (!calibration) return; const svg = createOverlaySvg(calibration); if (kind === "svg") { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })); a.download = "keyboard-overlay.svg"; a.click(); return; } const image = new Image(); image.onload = () => { const canvas = document.createElement("canvas"); canvas.width = calibration.sourceWidth; canvas.height = calibration.sourceHeight; canvas.getContext("2d")?.drawImage(image, 0, 0); canvas.toBlob((blob) => { if (blob) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "keyboard-overlay.png"; a.click(); } }, "image/png"); }; image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; }
  function togglePlay() {
    if (clockRef.current.clockState === "playing") {
      clockRef.current.pause();
      fxRef.current?.onPause();
    } else {
      audioRef.current.resume();
      clockRef.current.play();
      fxRef.current?.onResume();
    }
  }
  function seek(ms: number) {
    lastAudioTimeMsRef.current = ms;
    previousFrameStateRef.current.clear();
    fxRef.current?.onSeek();
    clockRef.current.seek(ms);
  }
  function stopPlayback() {
    lastAudioTimeMsRef.current = 0;
    previousFrameStateRef.current.clear();
    audioRef.current.stopAll();
    fxRef.current?.reset();
    clockRef.current.stop();
  }
  function resetPlayback() {
    lastAudioTimeMsRef.current = 0;
    previousFrameStateRef.current.clear();
    audioRef.current.stopAll();
    fxRef.current?.reset();
    clockRef.current.reset();
  }
  function setSpeed(speed: number) { clockRef.current.setSpeed(speed); setTimingSettings((prev) => ({ ...prev, animationSpeed: speed })); }
  function updateVelocitySettings(patch: Partial<ExpressionSettings["velocity"]>) { setExpressionSettings((prev) => ({ ...prev, velocity: { ...prev.velocity, ...patch } })); }
  function updateDurationSettings(patch: Partial<ExpressionSettings["duration"]>) { setExpressionSettings((prev) => ({ ...prev, duration: { ...prev.duration, ...patch } })); }
  function updateSustainSettings(patch: Partial<ExpressionSettings["sustain"]>) { setExpressionSettings((prev) => ({ ...prev, sustain: { ...prev.sustain, ...patch } })); }
  function updateChordSettings(patch: Partial<ExpressionSettings["chord"]>) { setExpressionSettings((prev) => ({ ...prev, chord: { ...prev.chord, ...patch } })); }
  const animationReady = Boolean(mapping && geometry && calibration && valid && timelineInfo.count > 0);

  function assetCard(label: string, hint: string, asset: Asset | undefined, thumbUrl: string | undefined, onImport: () => void, onDrop: ((e: React.DragEvent<HTMLDivElement>) => void) | undefined, onRemove: () => void, errorText: string) {
    return <div className={`asset-card ${asset ? "asset-card-loaded" : ""}`} onDragOver={onDrop ? (e) => e.preventDefault() : undefined} onDrop={onDrop}>
      <div className="asset-card-status">{asset ? "✓ بارگذاری شد" : "— بارگذاری نشده"}</div>
      <strong>{label}</strong>
      <small>{hint}</small>
      {thumbUrl && <img className="asset-card-thumb" src={thumbUrl} alt={label} />}
      {asset && <small>{asset.fileName}{asset.width ? ` · ${asset.width}×${asset.height}` : ""}</small>}
      {errorText && <p className="error-message">{errorText}</p>}
      <div className="control-row">
        <button className="ghost-button" onClick={onImport}>{asset ? "جایگزینی (Replace)" : "افزودن (Add)"}</button>
        {asset && <button className="ghost-button" onClick={onRemove}>حذف (Remove)</button>}
      </div>
    </div>;
  }

  const workflowSteps = [
    { label: "۱. تصویر مرجع پیانو (Reference Frame)", done: hasReferenceFrame },
    { label: "۲. کالیبراسیون (Calibration)", done: hasValidCalibration },
    { label: "۳. تصویر پازل (Puzzle Artwork)", done: hasPuzzleArtwork },
    { label: "۴. ساخت قطعات (Generate Pieces)", done: hasGeneratedPieces },
    { label: "۵. فایل MIDI", done: hasMidi },
    { label: "۶. اجرای نگاشت (Run Mapping)", done: Boolean(mapping) }
  ];

  const totalPieces = geometry?.pieces.length ?? 0;
  const revealedUnique = new Set(mapping?.assignments.map((a) => a.pieceId) ?? []).size;
  const totalNoteEvents = mapping?.events.length ?? 0;
  const unassignedNotes = mapping?.events.filter((e) => e.assignedPieceIds.length === 0).length ?? 0;
  const reuseRatio = revealedUnique > 0 ? totalNoteEvents / revealedUnique : 0;

  return <main className="studio-shell"><header className="topbar"><div><span className="eyebrow">PHASE 6.5 · PUZZLE ARTWORK PIPELINE (فاز ۶.۵ · خط لوله تصویر پازل)</span><h1>Piano Puzzle Studio (استودیو پازل پیانو)</h1></div><div className="topbar-actions"><button className="ghost-button" onClick={() => setShowHelp(true)}>؟ Help (راهنما)</button><span className="status-dot" /> Mapping Preview (پیش‌نمایش نگاشت)</div></header><section className="workspace"><aside className="sidebar panel"><h2>Inputs (ورودی‌ها)</h2><div className="workflow-stepper">{workflowSteps.map((s, i) => <div key={i} className={`step ${s.done ? "step-done" : ""}`}>{s.label}</div>)}</div>{assetCard("Reference Piano Frame (تصویر مرجع پیانو)", "برای کالیبراسیون کیبورد — فقط عکس پیانو", referenceFrame, referenceFrame?.dataUrl, () => void importReferenceFrame(), dropReferenceFrame, removeReferenceFrame, referenceStatus === "error" ? referenceError : "")}{hasReferenceFrame && <div className="asset-block"><h3 className="subheading">Piano Placement in Frame (موقعیت پیانو در کادر)</h3><div className="control-row"><label>Horizontal (افقی)<select value={pianoPlacement.alignX} onChange={(e) => updatePianoPlacement({ alignX: e.target.value as PlacementAlignX })}><option value="left">left (چپ)</option><option value="center">center (وسط)</option><option value="right">right (راست)</option></select></label><label>Vertical (عمودی)<select value={pianoPlacement.alignY} onChange={(e) => updatePianoPlacement({ alignY: e.target.value as PlacementAlignY })}><option value="top">top (بالا)</option><option value="center">center (وسط)</option><option value="bottom">bottom (پایین)</option></select></label></div><label className="range-label">Zoom (بزرگ‌نمایی) <output>{pianoPlacement.zoom.toFixed(2)}x</output></label><input type="range" min={1} max={2.5} step={0.05} value={pianoPlacement.zoom} onChange={(e) => updatePianoPlacement({ zoom: Number(e.target.value) })} /><canvas ref={placementPreviewRef} className="density-preview placement-preview" width={232} height={206} onPointerDown={startPlacementPan} /><small className="anchor-hint">Drag the preview to pan — this position is exactly what Play mode will show. (پیش‌نمایش را بکش تا جابه‌جا شود؛ همین موقعیت دقیقاً در حالت اجرا نمایش داده می‌شود.)</small></div>}{assetCard("Puzzle Artwork (تصویر مستقل پازل)", "تصویری که پازل می‌شود — مستقل از عکس پیانو", puzzleArtwork, puzzleArtwork?.dataUrl, () => void importPuzzleArtwork(), dropPuzzleArtwork, removePuzzleArtwork, puzzleArtworkStatus === "error" ? puzzleArtworkError : "")}{assetCard("MIDI File (فایل MIDI)", "نت‌ها و زمان‌بندی قطعه", midiAsset, undefined, () => void importMidi(), undefined, removeMidi, midiStatus === "error" ? mappingError : "")}<div className="section-divider" /><h3 className="subheading">Puzzle Geometry (هندسه‌ی پازل)</h3><select value={geometryMode} onChange={(e) => setGeometryMode(e.target.value as GeometryMode)}>{geometryModes.map((m) => <option key={m} value={m}>{geometryModeLabels[m]}</option>)}</select><label className="range-label">Density (تراکم) <output>{geometryDensity}</output></label><input type="range" min={4} max={20} value={geometryDensity} onChange={(e) => setGeometryDensity(Number(e.target.value))} /><div className="control-row"><button className="ghost-button" disabled={!hasPuzzleArtwork || !hasMidi} onClick={() => { const image = puzzleArtworkImageRef.current; if (image && midi) setGeometryDensity(suggestDensity(geometryMode, image.naturalWidth, image.naturalHeight, midi.events.length)); }}>🎯 Suggest from MIDI (پیشنهاد بر اساس MIDI)</button></div><canvas ref={densityPreviewRef} className="density-preview" width={232} height={150} />{hasPuzzleArtwork ? <small className="anchor-hint">این تراکم {previewPieceCount} تکه می‌سازد{hasMidi ? ` — آهنگ ${midi?.events.length ?? 0} نت دارد` : ""}</small> : <small className="anchor-hint">ابتدا تصویر پازل را اضافه کنید تا پیش‌نمایش تراکم دیده شود.</small>}<label className="toggle-row"><span>Show piece borders (نمایش مرز قطعات)</span><input type="checkbox" checked={showPieceBorders} onChange={(e) => setShowPieceBorders(e.target.checked)} /></label><button className="primary-button mapping-button" disabled={!hasPuzzleArtwork} onClick={generatePieces}>Generate Puzzle Pieces (ساخت قطعات پازل)</button>{!hasPuzzleArtwork && <small className="anchor-hint">ابتدا تصویر پازل را اضافه کنید.</small>}{geometry && <small className="anchor-hint success-text">{geometry.pieces.length} pieces generated (قطعه ساخته شد)</small>}<div className="section-divider" /><h3>Calibration (کالیبراسیون)</h3><select value={keyboardType} onChange={(e) => changeKeyboardType(e.target.value as KeyboardType)}>{keyboardTypes.map((t) => <option key={t} value={t}>{keyboardTypeLabels[t]}</option>)}</select><select disabled={!calibration} value={calibration?.viewType ?? "top"} onChange={(e) => calibration && setCalibration(viewTransform(e.target.value as ViewType, calibration))}>{views.map((v) => <option key={v} value={v}>{viewLabels[v]}</option>)}</select><button className={`ghost-button mapping-button ${manualModeActive ? "active" : ""}`} disabled={!calibration} onClick={() => setManualModeActive((v) => !v)}>{manualModeActive ? "✕ Exit manual placement (خروج از نقطه‌گذاری دستی)" : "◎ Manual key placement (نقطه‌گذاری دستی کلیدها)"}</button>{manualModeActive && <div className="geometry-buttons"><button onClick={undoManualPoint}>⏮ Undo (برگشت)</button><button onClick={clearManualPoints}>🗑 Clear all (پاک‌کردن همه)</button></div>}<h3 className="subheading">Mapping Mode (حالت نگاشت)</h3><select value={mappingMode} onChange={(e) => setMappingMode(e.target.value as typeof mappingMode)}><option value="nearest-centroid">Nearest centroid (نزدیک‌ترین مرکز)</option><option value="one-note-one-piece">One note / one piece (یک نت = یک قطعه)</option><option value="target-region">Target region (ناحیه‌ی هدف)</option><option value="deterministic-sequence">Deterministic sequence (ترتیب قطعی)</option></select>{mappingMode === "deterministic-sequence" && <label className="toggle-row"><span>Cycle when exhausted (چرخش پس از اتمام قطعات)</span><input type="checkbox" checked={sequenceCycle} onChange={(e) => setSequenceCycle(e.target.checked)} /></label>}<label className="range-label">Chord window (پنجره‌ی آکورد) <output>{chordWindowMs} ms</output></label><input type="range" min="30" max="60" value={chordWindowMs} onChange={(e) => setChordWindowMs(Number(e.target.value))} /><select value={outOfRangePolicy} onChange={(e) => setOutOfRangePolicy(e.target.value as typeof outOfRangePolicy)}><option value="mark-invalid">Mark invalid (نامعتبر علامت بزن)</option><option value="ignore">Ignore (نادیده بگیر)</option><option value="clamp">Clamp (محدود کن)</option></select><button className="primary-button mapping-button" disabled={!canRunMapping} onClick={runMapping}>Run Mapping (اجرای نگاشت)</button>{runMappingHelperText() && <small className="anchor-hint">{runMappingHelperText()}</small>}</aside><section className="preview panel"><div className="panel-heading"><div><span className="eyebrow">{previewTab === "calibration" ? "CALIBRATION + MAPPING (کالیبراسیون + نگاشت)" : "PUZZLE ANIMATION PREVIEW (پیش‌نمایش انیمیشن پازل)"}</span><h2>{previewTab === "calibration" ? "Projected spawn points (نقاط شروع تصویرشده)" : "Puzzle assembly preview (پیش‌نمایش تجمیع پازل)"}</h2></div><span className={`chip ${valid ? "chip-valid" : ""}`}>{mapping ? `${mapping.events.length} events (رویداد)` : "No mapping (بدون نگاشت)"}</span></div><div className="preview-tabs"><button className={`preview-tab ${previewTab === "calibration" ? "preview-tab-active" : ""}`} onClick={() => setPreviewTab("calibration")}>Piano Calibration (کالیبراسیون پیانو)</button><button className={`preview-tab ${previewTab === "puzzle" ? "preview-tab-active" : ""}`} onClick={() => setPreviewTab("puzzle")}>Puzzle Animation Preview (پیش‌نمایش انیمیشن پازل)</button></div>{previewTab === "calibration" && <div className="control-row"><button className="ghost-button" disabled={!calibration} onClick={() => zoomBy(-0.25)}>🔍− Zoom out (کوچک‌نمایی)</button><span className="chip">{Math.round(calibZoom.scale * 100)}%</span><button className="ghost-button" disabled={!calibration} onClick={() => zoomBy(0.25)}>🔍+ Zoom in (بزرگ‌نمایی)</button><button className="ghost-button" disabled={!calibration || calibZoom.scale === 1} onClick={resetCalibZoom}>Reset zoom (بازنشانی زوم)</button></div>}<div className="canvas-frame" ref={host} style={previewTab === "calibration" ? { transform: `scale(${calibZoom.scale}) translate(${calibZoom.panX}px, ${calibZoom.panY}px)`, transformOrigin: "center center" } : { display: "none" }} onWheel={handleCalibWheel} onPointerDown={startCalibPan} onClick={(e) => { if (manualModeActive) { const target = nextManualTarget(); if (target) placeManualPoint(target.midiNote, e); } }}>{!referenceFrame && <div className="empty-reference"><span>＋</span><strong>No reference loaded (تصویری بارگذاری نشده)</strong><small>Add a piano image via the Reference Piano Frame card. (یک تصویر پیانو از کارت «تصویر مرجع پیانو» اضافه کن.)</small></div>}{calibration && corners.map((corner) => <div key={corner} className={`corner-handle ${calibration.cameraSettings.locked ? "locked" : ""}`} style={{ left: `${calibration.transform[corner].x * 100}%`, top: `${calibration.transform[corner].y * 100}%` }} onPointerDown={(e) => drag(corner, e)}>{corner}</div>)}{anchorHandles()}{manualKeyMarkers()}{manualModeActive && <div className="manual-prompt">{nextManualTarget() ? `Click the front tip of ${nextManualTarget()!.noteName} (نوک جلوی کلید ${nextManualTarget()!.noteName} را کلیک کن) — ${whiteKeys().filter((k) => calibration?.manualKeyPoints?.[k.midiNote]).length}/${whiteKeys().length}` : "All white keys placed ✓ (همه‌ی کلیدهای سفید ثبت شدند)"}</div>}</div><div className="canvas-frame" ref={puzzleHost} style={previewTab === "puzzle" ? undefined : { display: "none" }}>{!hasPuzzleArtwork && <div className="empty-reference"><span>🧩</span><strong>تصویر پازل بارگذاری نشده (No puzzle artwork loaded)</strong><small>یک تصویر مستقل برای پازل از کارت «Puzzle Artwork» اضافه کن.</small></div>}{hasPuzzleArtwork && !hasGeneratedPieces && <div className="empty-reference"><span>🧩</span><strong>قطعات پازل ساخته نشده (No pieces generated)</strong><small>روی «Generate Puzzle Pieces» کلیک کن.</small></div>}</div>{previewTab === "puzzle" && <div className="transport"><button className="primary-button" disabled={!animationReady} onClick={togglePlay}>{clockState.state === "playing" ? "Pause (توقف موقت)" : "Play (پخش)"}</button><button className="ghost-button" disabled={!animationReady} onClick={stopPlayback}>Stop (توقف)</button><button className="ghost-button" disabled={!animationReady} onClick={resetPlayback}>Reset (بازنشانی)</button><input type="range" min={0} max={timelineInfo.totalDurationMs} step={10} value={Math.min(clockState.currentTimeMs, timelineInfo.totalDurationMs)} disabled={!animationReady} onChange={(e) => seek(Number(e.target.value))} /><span className="timecode">{formatTime(clockState.currentTimeMs)} / {formatTime(timelineInfo.totalDurationMs)}</span><span className="chip">{timelineInfo.count} piece(s) scheduled (قطعه زمان‌بندی‌شده)</span></div>}{previewTab === "puzzle" && !animationReady && <p className="muted">{!hasPuzzleArtwork ? "ابتدا تصویر پازل را اضافه کن." : !hasGeneratedPieces ? "ابتدا قطعات پازل را بساز." : !mapping ? "برای شروع انیمیشن، ابتدا MIDI را map کنید." : (!calibration || !valid) ? "Calibration معتبر لازم است." : "قطعه‌ای برای انیمیشن یافت نشد."}</p>}{previewTab === "calibration" && calibration && <small className="anchor-hint">Drag the 7 labeled markers onto their real keys — start with the edges, then C4. (نشانگرها را روی کلید واقعی در عکس بکش؛ اول لبه‌ها، بعد C4.)</small>}{previewTab === "calibration" && <div className="transport"><button className="primary-button" disabled={!valid} onClick={save}>Save Calibration (ذخیره‌ی کالیبراسیون)</button><button className="ghost-button" onClick={load}>Load (بارگذاری)</button><button className="ghost-button" onClick={reset}>Reset (بازنشانی)</button><button className="ghost-button" disabled={!calibration} onClick={() => exportOverlay("svg")}>SVG</button><button className="ghost-button" disabled={!calibration} onClick={() => exportOverlay("png")}>PNG</button></div>}</section><aside className="inspector panel"><div className="panel-heading"><div><span className="eyebrow">{inspectorTab === "mapping" ? "MAPPING DEBUG (اشکال‌زدایی نگاشت)" : inspectorTab === "playback" ? "PHASE 6 · ANIMATION (فاز ۶ · انیمیشن)" : "PHASE 7 · MUSICAL EXPRESSION (فاز ۷ · بیان موسیقایی)"}</span><h2>{inspectorTab === "mapping" ? "Events & Pieces (رویدادها و قطعات)" : inspectorTab === "playback" ? "Playback settings (تنظیمات پخش)" : "Musical Expression (بیان موسیقایی)"}</h2></div></div><div className="inspector-tabs"><button className={`inspector-tab ${inspectorTab === "mapping" ? "inspector-tab-active" : ""}`} onClick={() => setInspectorTab("mapping")}>Mapping Debug (اشکال‌زدایی)</button><button className={`inspector-tab ${inspectorTab === "playback" ? "inspector-tab-active" : ""}`} onClick={() => setInspectorTab("playback")}>Playback (پخش)</button><button className={`inspector-tab ${inspectorTab === "expression" ? "inspector-tab-active" : ""}`} onClick={() => setInspectorTab("expression")}>Expression (بیان)</button></div>{inspectorTab === "mapping" && (mapping ? <><div className="debug-grid"><span>Mapped (نگاشت‌شده)</span><strong>{mapping.events.filter((e) => e.state === "mapped" || e.state === "assigned").length}</strong><span>Invalid (نامعتبر)</span><strong>{mapping.events.filter((e) => e.state === "invalid").length}</strong><span>Assignments (انتساب‌ها)</span><strong>{mapping.assignments.length}</strong><span>Chords (آکوردها)</span><strong>{mapping.chords.length}</strong><span>Mode (حالت)</span><strong>{mapping.config.mappingMode}</strong><span>Total pieces (کل قطعات)</span><strong>{totalPieces}</strong><span>Revealed unique pieces (قطعات یکتای آشکارشده)</span><strong>{revealedUnique}</strong><span>Total note events (کل رویدادهای نت)</span><strong>{totalNoteEvents}</strong><span>Reuse ratio (نسبت استفاده‌ی مجدد)</span><strong>{reuseRatio.toFixed(2)}x</strong><span>Unassigned notes (نت‌های بدون قطعه)</span><strong>{unassignedNotes}</strong></div><div className="event-list">{mapping.events.slice(0, 30).map((event) => <div className="event-row mapping-row" key={event.id}><span>{event.noteName}</span><span>{event.state}</span><span>{event.assignedPieceIds[0] ?? "—"}</span></div>)}</div></> : <div className="empty-debug">Load MIDI and calibration, then run mapping. (فایل MIDI و کالیبراسیون را بارگذاری کن، سپس نگاشت را اجرا کن.)</div>)}{inspectorTab === "playback" && <><div className="control-row"><label>Speed (سرعت)<select value={timingSettings.animationSpeed} onChange={(e) => setSpeed(Number(e.target.value))}><option value={0.25}>0.25x</option><option value={0.5}>0.5x</option><option value={1}>1x</option><option value={2}>2x</option></select></label><label>Easing (نرمی حرکت)<select value={timingSettings.easing} onChange={(e) => setTimingSettings((prev) => ({ ...prev, easing: e.target.value as EasingName }))}><option value="linear">linear (خطی)</option><option value="easeIn">easeIn (شروع نرم)</option><option value="easeOut">easeOut (پایان نرم)</option><option value="easeInOut">easeInOut (شروع/پایان نرم)</option></select></label><label className="toggle-row"><span>Show Animation Debug (نمایش اشکال‌زدایی)</span><input type="checkbox" checked={timingSettings.debugVisible} onChange={(e) => setTimingSettings((prev) => ({ ...prev, debugVisible: e.target.checked }))} /></label><label className="toggle-row"><span>Play piano sound (پخش صدای پیانو)</span><input type="checkbox" checked={audioEnabled} onChange={(e) => setAudioEnabled(e.target.checked)} /></label></div><label className="range-label">Base travel duration (مدت پایه‌ی حرکت) <output>{timingSettings.baseTravelDurationMs} ms</output></label><input type="range" min={150} max={1500} step={10} value={timingSettings.baseTravelDurationMs} onChange={(e) => setTimingSettings((prev) => ({ ...prev, baseTravelDurationMs: Number(e.target.value) }))} />{timingSettings.debugVisible && debugFrames.length > 0 && <div className="event-list">{debugFrames.slice(0, 30).map((frame) => <div className="event-row mapping-row" key={frame.id}><span>{frame.pieceId}</span><span>{frame.state}</span><span>{Math.round(frame.progress * 100)}%</span></div>)}</div>}</>}{inspectorTab === "expression" && <><div className="control-row"><label className="toggle-row"><span>Enable Musical Expression (فعال‌سازی بیان موسیقایی)</span><input type="checkbox" checked={expressionSettings.enabled} onChange={(e) => setExpressionSettings((prev) => ({ ...prev, enabled: e.target.checked }))} /></label><span className="chip">{expressionSettings.enabled ? "Enabled (فعال)" : "Disabled (غیرفعال)"}</span><button className="ghost-button" onClick={() => setExpressionSettings(DEFAULT_EXPRESSION_SETTINGS)}>Reset (بازنشانی)</button></div><h3 className="subheading">Velocity (سرعت ضربه)</h3><label className="range-label">Influence (میزان تأثیر) <output>{expressionSettings.velocity.influence.toFixed(2)}</output></label><input type="range" min={0} max={1} step={0.05} value={expressionSettings.velocity.influence} onChange={(e) => updateVelocitySettings({ influence: Number(e.target.value) })} /><label className="range-label">Travel influence (تأثیر روی سرعت حرکت) <output>{expressionSettings.velocity.travelInfluenceMs} ms</output></label><input type="range" min={0} max={400} step={10} value={expressionSettings.velocity.travelInfluenceMs} onChange={(e) => updateVelocitySettings({ travelInfluenceMs: Number(e.target.value) })} /><label className="range-label">Scale influence (تأثیر روی اندازه) <output>{expressionSettings.velocity.scaleInfluence.toFixed(2)}</output></label><input type="range" min={0} max={1} step={0.05} value={expressionSettings.velocity.scaleInfluence} onChange={(e) => updateVelocitySettings({ scaleInfluence: Number(e.target.value) })} /><label className="range-label">Opacity influence (تأثیر روی شفافیت) <output>{expressionSettings.velocity.opacityInfluence.toFixed(2)}</output></label><input type="range" min={0} max={1} step={0.05} value={expressionSettings.velocity.opacityInfluence} onChange={(e) => updateVelocitySettings({ opacityInfluence: Number(e.target.value) })} /><label className="range-label">Rotation influence (تأثیر روی چرخش) <output>{expressionSettings.velocity.rotationInfluence}°</output></label><input type="range" min={0} max={45} step={1} value={expressionSettings.velocity.rotationInfluence} onChange={(e) => updateVelocitySettings({ rotationInfluence: Number(e.target.value) })} /><h3 className="subheading">Duration (طول نت)</h3><label className="range-label">Influence (میزان تأثیر) <output>{expressionSettings.duration.influence.toFixed(2)}</output></label><input type="range" min={0} max={1} step={0.05} value={expressionSettings.duration.influence} onChange={(e) => updateDurationSettings({ influence: Number(e.target.value) })} /><label className="range-label">Min arrival hold (کمینه‌ی توقف در مقصد) <output>{expressionSettings.duration.minArrivalHoldMs} ms</output></label><input type="range" min={0} max={500} step={10} value={expressionSettings.duration.minArrivalHoldMs} onChange={(e) => updateDurationSettings({ minArrivalHoldMs: Number(e.target.value) })} /><label className="range-label">Max arrival hold (بیشینه‌ی توقف در مقصد) <output>{expressionSettings.duration.maxArrivalHoldMs} ms</output></label><input type="range" min={200} max={2000} step={10} value={expressionSettings.duration.maxArrivalHoldMs} onChange={(e) => updateDurationSettings({ maxArrivalHoldMs: Number(e.target.value) })} /><h3 className="subheading">Sustain (پدال ساستین)</h3><label className="toggle-row"><span>Enable sustain response (فعال‌سازی واکنش به پدال)</span><input type="checkbox" checked={expressionSettings.sustain.enabled} onChange={(e) => updateSustainSettings({ enabled: e.target.checked })} /></label><label className="range-label">Hold multiplier (ضریب توقف) <output>{expressionSettings.sustain.holdMultiplier.toFixed(2)}x</output></label><input type="range" min={1} max={4} step={0.1} value={expressionSettings.sustain.holdMultiplier} onChange={(e) => updateSustainSettings({ holdMultiplier: Number(e.target.value) })} /><label className="range-label">Opacity multiplier (ضریب شفافیت) <output>{expressionSettings.sustain.opacityMultiplier.toFixed(2)}x</output></label><input type="range" min={1} max={1.5} step={0.05} value={expressionSettings.sustain.opacityMultiplier} onChange={(e) => updateSustainSettings({ opacityMultiplier: Number(e.target.value) })} /><h3 className="subheading">Chords (آکورد)</h3><label className="toggle-row"><span>Enable chord spread (فعال‌سازی پخش آکورد)</span><input type="checkbox" checked={expressionSettings.chord.enabled} onChange={(e) => updateChordSettings({ enabled: e.target.checked })} /></label><label className="range-label">Spread (پخش زمانی) <output>{expressionSettings.chord.spreadMs} ms</output></label><input type="range" min={0} max={150} step={5} value={expressionSettings.chord.spreadMs} onChange={(e) => updateChordSettings({ spreadMs: Number(e.target.value) })} /><label className="range-label">Emphasis influence (تأثیر برجستگی) <output>{expressionSettings.chord.emphasisInfluence.toFixed(2)}</output></label><input type="range" min={0} max={1} step={0.05} value={expressionSettings.chord.emphasisInfluence} onChange={(e) => updateChordSettings({ emphasisInfluence: Number(e.target.value) })} /><h3 className="subheading">Debug (اشکال‌زدایی)</h3><label className="toggle-row"><span>Show Expression Debug (نمایش اشکال‌زدایی بیان)</span><input type="checkbox" checked={expressionSettings.debugVisible} onChange={(e) => setExpressionSettings((prev) => ({ ...prev, debugVisible: e.target.checked }))} /></label></>}</aside></section>{showHelp && <div className="help-overlay" onClick={() => setShowHelp(false)}><div className="help-modal panel" onClick={(e) => e.stopPropagation()}><div className="panel-heading"><div><span className="eyebrow">GUIDE (راهنما)</span><h2>چطور با برنامه کار کنیم؟ (How to use this app)</h2></div><button className="icon-button" onClick={() => setShowHelp(false)}>✕</button></div><ol className="help-steps"><li><strong>۱. تصویر مرجع پیانو (Reference Piano Frame)</strong> — در کارت «Reference Piano Frame» عکس پیانو را اضافه کن (PNG/JPG). این تصویر فقط برای کالیبراسیون کیبورد استفاده می‌شود.</li><li><strong>۲. کالیبراسیون صفحه‌کلید (Calibration)</strong> — نوع صفحه‌کلید را انتخاب کن، سپس چهار نشانگر گوشه و ۷ نشانگر لنگر را روی عکس بکش تا چیپ بالای پیش‌نمایش سبز شود.</li><li><strong>۳. تصویر مستقل پازل (Puzzle Artwork)</strong> — در کارت «Puzzle Artwork» یک تصویر کاملاً متفاوت (نه عکس پیانو) اضافه کن؛ همین تصویر پازل می‌شود.</li><li><strong>۴. ساخت قطعات (Generate Puzzle Pieces)</strong> — حالت هندسه و تراکم را انتخاب کن و روی «Generate Puzzle Pieces» کلیک کن.</li><li><strong>۵. فایل MIDI</strong> — در کارت MIDI فایل .mid را اضافه کن.</li><li><strong>۶. اجرای نگاشت (Run Mapping)</strong> — وقتی هر ۵ مرحله‌ی بالا کامل شد، دکمه‌ی «Run Mapping» فعال می‌شود؛ رویش کلیک کن.</li><li><strong>۷. پیش‌نمایش انیمیشن پازل (Puzzle Animation Preview)</strong> — به تب «Puzzle Animation Preview» برو و روی «Play» کلیک کن؛ قطعات واقعی تصویر پازل از سمت پیانو به‌سوی جای اصلی‌شان حرکت می‌کنند.</li><li><strong>اگر Play کاری نکرد</strong> — پیام زیر دکمه‌ی Run Mapping یا Play دقیقاً می‌گوید کدام پیش‌نیاز کم است؛ استپر بالای پنل Inputs هم مراحل انجام‌شده را نشان می‌دهد.</li></ol></div></div>}</main>;
}
