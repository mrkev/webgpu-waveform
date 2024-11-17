import { useEffect, useState } from "react";
import { GPUWaveformRenderer } from "webgpu-waveform";

type RendererStatus =
  | { status: "initializing" }
  | { status: "error"; error: any }
  | {
      status: "ready";
      instance: GPUWaveformRenderer;
    };

export function useWaveformRenderer(audioBuffer: AudioBuffer): RendererStatus {
  const [renderer, setRenderer] = useState<RendererStatus>({
    status: "initializing",
  });

  useEffect(() => {
    const channelData = audioBuffer.getChannelData(0);
    GPUWaveformRenderer.create(channelData)
      .then((waveformRenderer: GPUWaveformRenderer) =>
        setRenderer({ status: "ready", instance: waveformRenderer })
      )
      .catch((err: any) => setRenderer({ status: "error", error: err }));
  }, [audioBuffer]);

  return renderer;
}
