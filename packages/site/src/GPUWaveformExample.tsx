import { GPUWaveform } from "webgpu-waveform";
import { audioContext, loadSound, usePromise } from "./utils";

export function Example() {
  const cowAudio = usePromise(() => loadSound(audioContext, "Cow-Shaped.wav"));
  const fishAudio = usePromise(() =>
    loadSound(audioContext, "Fish-Shaped.wav")
  );

  switch (cowAudio[0]) {
    case "resolved":
      return (
        <GPUWaveform
          // ref={waveformRef}
          audioBuffer={cowAudio[1]}
          scale={800}
          // offset={
          //   lockPlayback
          //     ? offsetFrOfPlaybackPos(playbackPos)
          //     : waveformStartFr
          // }
          width={300}
          height={100}
        />
      );
    case "pending":
      return <>loading...</>;
    case "rejected":
      return <>error: {`${cowAudio[1]}`}</>;
  }
}
