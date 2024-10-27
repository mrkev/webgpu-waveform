import { useState } from "react";
import { GPUWaveform } from "../../webgpu-waveform-react/src/index";

const canvas = document.createElement("canvas");
canvas.width = 100;
canvas.height = 100;

export function Playground({ audioBuffer }: { audioBuffer: AudioBuffer }) {
  const [offsetFr, setOffsetFr] = useState(0);
  const [frPerPx, setFrPerPx] = useState(441);
  const [color, setColor] = useState("#00FF00");
  // const containerRef = useRef<HTMLDivElement>(null);
  // const divRef = useRef<HTMLDivElement>(null);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        border: "4px solid black",
        padding: "1ch",
      }}
    >
      {/* FOR TESTING */}
      {/* <div ref={containerRef}></div>
      <div
        ref={divRef}
        style={{
          // backgroundSize: `${totalBufferWidth}px ${height - 10}px`,
          // backgroundImage: "url('" + backgroundImageData + "')",
          // backgroundPosition: `${bufferOffsetPx * -1}px center`,
          backgroundPosition: "0px center",
          backgroundRepeat: "no-repeat",
          imageRendering: "pixelated",
          border: "2px solid red",
          width: 100,
          height: 100,
        }}
      ></div>
      <button
        onClick={async () => {
          const channelData = audioBuffer.getChannelData(0);
          const end = 131822;

          const trimmed = new Float32Array(
            channelData.buffer,
            channelData.BYTES_PER_ELEMENT * offsetFr
            // channelData.BYTES_PER_ELEMENT * channelData.length
          );

          console.log(channelData.byteLength, trimmed.byteLength);

          const renderer = await GPUWaveformRenderer.create(canvas, trimmed);

          renderer?.render(800, 0, canvas.width, canvas.height);
          containerRef.current!.appendChild(canvas);

          const image = new Image();
          image.src = canvas.toDataURL();
          containerRef.current!.appendChild(image);

          divRef.current!.style.backgroundImage = "url('" + image.src + "')";
        }}
      >
        test
      </button> */}
      <div style={{ display: "flex", flexDirection: "row" }}>
        Color:{" "}
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "row" }}>
        Offset:{" "}
        <input
          type="range"
          min={0}
          max={audioBuffer.length}
          value={offsetFr}
          onChange={async (v) => {
            const value = parseInt(v.target.value);
            setOffsetFr(value);
          }}
        ></input>{" "}
        {offsetFr} frames
      </div>
      <div style={{ display: "flex", flexDirection: "row" }}>
        Scale:{" "}
        <input
          type="range"
          min={1}
          max={1764}
          value={frPerPx}
          onChange={(v) => {
            const value = parseInt(v.target.value);
            setFrPerPx(value);
          }}
        ></input>{" "}
        {frPerPx} frames / pixel
      </div>

      <GPUWaveform
        audioBuffer={audioBuffer}
        scale={frPerPx}
        offset={offsetFr}
        height={100}
        color={color}
      />
    </div>
  );
}
