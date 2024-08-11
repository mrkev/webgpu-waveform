# webgpu-waveform

Render waveforms to `<canvas />` using [WebGPU](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)

## Examples

Visit [https://aykev.dev/webgpu-waveform/](https://aykev.dev/webgpu-waveform/) for examples

## Usage

This package is distributed for both usage with ESM and UMD. It includes TypeScript definition files too. Install from the npm registry:

```bash
npm i webgpu-waveform
```

<h3 id="GPUWaveformRenderer">Using the `GPUWaveformRenderer` class</h3>

The class `GPUWaveformRenderer` is initialized using the static method `.create(...)`. It has the following definition:

```typescript
static async create(
  canvas: HTMLCanvasElement,
  channelData: Float32Array
): GPUWaveformRenderer
```

It takes in the following arguments:

- `canvas: HTMLCanvasElement` — the canvas element to render to
- `channelData: Float32Array` — the array of PCM samples to render

**Example:**

```javascript
async function example(canvas, audioBuffer) {
  const channelData = audioBuffer.getChannelData(0);
  const renderer = await GPUWaveformRenderer.create(canvas, channelData);

  renderer?.render(800, 0, canvas.width, canvas.height);
}
```
