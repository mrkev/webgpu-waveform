v3.0.0

- `webgpu-waveform` BREAKING. `.render` now takes in a destination `HTMLCanvasElement | OffscreenCanvas | GPUCanvasContext`,
  and no longer accepts width, height. The correct dimentions to render at are fetched from the target canvas width, height.
- `webgpu-waveform` BREAKING. `GPUWaveformRenderer.create` no longer accepts a destination `HTMLCanvasElement` (it's now passed on render).
- `webgpu-waveform-react` BREAKING. `useWaveformRenderer` no longer accepts a destination `RefObject<HTMLCanvasElement>` to render to.
  Now it's passed in the `.render` function of the resulting `GPUWaveformRenderer`.

v2.1.0

- now using the same version numbef for both `webgpu-waveform` and `webgpu-waveform-react`
- can now set waveform color

webgpu-waveform 2.0.0

- removed react dependency
- moved `GPUWaveform` react component, `useWaveformRenderer` react hook to a new pacakge, `webgpu-waveform-react` (1.0.0)
