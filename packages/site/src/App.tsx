import "./App.css";
import { GPUWaveform } from "webgpu-waveform";
import { audioContext, loadSound, usePromise } from "./utils";

import Readme from "./Readme.mdx";

export default function App() {
  const cowAudio = usePromise(() => loadSound(audioContext, "Cow-Shaped.wav"));
  const fishAudio = usePromise(() =>
    loadSound(audioContext, "Fish-Shaped.wav")
  );

  const cowWaveform = (() => {
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
  })();

  return <Readme />;
}
