import { useEffect, useRef } from "react";
import { GPUWaveform } from "../lib/GPUWaveform";
import { audioContext, loadSound, usePromise } from "./utils";
import { useWaveformRenderer } from "../lib/useWaveformRenderer";
import { GPUWaveformRenderer } from "../lib/GPUWaveformRenderer";

export function Example({
  render,
}: {
  render: (audioBuffer: AudioBuffer) => React.ReactElement;
}) {
  const cowAudio = usePromise(() => loadSound(audioContext, "Cow-Shaped.wav"));
  switch (cowAudio[0]) {
    case "resolved":
      const example = render(cowAudio[1]);
      return <p>{example}</p>;
    case "pending":
      return <p>loading...</p>;
    case "rejected":
      return <p>error: {`${cowAudio[1]}`}</p>;
  }
}

async function example1(canvas: HTMLCanvasElement, audioBuffer: AudioBuffer) {
  const channelData = audioBuffer.getChannelData(0);
  const renderer = await GPUWaveformRenderer.create(canvas, channelData);

  console.log("result", renderer);

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
