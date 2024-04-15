import React, { useEffect, useState } from "react";
import { GPUWaveformRenderer } from "./GPUWaveformRenderer";
import { useWebGPU } from "./useWebGPU";

export function useWaveformRenderer(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  audioBuffer: AudioBuffer
): GPUWaveformRenderer | null {
  const gpu = useWebGPU(canvasRef);
  const [renderer, setRenderer] = useState<GPUWaveformRenderer | null>(null);

  useEffect(() => {
    const channelData = audioBuffer.getChannelData(0);

    if (gpu.status !== "ready") {
      return;
    }

    const waveformRenderer = GPUWaveformRenderer.createPipeline(
      channelData,
      gpu.device,
      gpu.context,
      gpu.canvasFormat
    );

    setRenderer(waveformRenderer);
  }, [audioBuffer, gpu]);

  return renderer;
}
