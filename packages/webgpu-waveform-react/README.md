# webgpu-waveform-react

Render waveforms to `<canvas />` using [WebGPU](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API) and React

## Examples

Visit [https://aykev.dev/webgpu-waveform/](https://aykev.dev/webgpu-waveform/) for examples

## Installation

This package is distributed for both usage with ESM and UMD. It includes TypeScript definition files too. Install from the npm registry:

```bash
npm i webgpu-waveform-react
```

For usage without React, check out the plain-JS [webgpu-waveform](https://github.com/mrkev/webgpu-waveform/tree/main/packages/webgpu-waveform) package.

## Usage

There's two ways to use this library:

- as a component: <a href="#GPUWaveform">`GPUWaveform`</a>
- as a hook: <a href="#useWaveformRenderer">`useWaveformRenderer`</a>

<h3 id="useWaveformRenderer">Using the `useWaveformRenderer` hook</h3>

The hook `useWaveformRenderer` has the following signature:

```typescript
function useWaveformRenderer(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  audioBuffer: AudioBuffer
): RendererStatus;
```

It takes in the following arguments:

- `canvasRef: React.RefObject<HTMLCanvasElement>` — the canvas element to render to
- `audioBuffer: AudioBuffer` — the buffer to render

And returns an object of the following type:

```typescript
type RendererStatus =
  | { status: "initializing" }
  | { status: "error"; error: any }
  | { status: "ready"; instance: GPUWaveformRenderer };
```

The objects are returned during the following stages of initialization:

- `{ status: "initializing" }` — during setup, when connecting to the GPU device
- `{ status: "error"; error: any }` — if an error happens at initalization
- `{ status: "ready"; instance: GPUWaveformRenderer }` — if the webgpu device could be initialized, setup was successful, and a renderer for `audioBuffer` on `canvas` could be successfully created.

**Example:**

```javascript
function Example({ audioBuffer, width, height }) {
  const canvasRef = useRef < HTMLCanvasElement > null;
  const renderer = useWaveformRenderer(canvasRef, audioBuffer);

  useEffect(() => {
    if (renderer.status !== "ready") {
      return;
    }

    renderer?.render(audioBuffer.length / width, 0, width, height);
  }, [renderer, audioBuffer, width, height]);

  return <canvas ref={canvasRef} width={width} height={height} />;
}
```

<h3 id="GPUWaveform">Using the `GPUWaveform` component</h3>

The component `GPUWaveform` takes the following properties:

- `audioBuffer: AudioBuffer;` — the buffer to render
- `scale?: number;` — the "zoom" level. Namely, number of samples per pixel in the x axis
- `offset?: number;` — the number of samples to skip from the beggining of the buffer
- ...and all the props of `React.CanvasHTMLAttributes<HTMLCanvasElement>` — these are passed directly to the rendered canvas

**Example:**

```javascript
export function Example({ audioBuffer }) {
  return (
    <GPUWaveform
      audioBuffer={audioBuffer}
      scale={800}
      width={300}
      height={100}
    />
  );
}
```

## Contributions

Feedback and PRs are welcome! If you send a PR, feel free to add yourself to the list of contributors below:

**Contributors:**

- Kevin Chavez ([@aykev](https://twitter.com/aykev))
