# webgpu-waveform

Render waveforms to `<canvas />` using [WebGPU](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)

## Examples

Visit [https://aykev.dev/webgpu-waveform/](https://aykev.dev/webgpu-waveform/) for examples

## Installation

This package is distributed for both usage with ESM and UMD. It includes TypeScript definition files too. Install from the npm registry:

```bash
npm i webgpu-waveform
```

For usage with React, check out the [webgpu-waveform-react](https://github.com/mrkev/webgpu-waveform/tree/main/packages/webgpu-waveform-react) package.

## Usage

<h3 id="GPUWaveformRenderer">Using the `GPUWaveformRenderer` class</h3>

The class `GPUWaveformRenderer` is initialized using the static method `.create(...)`. It has the following definition:

```typescript
static async create(
  canvas: HTMLCanvasElement,
  channelData: Float32Array
): GPUWaveformRenderer
```

It takes in the following argument:

- `channelData: Float32Array` — the array of PCM samples to render

**Example:**

```javascript
async function example(canvas, audioBuffer) {
  const channelData = audioBuffer.getChannelData(0);
  const renderer = await GPUWaveformRenderer.create(channelData);

  renderer?.render(canvas, 800, 0);
}
```
