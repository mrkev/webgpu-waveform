export const waveformComputeShader = /* wgsl */ `

struct Uniforms {
  scaleFactor: f32,
  width: f32,
  height: f32,
  offset: i32,
  bufferLength: i32,
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
