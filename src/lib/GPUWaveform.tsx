import React, { useEffect, useRef } from "react";
import { mergeRefs } from "react-merge-refs";
import useResizeObserver from "use-resize-observer";
import { useWaveformRenderer } from "./useWaveformRenderer";

export const GPUWaveform = React.forwardRef(function GPUWaveformImpl(
  {
    audioBuffer,
    scale,
    offset = 0,
    ...props
  }: React.CanvasHTMLAttributes<HTMLCanvasElement> & {
    audioBuffer: AudioBuffer;
    scale?: number;
    offset?: number;
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

    const s = scale != null ? scale : audioBuffer.length / width;
    renderer?.render(s, offset, width, height);
    // renderer?.render(Math.round(Math.exp((Math.log(1000) / 100) * scale)));
  }, [audioBuffer, height, offset, renderer, scale, width]);

  return <canvas ref={mergeRefs([canvasRef, ref])} {...props} />;
});
