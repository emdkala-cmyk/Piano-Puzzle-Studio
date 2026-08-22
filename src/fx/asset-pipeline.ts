import { Assets, Texture } from "pixi.js";
import {
  FX_TEXTURE_IDS,
  type FxAssetDescriptor,
  type FxExternalAssetMetadata,
  type FxTextureId
} from "./fx-asset-types";
import { SeededRandom } from "./seeded-random";

const DESCRIPTORS: Record<FxTextureId, FxAssetDescriptor> = {
  "smoke-wisp-01": {
    id: "smoke-wisp-01",
    type: "smoke",
    source: "procedural",
    license: "Project-owned procedural texture",
    commercialUse: true,
    procedural: true,
    atlasGroup: "smoke",
    fallbackId: "smoke-cloud-01",
    width: 128,
    height: 128,
    notes: "Irregular multi-lobe smoke silhouette with layered deterministic noise."
  },
  "smoke-wisp-02": {
    id: "smoke-wisp-02",
    type: "smoke",
    source: "procedural",
    license: "Project-owned procedural texture",
    commercialUse: true,
    procedural: true,
    atlasGroup: "smoke",
    fallbackId: "smoke-wisp-01",
    width: 128,
    height: 128,
    notes: "Asymmetric smoke variant with a visibly different broken edge."
  },
  "smoke-cloud-01": {
    id: "smoke-cloud-01",
    type: "smoke",
    source: "procedural",
    license: "Project-owned procedural texture",
    commercialUse: true,
    procedural: true,
    atlasGroup: "smoke",
    fallbackId: "smoke-wisp-01",
    width: 160,
    height: 160,
    notes: "Wide low-alpha cloud used as a secondary depth layer."
  },
  "ember-small": {
    id: "ember-small",
    type: "ember",
    source: "procedural",
    license: "Project-owned procedural texture",
    commercialUse: true,
    procedural: true,
    atlasGroup: "particle",
    fallbackId: "dust-mote",
    width: 32,
    height: 32,
    notes: "Soft warm ember with uneven alpha and bright core."
  },
  "spark-cross": {
    id: "spark-cross",
    type: "ember",
    source: "procedural",
    license: "Project-owned procedural texture",
    commercialUse: true,
    procedural: true,
    atlasGroup: "particle",
    fallbackId: "ember-small",
    width: 48,
    height: 48,
    notes: "Broken four-point sparkle for lock impacts."
  },
  "dust-mote": {
    id: "dust-mote",
    type: "dust",
    source: "procedural",
    license: "Project-owned procedural texture",
    commercialUse: true,
    procedural: true,
    atlasGroup: "particle",
    fallbackId: "ember-small",
    width: 24,
    height: 24,
    notes: "Tiny asymmetrical dust mote, not a geometric disk."
  },
  "soft-bokeh": {
    id: "soft-bokeh",
    type: "bokeh",
    source: "procedural",
    license: "Project-owned procedural texture",
    commercialUse: true,
    procedural: true,
    atlasGroup: "particle",
    fallbackId: "dust-mote",
    width: 96,
    height: 96,
    notes: "Broken soft highlight reserved for high-note shimmer."
  },
  "light-streak": {
    id: "light-streak",
    type: "streak",
    source: "procedural",
    license: "Project-owned procedural texture",
    commercialUse: true,
    procedural: true,
    atlasGroup: "particle",
    fallbackId: "soft-bokeh",
    width: 256,
    height: 48,
    notes: "Tapered irregular streak reserved for the future ribbon emitter."
  },
  "dissolve-noise": {
    id: "dissolve-noise",
    type: "noise-mask",
    source: "procedural",
    license: "Project-owned procedural texture",
    commercialUse: true,
    procedural: true,
    atlasGroup: "mask",
    fallbackId: "dust-mote",
    width: 128,
    height: 128,
    notes: "Deterministic grayscale noise reserved for Dissolve Reveal."
  }
};

type TexturePainter = (context: CanvasRenderingContext2D, width: number, height: number, random: SeededRandom) => void;

