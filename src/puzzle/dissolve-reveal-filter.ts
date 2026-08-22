import { Filter, GlProgram, GpuProgram, Texture, UniformGroup } from "pixi.js";

const FILTER_VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(vec2 position)
{
    vec2 outputPosition = position * uOutputFrame.zw + uOutputFrame.xy;
    outputPosition.x = outputPosition.x * (2.0 / uOutputTexture.x) - 1.0;
    outputPosition.y = outputPosition.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(outputPosition, 0.0, 1.0);
}

vec2 filterTextureCoord(vec2 position)
{
    return position * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
    gl_Position = filterVertexPosition(aPosition);
    vTextureCoord = filterTextureCoord(aPosition);
}
`;

const FILTER_FRAGMENT = `
in vec2 vTextureCoord;

uniform sampler2D uTexture;
uniform sampler2D uNoiseTexture;
uniform float uProgress;
uniform float uSeed;
uniform float uNoiseScale;
uniform float uEdgeWidth;
uniform vec4 uEdgeColor;
uniform float uEdgeIntensity;
uniform float uEdgeOnly;

out vec4 finalColor;

void main(void)
{
    vec4 source = texture(uTexture, vTextureCoord);
    vec2 baseUv = fract(vTextureCoord * uNoiseScale + vec2(uSeed * 0.37, uSeed * 0.19));
    vec2 detailUv = fract(baseUv * 2.17 + vec2(0.13 + uSeed * 0.11, 0.31 + uSeed * 0.07));
    float broadNoise = texture(uNoiseTexture, baseUv).r;
    float detailNoise = texture(uNoiseTexture, detailUv).r;
    float field = mix(broadNoise, detailNoise, 0.34);
    float width = max(0.012, uEdgeWidth);
    float reveal = smoothstep(field - width, field + width, uProgress);
    float edge = 1.0 - smoothstep(width * 0.72, width * 2.8, abs(uProgress - field));

    if (uEdgeOnly > 0.5) {
        float edgeAlpha = source.a * edge * uEdgeIntensity;
        finalColor = vec4(uEdgeColor.rgb * edgeAlpha, edgeAlpha);
        return;
    }

    vec3 rgb = source.rgb + uEdgeColor.rgb * edge * uEdgeIntensity * source.a;
    finalColor = vec4(rgb * reveal, source.a * reveal);
}
`;

const FILTER_WGSL = `
struct GlobalFilterUniforms {
  uInputSize:vec4<f32>,
  uInputPixel:vec4<f32>,
  uInputClamp:vec4<f32>,
  uOutputFrame:vec4<f32>,
  uGlobalFrame:vec4<f32>,
  uOutputTexture:vec4<f32>,
};

struct DissolveUniforms {
  uProgress:f32,
  uSeed:f32,
  uNoiseScale:f32,
  uEdgeWidth:f32,
  uEdgeColor:vec4<f32>,
  uEdgeIntensity:f32,
  uEdgeOnly:f32,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(0) var<uniform> dissolveUniforms: DissolveUniforms;
@group(1) @binding(1) var uNoiseTexture: texture_2d<f32>;

struct VSOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

fn filterVertexPosition(position: vec2<f32>) -> vec4<f32>
{
  var outputPosition = position * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;
  outputPosition.x = outputPosition.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
  outputPosition.y = outputPosition.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;
  return vec4(outputPosition, 0.0, 1.0);
}

fn filterTextureCoord(position: vec2<f32>) -> vec2<f32>
{
  return position * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);
}

@vertex
fn mainVertex(@location(0) aPosition: vec2<f32>) -> VSOutput
{
  return VSOutput(
    filterVertexPosition(aPosition),
    filterTextureCoord(aPosition)
  );
}

