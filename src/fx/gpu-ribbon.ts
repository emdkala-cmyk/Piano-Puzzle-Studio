/**
 * GPU-accelerated ribbon / trail renderer for PixiJS v8.
 *
 * Replaces per-frame Graphics.clear() + moveTo/lineTo/stroke (CPU tessellation)
 * with a MeshGeometry triangle-strip + minimal GLSL shader.
 *
 * The CPU only writes a Float32Array position buffer each frame.
 * All rasterisation happens on the GPU — zero stroke tessellation.
 */

import { Container, GlProgram, Mesh, MeshGeometry, Shader, Texture } from "pixi.js";
import type { PointData } from "pixi.js";

/* ------------------------------------------------------------------ */
/* GLSL shaders — follow PixiJS v8 Mesh conventions                   */
/* ------------------------------------------------------------------ */

const RIBBON_VERT = /* glsl */ `
  in vec2 aPosition;
  in vec2 aUV;

  uniform mat3 uProjectionMatrix;
  uniform mat3 uWorldTransformMatrix;

  out vec2 vUV;

  void main() {
    mat3 mvp = uProjectionMatrix * uWorldTransformMatrix;
    gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
    vUV = aUV;
  }
`;

const RIBBON_FRAG = /* glsl */ `
  in vec2 vUV;
  uniform vec4 uTintColor;

  out vec4 finalColor;

  void main() {
    // vUV.y encodes per-vertex alpha (set from CPU each frame)
    float a = clamp(vUV.y, 0.0, 1.0);
    finalColor = vec4(uTintColor.rgb, uTintColor.a * a);
  }
`;

/* ------------------------------------------------------------------ */
/* GpuRibbon                                                           */
/* ------------------------------------------------------------------ */

export class GpuRibbon {
  readonly container = new Container();

  private readonly geometry: MeshGeometry;
  private readonly mesh: Mesh;

  /** Pre-allocated: maxPoints × 2 vertices × 2 floats (x, y) */
  private readonly posData: Float32Array;
  /** Pre-allocated: maxPoints × 2 vertices × 2 floats (u, alpha) */
  private readonly uvData: Float32Array;
  /** Pre-allocated triangle-strip indices (rebuilt each frame) */
  private indexData: Uint32Array;

  private readonly maxPoints: number;
  private active = false;
  private currentActiveCount = 0;

  constructor(maxPoints: number) {
    this.maxPoints = maxPoints;
    const vertCount = maxPoints * 2; // 2 verts per point (left/right)
    const idxCount = (maxPoints - 1) * 6;

    this.posData = new Float32Array(vertCount * 2);
    this.uvData = new Float32Array(vertCount * 2);
    this.indexData = new Uint32Array(idxCount);

    // Start with empty indices (no triangles)
    this.indexData.fill(0);

    this.geometry = new MeshGeometry({
      positions: this.posData,
      uvs: this.uvData,
      indices: this.indexData,
    });

    const program = new GlProgram({ vertex: RIBBON_VERT, fragment: RIBBON_FRAG });

    // Blank 1×1 texture — our shader ignores it, we render via per-vertex alpha
    const blankTex = Texture.WHITE;
    this.mesh = new Mesh({
      geometry: this.geometry,
      shader: new Shader({ glProgram: program }),
      texture: blankTex,
    } as any);

    this.container.addChild(this.mesh);
    this.mesh.visible = false;
  }

  /**
   * Rebuild the ribbon triangle-strip for this frame.
   *
   * @param points  Centre-line points (at least 2).
   * @param widths  Half-width at each point (parallel to `points`).
   * @param alphas  Opacity at each point (0–1, parallel to `points`).
   * @param color   Tint colour (hex, e.g. 0x4499ff).
   * @param tintAlpha  Overall tint alpha multiplier (0–1).
   */
  update(
    points: PointData[],
    widths: number[],
    alphas: number[],
    color: number,
    tintAlpha = 1
  ): void {
    const n = Math.min(points.length, this.maxPoints);
    if (n < 2) {
      if (this.active) {
        this.mesh.visible = false;
        this.active = false;
      }
      return;
    }

    this.active = true;
    this.mesh.visible = true;
    (this.mesh as any).tint = color;
    (this.mesh as any).alpha = tintAlpha;

    const pos = this.posData;
    const uv = this.uvData;

    for (let i = 0; i < n; i++) {
      const p = points[i];
      const hw = widths[i] ?? 4;
      const a = alphas[i] ?? 0;

      // Perpendicular offset for ribbon width
      let perpX = 0;
      let perpY = 0;
      if (i < n - 1) {
        const dx = points[i + 1].x - p.x;
        const dy = points[i + 1].y - p.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        perpX = (-dy / len) * hw;
        perpY = (dx / len) * hw;
      } else if (i > 0) {
        const dx = p.x - points[i - 1].x;
        const dy = p.y - points[i - 1].y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        perpX = (-dy / len) * hw;
        perpY = (dx / len) * hw;
      }

      const vi = i * 4;
      // Left vertex
      pos[vi + 0] = p.x + perpX;
      pos[vi + 1] = p.y + perpY;
      // Right vertex
      pos[vi + 2] = p.x - perpX;
      pos[vi + 3] = p.y - perpY;

      // UV.x = position along trail (0→1), UV.y = per-vertex alpha
      const along = i / (n - 1);
      uv[vi + 0] = along;
      uv[vi + 1] = a;
      uv[vi + 2] = along;
      uv[vi + 3] = a;
    }

    // Collapse ALL remaining vertices to a single point (center of last pair)
    // so degenerate triangles have zero area AND zero width → invisible.
    if (n > 0) {
      const lastVi = (n - 1) * 4;
      const cx = (pos[lastVi + 0] + pos[lastVi + 2]) * 0.5;
      const cy = (pos[lastVi + 1] + pos[lastVi + 3]) * 0.5;
      const lastU = uv[lastVi];
      for (let i = n; i < this.maxPoints; i++) {
        const vi = i * 4;
        pos[vi + 0] = cx;
        pos[vi + 1] = cy;
        pos[vi + 2] = cx;
        pos[vi + 3] = cy;
        uv[vi + 0] = lastU;
        uv[vi + 1] = 0;
        uv[vi + 2] = lastU;
        uv[vi + 3] = 0;
      }
    }

    // Rebuild index buffer to ONLY cover active points.
    // This prevents GPU from rasterizing degenerate triangles.
    const neededQuads = n - 1;
    const neededIdx = neededQuads * 6;
    if (neededIdx !== this.currentActiveCount * 6) {
      // Reset all indices to 0 (degenerate)
      this.indexData.fill(0);
      for (let i = 0; i < neededQuads; i++) {
        const vi = i * 2;
        const ii = i * 6;
        this.indexData[ii + 0] = vi;
        this.indexData[ii + 1] = vi + 1;
        this.indexData[ii + 2] = vi + 2;
        this.indexData[ii + 3] = vi + 2;
        this.indexData[ii + 4] = vi + 1;
        this.indexData[ii + 5] = vi + 3;
      }
      this.geometry.getIndex().update();
      this.currentActiveCount = neededQuads;
    }

    // Mark buffers dirty → PixiJS re-uploads to GPU
    this.geometry.getBuffer("aPosition").update();
    this.geometry.getBuffer("aUV").update();
  }

  clear(): void {
    this.active = false;
    this.mesh.visible = false;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