export class FxAssetPipeline {
  private readonly textures = new Map<FxTextureId, Texture>();
  private readonly previewSources = new Map<FxTextureId, HTMLCanvasElement>();
  private readonly ownedTextures = new Set<Texture>();
  private readonly descriptors = new Map<FxTextureId, FxAssetDescriptor>(
    FX_TEXTURE_IDS.map((id) => [id, { ...DESCRIPTORS[id] }])
  );
  private initialized = false;

  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;
    for (const id of FX_TEXTURE_IDS) {
      const descriptor = this.descriptors.get(id) ?? DESCRIPTORS[id];
      const result = this.createProceduralTexture(descriptor);
      this.textures.set(id, result.texture);
      if (result.canvas) this.previewSources.set(id, result.canvas);
      if (result.texture !== Texture.WHITE) this.ownedTextures.add(result.texture);
    }
  }

  getTexture(id: FxTextureId): Texture {
    const descriptor = this.descriptors.get(id) ?? DESCRIPTORS[id];
    return this.textures.get(id) ?? this.textures.get(descriptor.fallbackId) ?? Texture.WHITE;
  }

  getDescriptor(id: FxTextureId): FxAssetDescriptor {
    return this.descriptors.get(id) ?? DESCRIPTORS[id];
  }

  getManifest(): FxAssetDescriptor[] {
    return FX_TEXTURE_IDS.map((id) => ({ ...(this.descriptors.get(id) ?? DESCRIPTORS[id]) }));
  }

  /**
   * Replaces a procedural slot with an externally supplied licensed texture.
   * The particle engine continues to address the same FxTextureId.
   */
  registerExternalTexture(
    id: FxTextureId,
    texture: Texture,
    metadata: FxExternalAssetMetadata,
    owned = false
  ): void {
    if (!metadata.license.trim() || metadata.commercialUse !== true) {
      throw new Error(`FX asset "${id}" requires a declared license and commercialUse=true.`);
    }

    this.initialize();

    const previous = this.textures.get(id);
    if (previous && this.ownedTextures.has(previous) && previous !== texture) {
      previous.destroy(true);
      this.ownedTextures.delete(previous);
    }

    const current = this.getDescriptor(id);
    this.descriptors.set(id, {
      ...current,
      ...metadata,
      id,
      source: metadata.source ?? "user",
      procedural: false,
      type: metadata.type ?? current.type,
      atlasGroup: metadata.atlasGroup ?? current.atlasGroup,
      fallbackId: metadata.fallbackId ?? current.fallbackId,
      width: texture.width || current.width,
      height: texture.height || current.height,
      notes: metadata.notes ?? `External replacement for ${id}.`
    });
    this.textures.set(id, texture);
    this.previewSources.delete(id);
    if (owned) this.ownedTextures.add(texture);
  }

  /**
   * Loads a licensed PNG/WebP through Pixi's asset cache and registers it in
   * the existing slot. Callers own the returned external texture by default.
   */
  async loadExternalTexture(
    id: FxTextureId,
    url: string,
    metadata: FxExternalAssetMetadata
  ): Promise<Texture> {
    const texture = await Assets.load<Texture>(url);
    this.registerExternalTexture(id, texture, metadata, false);
    return texture;
  }

  createDebugGallery(): HTMLDivElement | undefined {
    if (typeof document === "undefined") return undefined;
    const gallery = document.createElement("div");
    gallery.dataset.fxAssetGallery = "true";
    gallery.className = "fx-asset-gallery";
    const heading = document.createElement("div");
    heading.className = "fx-dom-heading";
    heading.textContent = "Asset Preview Gallery / Sprite Variations";
    gallery.appendChild(heading);
    for (const id of FX_TEXTURE_IDS) {
      const source = this.previewSources.get(id);
      if (!source) continue;
      const card = document.createElement("div");
      card.className = "fx-asset-preview-card";
      const label = document.createElement("small");
      label.textContent = `${id} · ${this.getDescriptor(id).license}`;
      const preview = document.createElement("canvas");
      preview.width = 160;
      preview.height = 88;
      const context = preview.getContext("2d");
      if (context) {
        context.fillStyle = "#0a0e20";
        context.fillRect(0, 0, preview.width, preview.height);
        const positions = [
          { x: 34, y: 46, rotation: -0.18, alpha: 0.52, scale: 0.8, flip: false },
          { x: 82, y: 40, rotation: 0.08, alpha: 0.82, scale: 0.68, flip: true },
          { x: 128, y: 49, rotation: 0.24, alpha: 0.38, scale: 0.56, flip: false }
        ];
        const fitScale = Math.min(1, 42 / Math.max(source.width, source.height));
        for (const sample of positions) {
          context.save();
          context.translate(sample.x, sample.y);
          context.rotate(sample.rotation);
          context.scale(sample.flip ? -1 : 1, 1);
          context.globalAlpha = sample.alpha;
          const width = source.width * fitScale * sample.scale;
          const height = source.height * fitScale * sample.scale;
          context.drawImage(source, -width / 2, -height / 2, width, height);
          context.restore();
        }
      }
      card.append(preview, label);
      gallery.appendChild(card);
    }
    return gallery;
  }

  dispose(): void {
    for (const texture of this.ownedTextures) texture.destroy(true);
    this.ownedTextures.clear();
    this.previewSources.clear();
    this.textures.clear();
    this.descriptors.clear();
    for (const id of FX_TEXTURE_IDS) {
      this.descriptors.set(id, { ...DESCRIPTORS[id] });
    }
    this.initialized = false;
  }

  private createProceduralTexture(descriptor: FxAssetDescriptor): { texture: Texture; canvas?: HTMLCanvasElement } {
    if (typeof document === "undefined") return { texture: Texture.WHITE };
    const canvas = document.createElement("canvas");
    canvas.width = descriptor.width;
    canvas.height = descriptor.height;
    const context = canvas.getContext("2d");
    if (!context) return { texture: Texture.WHITE };
    this.painterFor(descriptor.id)(context, descriptor.width, descriptor.height, new SeededRandom(descriptor.id));
    return { texture: Texture.from(canvas), canvas };
  }

  private painterFor(id: FxTextureId): TexturePainter {
    if (id === "smoke-wisp-01") return (context, width, height, random) => paintSmoke(context, width, height, random, 1);
    if (id === "smoke-wisp-02") return (context, width, height, random) => paintSmoke(context, width, height, random, 2);
    if (id === "smoke-cloud-01") return paintCloud;
    if (id === "ember-small") return paintEmber;
    if (id === "spark-cross") return paintSpark;
    if (id === "dust-mote") return paintDust;
    if (id === "soft-bokeh") return paintBokeh;
    if (id === "light-streak") return paintStreak;
    return paintNoise;
  }
}

