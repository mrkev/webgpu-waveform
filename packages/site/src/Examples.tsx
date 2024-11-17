import { useEffect, useRef } from "react";
import {
  GPUWaveform,
  useWaveformRenderer,
} from "../../webgpu-waveform-react/src/index";
import { GPUWaveformRenderer } from "../../webgpu-waveform/src/index";
import { audioContext, loadSound, usePromise } from "./utils";

export function Example({
  render,
}: {
  render: (audioBuffer: AudioBuffer) => React.ReactElement;
}) {
  const cowAudio = usePromise(() => loadSound(audioContext, "Cow-Shaped.wav"));
  switch (cowAudio[0]) {
    case "resolved":
      const example = render(cowAudio[1]);
      return <div style={{ paddingLeft: "11%" }}>{example}</div>;
    case "pending":
      return <p>loading...</p>;
    case "rejected":
      return <p>error: {`${cowAudio[1]}`}</p>;
  }
}

async function example1(canvas: HTMLCanvasElement, audioBuffer: AudioBuffer) {
  const channelData = audioBuffer.getChannelData(0);
  const renderer = await GPUWaveformRenderer.create(channelData);

  renderer?.render(canvas, 800, 0);
}

export function Example1({ audioBuffer }: { audioBuffer: AudioBuffer }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderer = useWaveformRenderer(audioBuffer);

  useEffect(() => {
    if (canvasRef.current == null) {
      return;
    }

    example1(canvasRef.current, audioBuffer).catch(console.error);
  }, [renderer, audioBuffer]);

  if (renderer.status === "error") {
    return (
      <pre style={{ color: "red" }}>
        {renderer.error instanceof Error
          ? renderer.error.message
          : String(renderer.error)}
      </pre>
    );
  }

  return <canvas ref={canvasRef} width={300} height={100} />;
}

export function Example2({
  audioBuffer,
  width,
  height,
}: {
  audioBuffer: AudioBuffer;
  width: number;
  height: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderer = useWaveformRenderer(audioBuffer);

  useEffect(() => {
    if (renderer.status !== "ready") {
      return;
    }

    renderer.instance.render(canvasRef.current!, audioBuffer.length / width, 0);
  }, [renderer, audioBuffer, width, height]);

  if (renderer.status === "error") {
    return (
      <pre style={{ color: "red" }}>
        {renderer.error instanceof Error
          ? renderer.error.message
          : String(renderer.error)}
      </pre>
    );
  }

  return <canvas ref={canvasRef} width={width} height={height} />;
}

export function Example3({ audioBuffer }: { audioBuffer: AudioBuffer }) {
  return (
    <GPUWaveform
      audioBuffer={audioBuffer}
      scale={400}
      style={{
        width: 300,
        height: 100,
      }}
      color="#FFFF00"
      width={300 * devicePixelRatio}
      height={100 * devicePixelRatio}
    />
  );
}