@fragment
fn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32>
{
  let source = textureSample(uTexture, uSampler, uv);
  let baseUv = fract(uv * dissolveUniforms.uNoiseScale + vec2(dissolveUniforms.uSeed * 0.37, dissolveUniforms.uSeed * 0.19));
  let detailUv = fract(baseUv * 2.17 + vec2(0.13 + dissolveUniforms.uSeed * 0.11, 0.31 + dissolveUniforms.uSeed * 0.07));
  let broadNoise = textureSample(uNoiseTexture, uSampler, baseUv).r;
  let detailNoise = textureSample(uNoiseTexture, uSampler, detailUv).r;
  let field = mix(broadNoise, detailNoise, 0.34);
  let width = max(0.012, dissolveUniforms.uEdgeWidth);
  let reveal = smoothstep(field - width, field + width, dissolveUniforms.uProgress);
  let edge = 1.0 - smoothstep(width * 0.72, width * 2.8, abs(dissolveUniforms.uProgress - field));

  if (dissolveUniforms.uEdgeOnly > 0.5) {
    let edgeAlpha = source.a * edge * dissolveUniforms.uEdgeIntensity;
    return vec4(dissolveUniforms.uEdgeColor.rgb * edgeAlpha, edgeAlpha);
  }

  let rgb = source.rgb + dissolveUniforms.uEdgeColor.rgb * edge * dissolveUniforms.uEdgeIntensity * source.a;
  return vec4(rgb * reveal, source.a * reveal);
}
`;

type DissolveUniformStructure = {
  uProgress: { value: number; type: "f32" };
  uSeed: { value: number; type: "f32" };
  uNoiseScale: { value: number; type: "f32" };
  uEdgeWidth: { value: number; type: "f32" };
  uEdgeColor: { value: [number, number, number, number]; type: "vec4<f32>" };
  uEdgeIntensity: { value: number; type: "f32" };
  uEdgeOnly: { value: number; type: "f32" };
};

/**
 * A small, per-piece dissolve material. It is intentionally kept on the
 * artwork sprite only; the piece container remains the source of truth for
 * position, pivot, scale and rotation.
 */
export class DissolveRevealFilter extends Filter {
  private readonly uniforms: UniformGroup<DissolveUniformStructure>;

  constructor(noiseTexture: Texture, seed: number, edgeOnly = false) {
    const uniforms = new UniformGroup<DissolveUniformStructure>({
      uProgress: { value: 0, type: "f32" },
      uSeed: { value: Math.max(0.001, Math.min(0.999, seed)), type: "f32" },
      uNoiseScale: { value: 1.18 + seed * 0.62, type: "f32" },
      uEdgeWidth: { value: 0.075 + seed * 0.025, type: "f32" },
      uEdgeColor: { value: [1, 0.67, 0.24, 1], type: "vec4<f32>" },
      uEdgeIntensity: { value: edgeOnly ? 1 : 0.22, type: "f32" },
      uEdgeOnly: { value: edgeOnly ? 1 : 0, type: "f32" }
    });

    const glProgram = GlProgram.from({
      vertex: FILTER_VERTEX,
      fragment: FILTER_FRAGMENT,
      name: "piano-puzzle-dissolve-reveal"
    });
    const gpuProgram = GpuProgram.from({
      vertex: { source: FILTER_WGSL, entryPoint: "mainVertex" },
      fragment: { source: FILTER_WGSL, entryPoint: "mainFragment" },
      name: "piano-puzzle-dissolve-reveal"
    });

    super({
      glProgram,
      gpuProgram,
      padding: 2,
      resources: {
        dissolveUniforms: uniforms,
        uNoiseTexture: noiseTexture.source
      }
    });

    this.uniforms = uniforms;
  }

  set progress(value: number) {
    this.uniforms.uniforms.uProgress = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  }

  set edgeIntensity(value: number) {
    this.uniforms.uniforms.uEdgeIntensity = Math.max(0, Number.isFinite(value) ? value : 0);
  }

  set edgeOnly(value: boolean) {
    this.uniforms.uniforms.uEdgeOnly = value ? 1 : 0;
  }
}