function paintSmoke(context: CanvasRenderingContext2D, width: number, height: number, _random: SeededRandom, variant: number): void {
  const image = context.createImageData(width, height);
  paintAlphaField(image, width, height, (x, y) => {
    const nx = x / width;
    const ny = y / height;
    const density = organicSmokeField(nx, ny, variant);
    const illumination = 0.82 + fractalNoise(nx * 5.2 + 1.5, ny * 5.2 + 2.1, variant + 41) * 0.18;
    return Math.min(1, Math.pow(density, 0.9) * illumination * 0.78);
  }, variant === 1 ? [239, 231, 214] : [228, 225, 219]);
  context.putImageData(image, 0, 0);
}

function paintCloud(context: CanvasRenderingContext2D, width: number, height: number): void {
  const image = context.createImageData(width, height);
  paintAlphaField(image, width, height, (x, y) => {
    const nx = x / width;
    const ny = y / height;
    const density = organicSmokeField(nx * 0.92 + 0.04, ny * 0.9 + 0.05, 7);
    const broadening = 0.72 + 0.28 * Math.sin(nx * Math.PI);
    return Math.min(1, Math.pow(density, 1.08) * broadening * 0.52);
  }, [222, 224, 220]);
  context.putImageData(image, 0, 0);
}

function paintEmber(context: CanvasRenderingContext2D, width: number, height: number): void {
  const image = context.createImageData(width, height);
  paintAlphaField(image, width, height, (x, y) => {
    const nx = x / width - 0.5;
    const ny = y / height - 0.5;
    const radius = Math.hypot(nx, ny);
    const angle = Math.atan2(ny, nx);
    const noise = fractalNoise(x / width * 7, y / height * 7, 5);
    const contour = 0.27 + Math.sin(angle * 3 + noise * 2.4) * 0.045 + noise * 0.035;
    const edge = Math.max(0, Math.min(1, (contour - radius) * 8.2));
    const core = Math.pow(edge, 1.6);
    const flicker = 0.56 + fractalNoise(x / width * 13, y / height * 13, 15) * 0.44;
    return Math.max(0, Math.min(1, core * flicker));
  }, [255, 221, 126]);
  context.putImageData(image, 0, 0);
}

