// Fine-zoom ("level 0") compute pass. Scans the raw channel samples directly,
// one (min, max) per pixel column into colMinMax. This is only used when the
// number of samples per pixel is small enough that the inner loop stays cheap
// (see COLUMN_LOOP_BUDGET in GPUWaveformRenderer). At higher zoom-out the
// renderer switches to waveformPyramidComputeShader, which reads a pre-reduced
// LOD level instead of looping over every raw sample.
export const waveformComputeShader = /* wgsl */ `

struct Uniforms {
  scaleFactor: f32,
  width: f32,
  height: f32,
  offset: i32,
  bufferLength: i32, // raw channel sample count
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> channelData: array<f32>;
@group(0) @binding(2) var<storage, read_write> colMinMax: array<vec2f>;

@compute @workgroup_size(64)
fn computeMain(@builtin(global_invocation_id) gid: vec3u) {
  let x = gid.x;
  if (f32(x) >= uniforms.width) {
    return;
  }

  let samplesPerPixel = uniforms.scaleFactor;
  let index = i32(floor(f32(x) * samplesPerPixel));
  let base = uniforms.offset + index;

  if (base < 0 || base >= uniforms.bufferLength) {
    colMinMax[x] = vec2f(0.0, 0.0);
    return;
  }

  let first = channelData[base];
  var minV = first;
  var maxV = first;

  // Cap the loop so we never read past the channel buffer.
  let remaining = uniforms.bufferLength - base - 1;
  let loopMax = min(i32(samplesPerPixel), remaining);
  for (var i = 1; i <= loopMax; i++) {
    let v = channelData[base + i];
    minV = min(minV, v);
    maxV = max(maxV, v);
  }
  colMinMax[x] = vec2f(minV, maxV);
}
`;

// High-zoom-out ("LOD") compute pass. Instead of scanning raw samples, it reads
// a pre-computed min/max pyramid level whose bins each summarize `binSize` raw
// samples. The renderer picks the finest level for which a pixel column spans
// at most ~COLUMN_LOOP_BUDGET bins, so this loop stays bounded no matter how
// far the user zooms out.
//
// Because pyramid bins are aligned to multiples of `binSize`, a column's
// min/max envelope can over-cover by up to one bin on each edge. binSize is
// chosen to be roughly samplesPerPixel / COLUMN_LOOP_BUDGET, so that slop is a
// tiny fraction of a column and is visually imperceptible (and conservative —
// the envelope only ever grows, never clips).
export const waveformPyramidComputeShader = /* wgsl */ `

struct Uniforms {
  scaleFactor: f32,
  width: f32,
  height: f32,
  offset: i32,
  bufferLength: i32, // raw channel sample count
};

// Describes the selected pyramid level. Padded to 16 bytes for uniform layout.
struct LodParams {
  binSize: u32,     // raw samples summarized by each bin of this level
  levelLength: u32, // number of bins in this level
  _pad0: u32,
  _pad1: u32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> levelData: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> colMinMax: array<vec2f>;
@group(0) @binding(3) var<uniform> lod: LodParams;

@compute @workgroup_size(64)
fn computeMain(@builtin(global_invocation_id) gid: vec3u) {
  let x = gid.x;
  if (f32(x) >= uniforms.width) {
    return;
  }

  let samplesPerPixel = uniforms.scaleFactor;
  let index = i32(floor(f32(x) * samplesPerPixel));
  let startSample = uniforms.offset + index;

  if (startSample < 0 || startSample >= uniforms.bufferLength) {
    colMinMax[x] = vec2f(0.0, 0.0);
    return;
  }

  // Raw sample range [startSample, endSample) covered by this column.
  let endSample = min(startSample + i32(samplesPerPixel), uniforms.bufferLength);

  // Map that range onto bins of the selected level, clamped to the level.
  let binSize = i32(lod.binSize);
  let lastBin = i32(lod.levelLength) - 1;
  let b0 = clamp(startSample / binSize, 0, lastBin);
  let b1 = clamp((endSample - 1) / binSize, 0, lastBin);

  let firstBin = levelData[b0];
  var minV = firstBin.x;
  var maxV = firstBin.y;
  for (var b = b0 + 1; b <= b1; b++) {
    let cur = levelData[b];
    minV = min(minV, cur.x);
    maxV = max(maxV, cur.y);
  }
  colMinMax[x] = vec2f(minV, maxV);
}
`;

export const waveformShader = /* wgsl */ `

struct Uniforms {
  scaleFactor: f32,
  width: f32,
  height: f32,
  offset: i32, // no negative offsets
  bufferLength: i32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> colMinMax: array<vec2f>;
@group(0) @binding(2) var<uniform> waveformColor: vec4f;

struct VertexOutput {
  @builtin(position) pos: vec4f,
};

@vertex
fn vertexMain(
  @location(0) pos: vec2f,
) -> VertexOutput {
  var output: VertexOutput;
  output.pos = vec4f(pos, 0, 1);
  return output;
}

struct FragInput {
  @builtin(position) fragCoord: vec4f,
};

@fragment
fn fragmentMain(input: FragInput) -> @location(0) vec4f {
  let x = u32(input.fragCoord.x);
  let mm = colMinMax[x];
  let min_sample = mm.x;
  let max_sample = mm.y;

  // PCM is -1 to 1; -1 is down and 1 is up
  let yPosNorm = -1.0 * (2.0 * (input.fragCoord.y / uniforms.height) - 1.0);

  let epsilon = 1.0 / uniforms.height;
  let insideWaveform = (yPosNorm <= max_sample + epsilon && yPosNorm >= min_sample - epsilon);

  return select(
    vec4f(0.0, 0.0, 0.0, 0.0),
    waveformColor,
    insideWaveform
  );
}
`;
