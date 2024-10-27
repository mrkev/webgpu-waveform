import { useEffect, useRef } from "react";
import { GPUWaveform } from "webgpu-waveform-react";
import { GPUWaveformRenderer } from "webgpu-waveform";
import { useWaveformRenderer } from "webgpu-waveform-react";
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
  const renderer = await GPUWaveformRenderer.create(canvas, channelData);

  renderer?.render(800, 0, canvas.width, canvas.height);
}

export function Example1({ audioBuffer }: { audioBuffer: AudioBuffer }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderer = useWaveformRenderer(canvasRef, audioBuffer);

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
  const renderer = useWaveformRenderer(canvasRef, audioBuffer);

  useEffect(() => {
    if (renderer.status !== "ready") {
      return;
    }

    renderer.instance.render(audioBuffer.length / width, 0, width, height);
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
      scale={800}
      width={300}
      height={100}
    />
  );
}