function paintSpark(context: CanvasRenderingContext2D, width: number, height: number): void {
  const image = context.createImageData(width, height);
  paintAlphaField(image, width, height, (x, y) => {
    const dx = Math.abs(x - width * 0.5);
    const dy = Math.abs(y - height * 0.5);
    const noise = fractalNoise(x / width * 8, y / height * 8, 11);
    const horizontal = Math.exp(-dx * 0.42) * Math.exp(-dy * 0.1);
    const vertical = Math.exp(-dy * 0.42) * Math.exp(-dx * 0.1);
    return Math.min(1, Math.max(horizontal, vertical) * (0.64 + noise * 0.36));
  }, [255, 247, 210]);
  context.putImageData(image, 0, 0);
}

function paintDust(context: CanvasRenderingContext2D, width: number, height: number): void {
  const image = context.createImageData(width, height);
  paintAlphaField(image, width, height, (x, y) => {
    const nx = x / width - 0.48;
    const ny = y / height - 0.55;
    const noise = fractalNoise(x / width * 8, y / height * 8, 23);
    const warpX = (fractalNoise(x / width * 4.4 + 3, y / height * 4.4, 29) - 0.5) * 0.16;
    const warpY = (fractalNoise(x / width * 4.4 + 8, y / height * 4.4, 33) - 0.5) * 0.12;
    const dx = (nx + warpX) / (0.3 + noise * 0.05);
    const dy = (ny + warpY) / (0.22 + noise * 0.04);
    const asymmetry = 0.6 + 0.4 * Math.max(0, Math.cos(Math.atan2(dy, dx) * 2.2 + noise * 3));
    return Math.max(0, Math.min(1, Math.exp(-(dx * dx + dy * dy) * 2.5) * asymmetry * (0.42 + noise * 0.58)));
  }, [241, 236, 216]);
  context.putImageData(image, 0, 0);
}

function paintBokeh(context: CanvasRenderingContext2D, width: number, height: number): void {
  const image = context.createImageData(width, height);
  paintAlphaField(image, width, height, (x, y) => {
    const distance = Math.hypot(x - width * 0.5, y - height * 0.5) / (width * 0.5);
    const angle = Math.atan2(y - height * 0.5, x - width * 0.5);
    const noise = fractalNoise(x / width * 6, y / height * 6, 31);
    const brokenRing = 0.48 + 0.22 * Math.sin(angle * 5 + noise * 4.2);
    const ring = Math.exp(-Math.pow(distance - brokenRing, 2) * 28) * (0.16 + noise * 0.26);
    const core = Math.pow(Math.max(0, 1 - distance * 1.12), 2.4) * (0.28 + noise * 0.18);
    return Math.min(1, Math.max(0, ring + core));
  }, [255, 244, 192]);
  context.putImageData(image, 0, 0);
}

function paintStreak(context: CanvasRenderingContext2D, width: number, height: number): void {
  const image = context.createImageData(width, height);
  paintAlphaField(image, width, height, (x, y) => {
    const nx = x / width;
    const ny = y / height;
    const noise = fractalNoise(nx * 8, ny * 5, 43);
    const center = 0.5 + Math.sin(nx * 8 + noise * 2.8) * 0.085;
    const widthFactor = 0.025 + Math.sin(nx * Math.PI) * 0.05;
    const vertical = Math.abs(ny - center) / Math.max(0.012, widthFactor);
    const taper = Math.pow(Math.max(0, Math.sin(nx * Math.PI)), 0.72);
    const breakup = 0.42 + noise * 0.58;
    return Math.max(0, Math.min(1, Math.exp(-vertical * vertical * 0.72) * taper * breakup));
  }, [255, 239, 168]);
  context.putImageData(image, 0, 0);
}

