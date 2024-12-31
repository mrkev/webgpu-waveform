import { CanvasHTMLAttributes, forwardRef, useEffect, useRef } from "react";
import { mergeRefs } from "react-merge-refs";
import { useWaveformRenderer } from "./useWaveformRenderer";
import { nullthrows } from "./useWebGPU";

export const GPUWaveform = forwardRef(function GPUWaveformImpl(
  {
    audioBuffer,
    scale,
    offset = 0,
    color = "#00FF00",
    // canvas props
    width,
    height,
    ...props
  }: CanvasHTMLAttributes<HTMLCanvasElement> & {
    audioBuffer: AudioBuffer;
    scale?: number;
    offset?: number;
    color?: string;
  },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderer = useWaveformRenderer(audioBuffer);

  useEffect(() => {
    if (renderer.status !== "ready") {
      return;
    }

    const context = nullthrows(
      nullthrows(canvasRef.current).getContext("webgpu"),
      "nil webgpu context"
    );

    const s = scale != null ? scale : audioBuffer.length / context.canvas.width;

    renderer.instance.render(context, s, offset, color);
  }, [audioBuffer, color, height, offset, renderer, scale, width]);

  if (renderer.status === "error") {
    return (
      <pre style={{ color: "red" }}>
        {renderer.error instanceof Error
          ? renderer.error.message
          : String(renderer.error)}
      </pre>
    );
  }

  return (
    <canvas
      ref={(cref) => {
        mergeRefs([canvasRef, ref])(cref);
      }}
      width={width}
      height={height}
      {...props}
    />
  );
});
