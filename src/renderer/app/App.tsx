import { useEffect, useRef, useState } from "react";
import "pixi.js/unsafe-eval";
import { Application, Container, Graphics, Sprite, Texture } from "pixi.js";
import { createProject, type Asset } from "../../core/project/models";
import { generateGeometry } from "../../geometry/generator";
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
import type { GeometryResult } from "../../geometry/models";
import type { MidiMappingResult } from "../../puzzle/puzzle-event-models";
import type { Calibration, KeyboardType, ViewType } from "../../keyboard/models";
import { AnimationClock } from "../../animation/animation-clock";
import { AnimationEngine } from "../../animation/animation-engine";
import { normalizeAnimationTiming } from "../../animation/models";
import type { AnimationClockState, AnimationTimingSettings, EasingName, PieceAnimationFrame } from "../../animation/models";
import { PuzzleRenderer } from "../../puzzle/puzzle-renderer";

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

function formatTime(ms: number): string {
  const clamped = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(clamped / 60000);
  const seconds = Math.floor((clamped % 60000) / 1000);
  const millis = clamped % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

export function App() {
  const host = useRef<HTMLDivElement>(null); const pixi = useRef<Application | null>(null); const overlay = useRef<Container | null>(null);
  const [project] = useState(() => createProject());
  const [asset, setAsset] = useState<Asset>(); const [midiAsset, setMidiAsset] = useState<Asset>();
  const [calibration, setCalibration] = useState<Calibration>(); const [geometry, setGeometry] = useState<GeometryResult>();
  const [midi, setMidi] = useState<NormalizedMidi>(); const [mapping, setMapping] = useState<MidiMappingResult>();
  const [status, setStatus] = useState<"empty" | "loading" | "loaded" | "error">("empty"); const [midiStatus, setMidiStatus] = useState<"empty" | "loading" | "loaded" | "error">("empty");
  const [error, setError] = useState(""); const [mappingError, setMappingError] = useState("");
  const [savedAt, setSavedAt] = useState(""); const [hoveredKey, setHoveredKey] = useState<string>(); const [viewSize, setViewSize] = useState({ width: 0, height: 0 });
  const [mappingMode, setMappingMode] = useState(project.midiMappingConfig?.mappingMode ?? "nearest-centroid"); const [outOfRangePolicy, setOutOfRangePolicy] = useState(project.midiMappingConfig?.outOfRangePolicy ?? "mark-invalid"); const [chordWindowMs, setChordWindowMs] = useState(project.midiMappingConfig?.chordWindowMs ?? 45);
  const [keyboardType, setKeyboardType] = useState<KeyboardType>("88-key");

  // Animation (Phase 6)
  const engineRef = useRef(new AnimationEngine());
  const clockRef = useRef(new AnimationClock());
  const rendererRef = useRef<PuzzleRenderer | null>(null);
  const debugLayerRef = useRef<Container | null>(null);
  const spriteRef = useRef<Sprite | null>(null);
  const markersLayerRef = useRef<Container | null>(null);
  const transformRef = useRef({ k: 1, offsetX: 0, offsetY: 0 });
  const framesRef = useRef<PieceAnimationFrame[]>([]);
  const assetRef = useRef<Asset | undefined>(undefined);
  const geometryRef = useRef<GeometryResult | undefined>(undefined);
  const mappingRef = useRef<MidiMappingResult | undefined>(undefined);
  const timingRef = useRef<AnimationTimingSettings>(normalizeAnimationTiming(project.animationTimingSettings));
  const lastUiSync = useRef(0);
  const [timingSettings, setTimingSettings] = useState<AnimationTimingSettings>(() => normalizeAnimationTiming(project.animationTimingSettings));
  const [clockState, setClockState] = useState<{ currentTimeMs: number; state: AnimationClockState }>({ currentTimeMs: 0, state: "stopped" });
  const [timelineInfo, setTimelineInfo] = useState<{ count: number; totalDurationMs: number }>({ count: 0, totalDurationMs: 0 });
  const [debugFrames, setDebugFrames] = useState<PieceAnimationFrame[]>([]);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => { assetRef.current = asset; geometryRef.current = geometry; mappingRef.current = mapping; timingRef.current = timingSettings; }, [asset, geometry, mapping, timingSettings]);

  function applyImageTransform(explicitDims?: { width: number; height: number }) {
    const app = pixi.current;
    const width = explicitDims?.width ?? assetRef.current?.width;
    const height = explicitDims?.height ?? assetRef.current?.height;
    if (!app || !app.renderer || !width || !height) return;
    setViewSize((prev) => (prev.width === app.screen.width && prev.height === app.screen.height) ? prev : { width: app.screen.width, height: app.screen.height });
    const k = Math.min(app.screen.width / width, app.screen.height / height);
    const offsetX = (app.screen.width - width * k) / 2; const offsetY = (app.screen.height - height * k) / 2;
    transformRef.current = { k, offsetX, offsetY };
    if (spriteRef.current) { spriteRef.current.width = width * k; spriteRef.current.height = height * k; spriteRef.current.x = offsetX; spriteRef.current.y = offsetY; }
    if (rendererRef.current) { rendererRef.current.layer.position.set(offsetX, offsetY); const geo = geometryRef.current; if (geo) rendererRef.current.rebuild(geo, k); }
    if (debugLayerRef.current) debugLayerRef.current.position.set(offsetX, offsetY);
    redrawDebugMarkers(mappingRef.current);
  }

  function tick() {
    const frames = engineRef.current.evaluate(clockRef.current.currentTimeMs);
    framesRef.current = frames;
    rendererRef.current?.update(frames, transformRef.current.k);
    if (debugLayerRef.current) { const visible = timingRef.current.debugVisible; debugLayerRef.current.visible = visible; if (visible) updateDebugOverlay(frames); }
  }

  function updateDebugOverlay(frames: PieceAnimationFrame[]) {
    const layer = debugLayerRef.current; if (!layer) return;
    layer.removeChildren();
    const { k } = transformRef.current;
    for (const frame of frames) {
      if (frame.state === "cancelled") continue;
      const g = new Graphics();
      g.moveTo(frame.spawnPosition.x * k, frame.spawnPosition.y * k).lineTo(frame.targetPosition.x * k, frame.targetPosition.y * k).stroke({ color: 0x55d9ff, width: 1, alpha: 0.35 });
      g.circle(frame.spawnPosition.x * k, frame.spawnPosition.y * k, 3).fill({ color: 0xffc45c, alpha: 0.8 });
      g.circle(frame.targetPosition.x * k, frame.targetPosition.y * k, 3).fill({ color: 0x8ef0a3, alpha: 0.8 });
      g.circle(frame.currentPosition.x * k, frame.currentPosition.y * k, 4).fill({ color: 0xffffff, alpha: 0.9 });
      layer.addChild(g);
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
    if (mapping && geometry) {
      const timeline = engineRef.current.rebuild({ mapping, pieces: geometry.pieces, timing: timingSettings });
      clockRef.current.setTotalDuration(timeline.totalDurationMs);
      setTimelineInfo({ count: timeline.animations.length, totalDurationMs: timeline.totalDurationMs });
    } else {
      engineRef.current.timeline = { animations: [], totalDurationMs: 0 };
      clockRef.current.setTotalDuration(0);
      setTimelineInfo({ count: 0, totalDurationMs: 0 });
      if (geometry) rendererRef.current?.rebuild(geometry, transformRef.current.k);
    }
    const frames = engineRef.current.evaluate(clockRef.current.currentTimeMs);
    framesRef.current = frames;
    rendererRef.current?.update(frames, transformRef.current.k);
    setDebugFrames(frames);
  }, [mapping, geometry, timingSettings]);

  useEffect(() => { if (geometry) applyImageTransform(); }, [geometry]);

  useEffect(() => {
    if (!host.current) return;
    const app = new Application(); pixi.current = app; let disposed = false;
    const onResize = () => applyImageTransform();
    void app.init({ background: "#111528", resizeTo: host.current, antialias: true }).then(() => {
      if (disposed || !host.current) return;
      host.current.appendChild(app.canvas);
      overlay.current = new Container(); app.stage.addChild(overlay.current);
      const renderer = new PuzzleRenderer(); rendererRef.current = renderer; app.stage.addChild(renderer.layer);
      const debugLayer = new Container(); debugLayer.visible = timingRef.current.debugVisible; debugLayerRef.current = debugLayer; app.stage.addChild(debugLayer);
      app.renderer.on("resize", onResize);
      app.ticker.add(tick);
      applyImageTransform();
    });
    return () => { disposed = true; app.renderer?.off("resize", onResize); app.ticker?.remove(tick); app.destroy(true); };
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
  async function acceptImage(filePath: string, fileName: string, mimeType: string, dataUrl: string, fileSize: number) {
    const image = new Image(); image.onload = () => { const a: Asset = { id: crypto.randomUUID(), type: "image", fileName, filePath, mimeType, fileSize, width: image.naturalWidth, height: image.naturalHeight, importedAt: new Date().toISOString(), status: "loaded", dataUrl }; const c = createDefaultCalibration(image.naturalWidth, image.naturalHeight, keyboardType); setAsset(a); setCalibration(c); setGeometry(generateGeometry(image, "grid", 8)); setStatus("loaded"); if (pixi.current) { pixi.current.stage.removeChildren(); const sprite = new Sprite(Texture.from(image)); spriteRef.current = sprite; pixi.current.stage.addChild(sprite); overlay.current = new Container(); pixi.current.stage.addChild(overlay.current); if (rendererRef.current) pixi.current.stage.addChild(rendererRef.current.layer); if (debugLayerRef.current) pixi.current.stage.addChild(debugLayerRef.current); applyImageTransform({ width: image.naturalWidth, height: image.naturalHeight }); } }; image.onerror = () => { setStatus("error"); setError("فایل تصویر معتبر نیست یا خراب است."); }; image.src = dataUrl;
  }
  async function importImage() { setStatus("loading"); try { const file = await window.pianoPuzzle?.chooseAsset("image"); if (!file) { setStatus("empty"); return; } await acceptImage(file.filePath, file.fileName, file.mimeType, `data:${file.mimeType};base64,${file.dataBase64}`, file.fileSize); } catch (caught) { setStatus("error"); setError(caught instanceof Error ? caught.message : "بارگذاری تصویر ناموفق بود."); } }
  async function importMidi() { setMidiStatus("loading"); setMappingError(""); try { const file = await window.pianoPuzzle?.chooseAsset("midi"); if (!file) { setMidiStatus("empty"); return; } const bytes = Uint8Array.from(atob(file.dataBase64), (char) => char.charCodeAt(0)); const parsed = parseMidi(bytes.buffer, file.fileName, project.midiSettings.selectedTrackIndices, project.midiSettings.chordTolerance); setMidi(parsed); setMidiAsset({ id: crypto.randomUUID(), type: "midi", ...file, duration: parsed.duration, importedAt: new Date().toISOString(), status: "loaded" }); setMidiStatus("loaded"); } catch (caught) { setMidiStatus("error"); setMappingError(caught instanceof Error ? caught.message : "بارگذاری MIDI ناموفق بود."); } }
  function runMapping() { if (!midi) { setMappingError("ابتدا فایل MIDI را اضافه کنید."); return; } if (!calibration) { setMappingError("Calibration موجود نیست."); return; } const config = { enabled: true, sourceAssetId: midiAsset?.id, calibrationId: calibration.id, mappingMode, outOfRangePolicy, chordWindowMs, showDebugMarkers: true, showAssignmentLines: false }; const result = mapMidiToPuzzle(midi, calibration, geometry, config, midiAsset?.id); setMapping(result); setMappingError(""); redrawDebugMarkers(result); }
  function dropImage(event: React.DragEvent<HTMLDivElement>) { event.preventDefault(); const file = event.dataTransfer.files[0]; if (!file || !file.type.startsWith("image/")) { setStatus("error"); setError("لطفاً یک فایل تصویری PNG/JPG انتخاب کنید."); return; } const reader = new FileReader(); reader.onload = () => void acceptImage("", file.name, file.type, String(reader.result), file.size); reader.onerror = () => { setStatus("error"); setError("خواندن تصویر ناموفق بود."); }; setStatus("loading"); reader.readAsDataURL(file); }
  function update(next: Calibration) { if (!calibration || calibration.cameraSettings.locked) return; setCalibration(updateAnchorDiagnostics(next)); }
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
      const source = toSourcePoint({ x: e.clientX - rect.left, y: e.clientY - rect.top }, projection);
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
  function save() { if (!calibration) return; const saved = saveCalibrationWithTimestamp(calibration); setCalibration(saved); setSavedAt(saved.updatedAt); }
  function load() { const item = loadCalibrations().find((c) => c.keyboardType === keyboardType); if (item) { const migrated = migrateCalibration(item); setCalibration(migrated); setSavedAt(migrated.updatedAt); } else if (asset?.width && asset.height) { setCalibration(createDefaultCalibration(asset.width, asset.height, keyboardType)); setMapping(undefined); } }
  function reset() { if (asset?.width && asset.height) { setCalibration(createDefaultCalibration(asset.width, asset.height, keyboardType)); setMapping(undefined); } }
  function changeKeyboardType(type: KeyboardType) {
    setKeyboardType(type);
    if (!asset?.width || !asset.height) return;
    const item = loadCalibrations().find((c) => c.keyboardType === type);
    if (item) { const migrated = migrateCalibration(item); setCalibration(migrated); setSavedAt(migrated.updatedAt); } else { setCalibration(createDefaultCalibration(asset.width, asset.height, type)); setSavedAt(""); }
    setMapping(undefined);
  }
  function exportOverlay(kind: "svg" | "png") { if (!calibration) return; const svg = createOverlaySvg(calibration); if (kind === "svg") { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })); a.download = "keyboard-overlay.svg"; a.click(); return; } const image = new Image(); image.onload = () => { const canvas = document.createElement("canvas"); canvas.width = calibration.sourceWidth; canvas.height = calibration.sourceHeight; canvas.getContext("2d")?.drawImage(image, 0, 0); canvas.toBlob((blob) => { if (blob) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "keyboard-overlay.png"; a.click(); } }, "image/png"); }; image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; }
  function togglePlay() { if (clockRef.current.clockState === "playing") clockRef.current.pause(); else clockRef.current.play(); }
  function seek(ms: number) { clockRef.current.seek(ms); }
  function setSpeed(speed: number) { clockRef.current.setSpeed(speed); setTimingSettings((prev) => ({ ...prev, animationSpeed: speed })); }
  const valid = calibration ? calibrationIsValid(calibration) : false;
  const animationReady = Boolean(mapping && geometry && calibration && valid && timelineInfo.count > 0);
  return <main className="studio-shell"><header className="topbar"><div><span className="eyebrow">PHASE 6 · PUZZLE ANIMATION (فاز ۶ · انیمیشن پازل)</span><h1>Piano Puzzle Studio (استودیو پازل پیانو)</h1></div><div className="topbar-actions"><button className="ghost-button" onClick={() => setShowHelp(true)}>؟ Help (راهنما)</button><span className="status-dot" /> Mapping Preview (پیش‌نمایش نگاشت)</div></header><section className="workspace"><aside className="sidebar panel"><h2>Inputs (ورودی‌ها)</h2><div className="dropzone reference-drop" onDragOver={(e) => e.preventDefault()} onDrop={dropImage} onClick={() => void importImage()}><strong>{asset ? "Reference loaded (تصویر بارگذاری شد)" : "Add reference image (افزودن تصویر مرجع)"}</strong><small>PNG / JPG</small></div>{status === "error" && <p className="error-message">{error}</p>}<button className="dropzone" onClick={() => void importMidi()}>♫ {midiAsset?.fileName ?? "Add MIDI file (افزودن فایل MIDI)"}</button>{midiStatus === "error" && <p className="error-message">{mappingError}</p>}<div className="section-divider" /><h3>Calibration (کالیبراسیون)</h3><select value={keyboardType} onChange={(e) => changeKeyboardType(e.target.value as KeyboardType)}>{keyboardTypes.map((t) => <option key={t} value={t}>{keyboardTypeLabels[t]}</option>)}</select><select disabled={!calibration} value={calibration?.viewType ?? "top"} onChange={(e) => calibration && setCalibration(viewTransform(e.target.value as ViewType, calibration))}>{views.map((v) => <option key={v} value={v}>{viewLabels[v]}</option>)}</select><h3 className="subheading">Mapping Mode (حالت نگاشت)</h3><select value={mappingMode} onChange={(e) => setMappingMode(e.target.value as typeof mappingMode)}><option value="nearest-centroid">Nearest centroid (نزدیک‌ترین مرکز)</option><option value="one-note-one-piece">One note / one piece (یک نت = یک قطعه)</option><option value="target-region">Target region (ناحیه‌ی هدف)</option><option value="deterministic-sequence">Deterministic sequence (ترتیب قطعی)</option></select><label className="range-label">Chord window (پنجره‌ی آکورد) <output>{chordWindowMs} ms</output></label><input type="range" min="30" max="60" value={chordWindowMs} onChange={(e) => setChordWindowMs(Number(e.target.value))} /><select value={outOfRangePolicy} onChange={(e) => setOutOfRangePolicy(e.target.value as typeof outOfRangePolicy)}><option value="mark-invalid">Mark invalid (نامعتبر علامت بزن)</option><option value="ignore">Ignore (نادیده بگیر)</option><option value="clamp">Clamp (محدود کن)</option></select><button className="primary-button mapping-button" onClick={runMapping}>Run Mapping (اجرای نگاشت)</button></aside><section className="preview panel"><div className="panel-heading"><div><span className="eyebrow">CALIBRATION + MAPPING (کالیبراسیون + نگاشت)</span><h2>Projected spawn points (نقاط شروع تصویرشده)</h2></div><span className={`chip ${valid ? "chip-valid" : ""}`}>{mapping ? `${mapping.events.length} events (رویداد)` : "No mapping (بدون نگاشت)"}</span></div><div className="canvas-frame" ref={host}>{!asset && <div className="empty-reference"><span>＋</span><strong>No reference loaded (تصویری بارگذاری نشده)</strong><small>Add a piano image, MIDI and calibration. (یک تصویر پیانو، فایل MIDI و کالیبراسیون اضافه کن.)</small></div>}{calibration && corners.map((corner) => <div key={corner} className={`corner-handle ${calibration.cameraSettings.locked ? "locked" : ""}`} style={{ left: `${calibration.transform[corner].x * 100}%`, top: `${calibration.transform[corner].y * 100}%` }} onPointerDown={(e) => drag(corner, e)}>{corner}</div>)}{anchorHandles()}</div>{calibration && <small className="anchor-hint">Drag the 7 labeled markers onto their real keys — start with the edges, then C4. (نشانگرها را روی کلید واقعی در عکس بکش؛ اول لبه‌ها، بعد C4.)</small>}<div className="transport"><button className="primary-button" disabled={!valid} onClick={save}>Save Calibration (ذخیره‌ی کالیبراسیون)</button><button className="ghost-button" onClick={load}>Load (بارگذاری)</button><button className="ghost-button" onClick={reset}>Reset (بازنشانی)</button><button className="ghost-button" disabled={!calibration} onClick={() => exportOverlay("svg")}>SVG</button><button className="ghost-button" disabled={!calibration} onClick={() => exportOverlay("png")}>PNG</button></div></section><aside className="inspector panel"><div className="panel-heading"><div><span className="eyebrow">MAPPING DEBUG (اشکال‌زدایی نگاشت)</span><h2>Events & Pieces (رویدادها و قطعات)</h2></div></div>{mapping ? <><div className="debug-grid"><span>Mapped (نگاشت‌شده)</span><strong>{mapping.events.filter((e) => e.state === "mapped" || e.state === "assigned").length}</strong><span>Invalid (نامعتبر)</span><strong>{mapping.events.filter((e) => e.state === "invalid").length}</strong><span>Assignments (انتساب‌ها)</span><strong>{mapping.assignments.length}</strong><span>Chords (آکوردها)</span><strong>{mapping.chords.length}</strong><span>Mode (حالت)</span><strong>{mapping.config.mappingMode}</strong></div><div className="event-list">{mapping.events.slice(0, 30).map((event) => <div className="event-row mapping-row" key={event.id}><span>{event.noteName}</span><span>{event.state}</span><span>{event.assignedPieceIds[0] ?? "—"}</span></div>)}</div></> : <div className="empty-debug">Load MIDI and calibration, then run mapping. (فایل MIDI و کالیبراسیون را بارگذاری کن، سپس نگاشت را اجرا کن.)</div>}</aside></section><section className="transport-panel panel"><div className="panel-heading"><div><span className="eyebrow">PHASE 6 · ANIMATION (فاز ۶ · انیمیشن)</span><h2>Puzzle playback (پخش پازل)</h2></div><span className="chip">{timelineInfo.count} piece(s) scheduled (قطعه زمان‌بندی‌شده)</span></div><div className="transport"><button className="primary-button" disabled={!animationReady} onClick={togglePlay}>{clockState.state === "playing" ? "Pause (توقف موقت)" : "Play (پخش)"}</button><button className="ghost-button" disabled={!animationReady} onClick={() => clockRef.current.stop()}>Stop (توقف)</button><button className="ghost-button" disabled={!animationReady} onClick={() => clockRef.current.reset()}>Reset (بازنشانی)</button><input type="range" min={0} max={timelineInfo.totalDurationMs} step={10} value={Math.min(clockState.currentTimeMs, timelineInfo.totalDurationMs)} disabled={!animationReady} onChange={(e) => seek(Number(e.target.value))} /><span className="timecode">{formatTime(clockState.currentTimeMs)} / {formatTime(timelineInfo.totalDurationMs)}</span></div><div className="control-row"><label>Speed (سرعت)<select value={timingSettings.animationSpeed} onChange={(e) => setSpeed(Number(e.target.value))}><option value={0.25}>0.25x</option><option value={0.5}>0.5x</option><option value={1}>1x</option><option value={2}>2x</option></select></label><label>Easing (نرمی حرکت)<select value={timingSettings.easing} onChange={(e) => setTimingSettings((prev) => ({ ...prev, easing: e.target.value as EasingName }))}><option value="linear">linear (خطی)</option><option value="easeIn">easeIn (شروع نرم)</option><option value="easeOut">easeOut (پایان نرم)</option><option value="easeInOut">easeInOut (شروع/پایان نرم)</option></select></label><label className="toggle-row"><span>Show Animation Debug (نمایش اشکال‌زدایی)</span><input type="checkbox" checked={timingSettings.debugVisible} onChange={(e) => setTimingSettings((prev) => ({ ...prev, debugVisible: e.target.checked }))} /></label></div><label className="range-label">Base travel duration (مدت پایه‌ی حرکت) <output>{timingSettings.baseTravelDurationMs} ms</output></label><input type="range" min={150} max={1500} step={10} value={timingSettings.baseTravelDurationMs} onChange={(e) => setTimingSettings((prev) => ({ ...prev, baseTravelDurationMs: Number(e.target.value) }))} />{!animationReady && <p className="muted">{!mapping ? "برای شروع انیمیشن، ابتدا MIDI را map کنید." : (!calibration || !valid) ? "Calibration معتبر لازم است." : !geometry ? "Geometry موجود نیست." : "قطعه‌ای برای انیمیشن یافت نشد."}</p>}{timingSettings.debugVisible && debugFrames.length > 0 && <div className="event-list">{debugFrames.slice(0, 30).map((frame) => <div className="event-row mapping-row" key={frame.id}><span>{frame.pieceId}</span><span>{frame.state}</span><span>{Math.round(frame.progress * 100)}%</span></div>)}</div>}</section>{showHelp && <div className="help-overlay" onClick={() => setShowHelp(false)}><div className="help-modal panel" onClick={(e) => e.stopPropagation()}><div className="panel-heading"><div><span className="eyebrow">GUIDE (راهنما)</span><h2>چطور با برنامه کار کنیم؟ (How to use this app)</h2></div><button className="icon-button" onClick={() => setShowHelp(false)}>✕</button></div><ol className="help-steps"><li><strong>۱. تصویر مرجع پیانو (Reference image)</strong> — در پنل «Inputs» روی «Add reference image» کلیک کن یا عکس پیانو را بکش و رها کن (PNG/JPG).</li><li><strong>۲. فایل MIDI (Add MIDI file)</strong> — روی دکمه‌ی «Add MIDI file» کلیک کن و فایل .mid را انتخاب کن؛ اسم فایل روی دکمه ظاهر می‌شود.</li><li><strong>۳. کالیبراسیون صفحه‌کلید (Calibration)</strong> — اول از منوی «Keyboard» نوع صفحه‌کلید عکس را انتخاب کن (۸۸-کلید پیانو یا ۷۶-کلید Korg Pa4X)؛ هرکدام کالیبراسیون جدا و مستقل خودش را دارد. سپس چهار نشانگر رنگی روی گوشه‌های تصویر را بکش تا دقیقاً روی چهار گوشه‌ی صفحه‌کلید در عکس بنشینند. وقتی چیپ بالای «Projected spawn points» سبز شد، کالیبراسیون معتبر است.</li><li><strong>۴. تنظیمات نگاشت (اختیاری)</strong> — Mapping Mode، Chord window و Out-of-range Policy را می‌توانی تغییر دهی؛ مقدار پیش‌فرض هم قابل استفاده است.</li><li><strong>۵. اجرای نگاشت (Run Mapping)</strong> — روی دکمه‌ی «Run Mapping» کلیک کن. اگر موفق بود، چیپ بالای Preview به‌جای «No mapping» تعداد رویدادها را نشان می‌دهد و در پنل «Mapping Debug»، Assignments بزرگ‌تر از صفر می‌شود.</li><li><strong>۶. پخش پازل (Puzzle playback)</strong> — پایین صفحه، اگر «piece(s) scheduled» بزرگ‌تر از صفر باشد، دکمه‌ی «Play» فعال می‌شود.</li><li><strong>۷. Play</strong> — قطعات پازل از نقطه‌ی شروع روی صفحه‌کلید به‌سمت جای اصلی‌شان حرکت می‌کنند. با Speed، Easing و Base travel duration می‌توانی نحوه‌ی حرکت را تنظیم کنی؛ با Seek می‌توانی روی هر لحظه از زمان بپری.</li><li><strong>اگر Play کاری نکرد</strong> — این‌ها را چک کن: آیا اسم فایل روی دکمه‌ی MIDI ظاهر شده؟ آیا بعد از Run Mapping چیپ بالا دیگر «No mapping» نیست؟ آیا چیپ کالیبراسیون سبز است؟ پیام زیر دکمه‌های Play دقیقاً می‌گوید کدام پیش‌نیاز کم است.</li></ol></div></div>}</main>;
}
