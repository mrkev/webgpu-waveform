import { RefObject, useEffect, useState } from "react";
import { GPUWaveformRenderer } from "webgpu-waveform";
import { nullthrows } from "./useWebGPU";

type RendererStatus =
  | { status: "initializing" }
  | { status: "error"; error: any }
  | {
      status: "ready";
      instance: GPUWaveformRenderer;
    };

export function useWaveformRenderer(
  canvasRef: RefObject<HTMLCanvasElement>,
  audioBuffer: AudioBuffer
): RendererStatus {
  const [renderer, setRenderer] = useState<RendererStatus>({
    status: "initializing",
  });

  useEffect(() => {
    const canvas = nullthrows(
      canvasRef.current,
      "expected canvas to not be nil"
    );
    const channelData = audioBuffer.getChannelData(0);

    GPUWaveformRenderer.create(canvas, channelData)
      .then((waveformRenderer) =>
        setRenderer({ status: "ready", instance: waveformRenderer })
      )
      .catch((err) => setRenderer({ status: "error", error: err }));
  }, [audioBuffer, canvasRef]);

  return renderer;
}
