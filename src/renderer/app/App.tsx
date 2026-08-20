import { useEffect, useRef, useState } from "react";
import "pixi.js/unsafe-eval";
import { Application, Container, Graphics, Sprite, Texture } from "pixi.js";
import { createProject, type Asset } from "../../core/project/models";
import { generateGeometry } from "../../geometry/generator";
import { renderCalibration } from "../../keyboard/calibration-renderer";
import { createOverlaySvg } from "../../keyboard/overlay-generator";
import { loadCalibrations, saveCalibrationWithTimestamp } from "../../keyboard/calibration-store";
import { calibrationIsValid, createDefaultCalibration, migrateCalibration, updateAnchorDiagnostics, viewTransform } from "../../keyboard/calibration-workflow";
import { computeHomography, isValidQuadrilateral } from "../../keyboard/homography";
import { parseMidi } from "../../midi/parser";
import { mapMidiToPuzzle } from "../../midi/note-mapper";
import type { NormalizedMidi } from "../../midi/models";
import type { GeometryResult } from "../../geometry/models";
import type { MidiMappingResult } from "../../puzzle/puzzle-event-models";
import type { Calibration, ViewType } from "../../keyboard/models";
import { AnimationClock } from "../../animation/animation-clock";
import { AnimationEngine } from "../../animation/animation-engine";
import { normalizeAnimationTiming } from "../../animation/models";
import type { AnimationClockState, AnimationTimingSettings, EasingName, PieceAnimationFrame } from "../../animation/models";
import { PuzzleRenderer } from "../../puzzle/puzzle-renderer";

