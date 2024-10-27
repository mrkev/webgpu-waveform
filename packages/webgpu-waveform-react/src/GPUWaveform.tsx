import { CanvasHTMLAttributes, forwardRef, useEffect, useRef } from "react";
import { mergeRefs } from "react-merge-refs";
import useResizeObserver from "use-resize-observer";
import { useWaveformRenderer } from "./useWaveformRenderer";

export const GPUWaveform = forwardRef(function GPUWaveformImpl(
  {
    audioBuffer,
    scale,
    offset = 0,
    color = "#00FF00",
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
  const renderer = useWaveformRenderer(canvasRef, audioBuffer);

  const { width, height } = useResizeObserver<HTMLCanvasElement>({
    ref: canvasRef,
    // onResize: useCallback(
    //   ({ width }: { width?: number; height?: number }) => {
    //     // project.viewport.projectDivWidth.set(width ?? 0);
    //   },
    //   [project.viewport.projectDivWidth],
    // ),
  });

  useEffect(() => {
    if (width == null || height == null) {
      return;
    }

    if (renderer.status !== "ready") {
      return;
    }

    const s = scale != null ? scale : audioBuffer.length / width;
    renderer.instance.render(s, offset, width, height, color);
    // renderer?.render(Math.round(Math.exp((Math.log(1000) / 100) * scale)));
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

  return <canvas ref={mergeRefs([canvasRef, ref])} {...props} />;
});