function organicSmokeField(nx: number, ny: number, variant: number): number {
  const seed = variant * 17 + 3;
  const warpX = (fractalNoise(nx * 3.1 + variant * 0.7, ny * 3.7 + 1.2, seed + 4) - 0.5) * 0.2;
  const warpY = (fractalNoise(nx * 3.4 + 2.6, ny * 3.1 + variant * 0.9, seed + 9) - 0.5) * 0.2;
  const u = nx + warpX;
  const v = ny + warpY;
  const flowNoise = fractalNoise(u * 2.2 + 1.3, v * 2.8 + 2.1, seed + 15);
  const center = 0.48 + Math.sin(v * 8.4 + variant * 1.7 + flowNoise * 2.4) * 0.14;
  const spineWidth = 0.11 + (0.5 + 0.5 * Math.sin(v * 5.6 + variant)) * 0.1;
  const spine = Math.exp(-Math.pow((u - center) / Math.max(0.035, spineWidth), 2) * 1.55);

  const lobeA = rotatedGaussian(u, v, 0.34 + variant * 0.012, 0.34, 0.2, 0.17, -0.38 + variant * 0.08);
  const lobeB = rotatedGaussian(u, v, 0.62 - variant * 0.01, 0.38, 0.24, 0.19, 0.46 - variant * 0.06);
  const lobeC = rotatedGaussian(u, v, 0.4, 0.58, 0.22, 0.2, 0.22 + variant * 0.04);
  const lobeD = rotatedGaussian(u, v, 0.67, 0.67, 0.19, 0.24, -0.5 + variant * 0.05);
  const lobeE = rotatedGaussian(u, v, 0.5, 0.78, 0.14, 0.19, 0.12);
  const tendril = Math.exp(-Math.pow((u - center - Math.sin(v * 17 + flowNoise * 4) * 0.055) / 0.035, 2)) * (0.34 + 0.66 * (1 - v));
  const lobes = lobeA * 0.68 + lobeB * 0.7 + lobeC * 0.62 + lobeD * 0.58 + lobeE * 0.46;
  const breakup = 0.36 + fractalNoise(u * 8.5 + 2.4, v * 9.2 + 1.1, seed + 21) * 0.92;
  const cavities = fractalNoise(u * 13.5 + 5.8, v * 12.4 + 4.2, seed + 31);
  const verticalFade = Math.exp(-Math.pow((v - 0.52) / 0.62, 6));
  const density = (lobes + spine * 0.62 + tendril * 0.38) * breakup * (0.94 - cavities * 0.28) * verticalFade;
  return Math.max(0, Math.min(1, density * 0.76));
}

function rotatedGaussian(x: number, y: number, centerX: number, centerY: number, radiusX: number, radiusY: number, angle: number): number {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const dx = x - centerX;
  const dy = y - centerY;
  const rotatedX = dx * cosine + dy * sine;
  const rotatedY = -dx * sine + dy * cosine;
  return Math.exp(-((rotatedX * rotatedX) / (radiusX * radiusX) + (rotatedY * rotatedY) / (radiusY * radiusY)) * 1.42);
}

function paintNoise(context: CanvasRenderingContext2D, width: number, height: number, random: SeededRandom): void {
  const image = context.createImageData(width, height);
  for (let index = 0; index < image.data.length; index += 4) {
    const value = Math.floor(random.nextFloat() * 255);
    image.data[index] = value;
    image.data[index + 1] = value;
    image.data[index + 2] = value;
    image.data[index + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}

function fractalNoise(x: number, y: number, seed: number): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let totalAmplitude = 0;
  for (let octave = 0; octave < 4; octave += 1) {
    value += valueNoise(x * frequency, y * frequency, seed + octave * 17) * amplitude;
    totalAmplitude += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / totalAmplitude;
}

function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothFraction(x - x0);
  const ty = smoothFraction(y - y0);
  const a = hashUnit(x0, y0, seed);
  const b = hashUnit(x0 + 1, y0, seed);
  const c = hashUnit(x0, y0 + 1, seed);
  const d = hashUnit(x0 + 1, y0 + 1, seed);
  return mix(mix(a, b, tx), mix(c, d, tx), ty);
}

function hashUnit(x: number, y: number, seed: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

function smoothFraction(value: number): number {
  return value * value * (3 - value * 2);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function paintAlphaField(
  image: ImageData,
  width: number,
  height: number,
  field: (x: number, y: number) => number,
  color: [number, number, number] = [255, 255, 255]
): void {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      image.data[index] = color[0];
      image.data[index + 1] = color[1];
      image.data[index + 2] = color[2];
      image.data[index + 3] = Math.floor(Math.max(0, Math.min(1, field(x, y))) * 255);
    }
  }
}