const views: ViewType[] = ["top", "top-angle", "three-quarter", "side", "custom"];
const corners = ["topLeft", "topRight", "bottomRight", "bottomLeft"] as const;
type Corner = typeof corners[number];
const cornerColors: Record<Corner, string> = { topLeft: "#ff6b8a", topRight: "#65d8ff", bottomRight: "#ffc45c", bottomLeft: "#8ef0a3" };

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
  const [savedAt, setSavedAt] = useState(""); const [selectedAnchor, setSelectedAnchor] = useState<string>(); const [hoveredKey, setHoveredKey] = useState<string>();
  const [mappingMode, setMappingMode] = useState(project.midiMappingConfig?.mappingMode ?? "nearest-centroid"); const [outOfRangePolicy, setOutOfRangePolicy] = useState(project.midiMappingConfig?.outOfRangePolicy ?? "mark-invalid"); const [chordWindowMs, setChordWindowMs] = useState(project.midiMappingConfig?.chordWindowMs ?? 45);

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

  useEffect(() => { assetRef.current = asset; geometryRef.current = geometry; mappingRef.current = mapping; timingRef.current = timingSettings; }, [asset, geometry, mapping, timingSettings]);

  function applyImageTransform(explicitDims?: { width: number; height: number }) {
    const app = pixi.current;
    const width = explicitDims?.width ?? assetRef.current?.width;
    const height = explicitDims?.height ?? assetRef.current?.height;
    if (!app || !app.renderer || !width || !height) return;
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
    const image = new Image(); image.onload = () => { const a: Asset = { id: crypto.randomUUID(), type: "image", fileName, filePath, mimeType, fileSize, width: image.naturalWidth, height: image.naturalHeight, importedAt: new Date().toISOString(), status: "loaded", dataUrl }; const c = createDefaultCalibration(image.naturalWidth, image.naturalHeight); setAsset(a); setCalibration(c); setGeometry(generateGeometry(image, "grid", 8)); setStatus("loaded"); if (pixi.current) { pixi.current.stage.removeChildren(); const sprite = new Sprite(Texture.from(dataUrl)); spriteRef.current = sprite; pixi.current.stage.addChild(sprite); overlay.current = new Container(); pixi.current.stage.addChild(overlay.current); if (rendererRef.current) pixi.current.stage.addChild(rendererRef.current.layer); if (debugLayerRef.current) pixi.current.stage.addChild(debugLayerRef.current); applyImageTransform({ width: image.naturalWidth, height: image.naturalHeight }); } }; image.onerror = () => { setStatus("error"); setError("فایل تصویر معتبر نیست یا خراب است."); }; image.src = dataUrl;
  }
  async function importImage() { setStatus("loading"); try { const file = await window.pianoPuzzle?.chooseAsset("image"); if (!file) { setStatus("empty"); return; } await acceptImage(file.filePath, file.fileName, file.mimeType, `data:${file.mimeType};base64,${file.dataBase64}`, file.fileSize); } catch (caught) { setStatus("error"); setError(caught instanceof Error ? caught.message : "بارگذاری تصویر ناموفق بود."); } }
  async function importMidi() { setMidiStatus("loading"); setMappingError(""); try { const file = await window.pianoPuzzle?.chooseAsset("midi"); if (!file) { setMidiStatus("empty"); return; } const bytes = Uint8Array.from(atob(file.dataBase64), (char) => char.charCodeAt(0)); const parsed = parseMidi(bytes.buffer, file.fileName, project.midiSettings.selectedTrackIndices, project.midiSettings.chordTolerance); setMidi(parsed); setMidiAsset({ id: crypto.randomUUID(), type: "midi", ...file, duration: parsed.duration, importedAt: new Date().toISOString(), status: "loaded" }); setMidiStatus("loaded"); } catch (caught) { setMidiStatus("error"); setMappingError(caught instanceof Error ? caught.message : "بارگذاری MIDI ناموفق بود."); } }
  function runMapping() { if (!midi) { setMappingError("ابتدا فایل MIDI را اضافه کنید."); return; } if (!calibration) { setMappingError("Calibration موجود نیست."); return; } const config = { enabled: true, sourceAssetId: midiAsset?.id, calibrationId: calibration.id, mappingMode, outOfRangePolicy, chordWindowMs, showDebugMarkers: true, showAssignmentLines: false }; const result = mapMidiToPuzzle(midi, calibration, geometry, config, midiAsset?.id); setMapping(result); setMappingError(""); redrawDebugMarkers(result); }
  function dropImage(event: React.DragEvent<HTMLDivElement>) { event.preventDefault(); const file = event.dataTransfer.files[0]; if (!file || !file.type.startsWith("image/")) { setStatus("error"); setError("لطفاً یک فایل تصویری PNG/JPG انتخاب کنید."); return; } const reader = new FileReader(); reader.onload = () => void acceptImage("", file.name, file.type, String(reader.result), file.size); reader.onerror = () => { setStatus("error"); setError("خواندن تصویر ناموفق بود."); }; setStatus("loading"); reader.readAsDataURL(file); }
  function update(next: Calibration) { if (!calibration || calibration.cameraSettings.locked) return; setCalibration(updateAnchorDiagnostics(next)); }
  function drag(corner: Corner, event: React.PointerEvent<HTMLDivElement>) { if (!calibration || calibration.cameraSettings.locked || !host.current) return; event.preventDefault(); event.stopPropagation(); const rect = host.current.getBoundingClientRect(); const move = (e: PointerEvent) => { const point = { x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)) }; const transform = { ...calibration.transform, [corner]: point }; const q = [transform.topLeft, transform.topRight, transform.bottomRight, transform.bottomLeft]; if (isValidQuadrilateral(q)) update({ ...calibration, transform, homography: computeHomography([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], q), updatedAt: new Date().toISOString() }); }; const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); }; window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); }
  function clickCanvas(event: React.MouseEvent<HTMLDivElement>) { if (!calibration || !selectedAnchor || calibration.cameraSettings.locked || !host.current) return; const rect = host.current.getBoundingClientRect(); const point = { x: (event.clientX - rect.left) / rect.width * calibration.sourceWidth, y: (event.clientY - rect.top) / rect.height * calibration.sourceHeight }; update({ ...calibration, anchorPoints: calibration.anchorPoints.map((a) => a.id === selectedAnchor ? { ...a, point } : a) }); }
  function save() { if (!calibration) return; const saved = saveCalibrationWithTimestamp(calibration); setCalibration(saved); setSavedAt(saved.updatedAt); }
  function load() { const item = loadCalibrations()[0]; if (item) { const migrated = migrateCalibration(item); setCalibration(migrated); setSavedAt(migrated.updatedAt); } }
  function reset() { if (asset?.width && asset.height) { setCalibration(createDefaultCalibration(asset.width, asset.height)); setMapping(undefined); } }
  function exportOverlay(kind: "svg" | "png") { if (!calibration) return; const svg = createOverlaySvg(calibration); if (kind === "svg") { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })); a.download = "keyboard-overlay.svg"; a.click(); return; } const image = new Image(); image.onload = () => { const canvas = document.createElement("canvas"); canvas.width = calibration.sourceWidth; canvas.height = calibration.sourceHeight; canvas.getContext("2d")?.drawImage(image, 0, 0); canvas.toBlob((blob) => { if (blob) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "keyboard-overlay.png"; a.click(); } }, "image/png"); }; image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; }
  function togglePlay() { if (clockRef.current.clockState === "playing") clockRef.current.pause(); else clockRef.current.play(); }
  function seek(ms: number) { clockRef.current.seek(ms); }
  function setSpeed(speed: number) { clockRef.current.setSpeed(speed); setTimingSettings((prev) => ({ ...prev, animationSpeed: speed })); }
  const valid = calibration ? calibrationIsValid(calibration) : false;
  const animationReady = Boolean(mapping && geometry && calibration && valid && timelineInfo.count > 0);
  return <main className="studio-shell"><header className="topbar"><div><span className="eyebrow">PHASE 6 · PUZZLE ANIMATION</span><h1>Piano Puzzle Studio</h1></div><div className="topbar-actions"><span className="status-dot" /> Mapping Preview</div></header><section className="workspace"><aside className="sidebar panel"><h2>Inputs</h2><div className="dropzone reference-drop" onDragOver={(e) => e.preventDefault()} onDrop={dropImage} onClick={() => void importImage()}><strong>{asset ? "Reference loaded" : "Add reference image"}</strong><small>PNG / JPG</small></div>{status === "error" && <p className="error-message">{error}</p>}<button className="dropzone" onClick={() => void importMidi()}>♫ {midiAsset?.fileName ?? "Add MIDI file"}</button>{midiStatus === "error" && <p className="error-message">{mappingError}</p>}<div className="section-divider" /><h3>Calibration</h3><select disabled={!calibration} value={calibration?.viewType ?? "top"} onChange={(e) => calibration && setCalibration(viewTransform(e.target.value as ViewType, calibration))}>{views.map((v) => <option key={v}>{v}</option>)}</select><h3 className="subheading">Mapping Mode</h3><select value={mappingMode} onChange={(e) => setMappingMode(e.target.value as typeof mappingMode)}><option value="nearest-centroid">Nearest centroid</option><option value="one-note-one-piece">One note / one piece</option><option value="target-region">Target region</option><option value="deterministic-sequence">Deterministic sequence</option></select><label className="range-label">Chord window <output>{chordWindowMs} ms</output></label><input type="range" min="30" max="60" value={chordWindowMs} onChange={(e) => setChordWindowMs(Number(e.target.value))} /><select value={outOfRangePolicy} onChange={(e) => setOutOfRangePolicy(e.target.value as typeof outOfRangePolicy)}><option value="mark-invalid">Mark invalid</option><option value="ignore">Ignore</option><option value="clamp">Clamp</option></select><button className="primary-button mapping-button" onClick={runMapping}>Run Mapping</button></aside><section className="preview panel"><div className="panel-heading"><div><span className="eyebrow">CALIBRATION + MAPPING</span><h2>Projected spawn points</h2></div><span className={`chip ${valid ? "chip-valid" : ""}`}>{mapping ? `${mapping.events.length} events` : "No mapping"}</span></div><div className="canvas-frame" ref={host} onClick={clickCanvas}>{!asset && <div className="empty-reference"><span>＋</span><strong>No reference loaded</strong><small>Add a piano image, MIDI and calibration.</small></div>}{calibration && corners.map((corner) => <div key={corner} className={`corner-handle ${calibration.cameraSettings.locked ? "locked" : ""}`} style={{ left: `${calibration.transform[corner].x * 100}%`, top: `${calibration.transform[corner].y * 100}%` }} onPointerDown={(e) => drag(corner, e)}>{corner}</div>)}</div><div className="transport"><button className="primary-button" disabled={!valid} onClick={save}>Save Calibration</button><button className="ghost-button" onClick={load}>Load</button><button className="ghost-button" onClick={reset}>Reset</button><button className="ghost-button" disabled={!calibration} onClick={() => exportOverlay("svg")}>SVG</button><button className="ghost-button" disabled={!calibration} onClick={() => exportOverlay("png")}>PNG</button></div></section><aside className="inspector panel"><div className="panel-heading"><div><span className="eyebrow">MAPPING DEBUG</span><h2>Events & Pieces</h2></div></div>{mapping ? <><div className="debug-grid"><span>Mapped</span><strong>{mapping.events.filter((e) => e.state === "mapped" || e.state === "assigned").length}</strong><span>Invalid</span><strong>{mapping.events.filter((e) => e.state === "invalid").length}</strong><span>Assignments</span><strong>{mapping.assignments.length}</strong><span>Chords</span><strong>{mapping.chords.length}</strong><span>Mode</span><strong>{mapping.config.mappingMode}</strong></div><div className="event-list">{mapping.events.slice(0, 30).map((event) => <div className="event-row mapping-row" key={event.id}><span>{event.noteName}</span><span>{event.state}</span><span>{event.assignedPieceIds[0] ?? "—"}</span></div>)}</div></> : <div className="empty-debug">Load MIDI and calibration, then run mapping.</div>}</aside></section><section className="transport-panel panel"><div className="panel-heading"><div><span className="eyebrow">PHASE 6 · ANIMATION</span><h2>Puzzle playback</h2></div><span className="chip">{timelineInfo.count} piece(s) scheduled</span></div><div className="transport"><button className="primary-button" disabled={!animationReady} onClick={togglePlay}>{clockState.state === "playing" ? "Pause" : "Play"}</button><button className="ghost-button" disabled={!animationReady} onClick={() => clockRef.current.stop()}>Stop</button><button className="ghost-button" disabled={!animationReady} onClick={() => clockRef.current.reset()}>Reset</button><input type="range" min={0} max={timelineInfo.totalDurationMs} step={10} value={Math.min(clockState.currentTimeMs, timelineInfo.totalDurationMs)} disabled={!animationReady} onChange={(e) => seek(Number(e.target.value))} /><span className="timecode">{formatTime(clockState.currentTimeMs)} / {formatTime(timelineInfo.totalDurationMs)}</span></div><div className="control-row"><label>Speed<select value={timingSettings.animationSpeed} onChange={(e) => setSpeed(Number(e.target.value))}><option value={0.25}>0.25x</option><option value={0.5}>0.5x</option><option value={1}>1x</option><option value={2}>2x</option></select></label><label>Easing<select value={timingSettings.easing} onChange={(e) => setTimingSettings((prev) => ({ ...prev, easing: e.target.value as EasingName }))}><option value="linear">linear</option><option value="easeIn">easeIn</option><option value="easeOut">easeOut</option><option value="easeInOut">easeInOut</option></select></label><label className="toggle-row"><span>Show Animation Debug</span><input type="checkbox" checked={timingSettings.debugVisible} onChange={(e) => setTimingSettings((prev) => ({ ...prev, debugVisible: e.target.checked }))} /></label></div><label className="range-label">Base travel duration <output>{timingSettings.baseTravelDurationMs} ms</output></label><input type="range" min={150} max={1500} step={10} value={timingSettings.baseTravelDurationMs} onChange={(e) => setTimingSettings((prev) => ({ ...prev, baseTravelDurationMs: Number(e.target.value) }))} />{!animationReady && <p className="muted">{!mapping ? "برای شروع انیمیشن، ابتدا MIDI را map کنید." : (!calibration || !valid) ? "Calibration معتبر لازم است." : !geometry ? "Geometry موجود نیست." : "قطعه‌ای برای انیمیشن یافت نشد."}</p>}{timingSettings.debugVisible && debugFrames.length > 0 && <div className="event-list">{debugFrames.slice(0, 30).map((frame) => <div className="event-row mapping-row" key={frame.id}><span>{frame.pieceId}</span><span>{frame.state}</span><span>{Math.round(frame.progress * 100)}%</span></div>)}</div>}</section></main>;
}
