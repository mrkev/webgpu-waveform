export const waveformShader = /* wgsl */ `

struct VertexInput {
  @location(0) pos: vec2f,
  @builtin(instance_index) instance: u32,
};

struct VertexOutput {
  @builtin(position) pos: vec4f,
  @location(0) cell: vec2f,
};

@group(0) @binding(0) var<uniform> uniforms: vec4f;
@group(0) @binding(1) var<storage> channelData: array<f32>;
@group(0) @binding(2) var<uniform> waveformColor: vec4f;

@vertex
fn vertexMain(
  @location(0) pos: vec2f,
  @builtin(instance_index) instance: u32
) -> VertexOutput {
  var output: VertexOutput;
  output.pos = vec4f(pos, 0, 1);
  output.cell = vec2f(0, 0); // unused
  return output;
}

struct FragInput {
  @location(0) cell: vec2f,
};

// 4s = 192,000 samples

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {            
  let SCALE_FACTOR = uniforms[0];
  let WIDTH = uniforms[1];
  let HEIGHT = uniforms[2];
  let OFFSET = i32(uniforms[3]);

  let index = i32(floor(input.pos.x * f32(SCALE_FACTOR)));
  let sample = channelData[OFFSET + index];

  var min_sample = sample;
  var max_sample = sample;

  var i = 0;
  for (; f32(i) < SCALE_FACTOR; i++) {
    let fwd = channelData[OFFSET + index + i];
    max_sample = max(max_sample, fwd);
    min_sample = min(min_sample, fwd);
    // sample = select(sample, fwd, abs(fwd) > abs(sample));
    // i += 1;
  }

  // sample = 0.4;
  // let c = input.cell / scale;
  // return vec4f(c, 1-c.y, 1);
  // let red = vec4f(1, 0, 0, 1);
  // let cyan = vec4f(0, 1, 1, 1);
  // to make red/cyan checkered scale
  // let scale = vec2u(input.pos.xy) / 8;
  // let checker = (scale.x + scale.y) % 2 == 1;
  // return select(red, cyan, checker);

  // PCM is -1 to 1 btw
  // normalized -1 to 1, where -1 is down and 1 is up
  let yPosNorm = -1 * (2 * (floor(input.pos.y) / HEIGHT) - 1);

  // return select(
  //   vec4f(0, 0, 0, 0),
  //   vec4f(0, 1, 0, 1),
  //   input.pos.y <= HEIGHT
  // );
  // return vec4f(0, floor(input.pos.y) / HEIGHT, 0, 1);
  
  // let checker = 
  //   // same sign
  //   (yPosNorm * sample) > 0 && 
  //   // closer to 0
  //   abs(yPosNorm) <= abs(sample);
  // let yval = select(f32(0), f32(1), checker);
  // let debugVal = select(f32(0), f32(1), 1 > 0);
  // let yToSampleDist = 1 - (abs(sample - yPosNorm));
  // let ytmax = 1 - (abs(max_sample - yPosNorm));
  // let ytmin = 1 - (abs(min_sample - yPosNorm));
  // let s = select(f32(0), f32(1), yToSampleDist > 0.99);
  // let sup = select(f32(0), f32(1), ytmax > 0.99);
  // let sdown = select(f32(0), f32(1), ytmin > 0.99);


  // 0.02 just so the lines look connected
  let sfinal = select(
    vec4f(0, 0, 0, 0),
    waveformColor,
    yPosNorm <= max_sample + 0.02 && yPosNorm + 0.02 >= min_sample
  );
  
  
  return sfinal;
}

`;
