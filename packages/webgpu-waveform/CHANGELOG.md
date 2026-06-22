# webgpu-waveform

## 3.4.0

### Minor Changes

- Significant rendering performance improvements:

  - Added a GPU compute pass that pre-reduces per-column min/max values before the render pass, replacing the per-fragment loop in the shader. At high zoom-out levels this is a large speedup.
  - Added an LOD pyramid so that columns spanning very large sample ranges use pre-reduced pyramid bins rather than looping over raw samples, keeping the per-column work bounded regardless of zoom level.
  - Skip redundant GPU buffer writes when uniforms and color haven't changed between frames.
  - Only configure the canvas context when it changes, avoiding redundant `context.configure()` calls.
  - Fixed `offset` uniform to always be coerced to an integer (`offset | 0`).
  - Made `GPUWaveformRenderer` internal fields private.
  - Use a dynamic epsilon (1 / height) for waveform edge rendering instead of a hardcoded constant.

## 3.3.0

### Minor Changes

- update package.json

## 3.2.0

### Minor Changes

- improve waveform rendering, and update dependencies
