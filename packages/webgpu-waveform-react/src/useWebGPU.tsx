import { useEffect, useState } from "react";

export function nullthrows<T>(val: T | null | undefined, message?: string): T {
  if (val == null) {
    throw new Error(message || `Expected ${val} to be non nil.`);
  }
  return val;
}

// look at: https://gist.github.com/bellbind/c686d4a01306642646ec5ae476741b42
// for animation (interactivity)
export type WebGPUStatus =
  | { status: "waiting" }
  | {
      status: "ready";
      adapter: GPUAdapter;
      device: GPUDevice;
      encoder: GPUCommandEncoder;
      context: GPUCanvasContext;
      canvasFormat: GPUTextureFormat;
    }
  | { status: "error"; error: unknown };

async function initializeWebGPU() {
  if (!navigator.gpu) {
    throw new Error("WebGPU not supported on this browser.");
  }

  const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

  const adapter = await navigator.gpu.requestAdapter();
  if (adapter == null) {
    throw new Error("No appropriate GPUAdapter found.");
  }

  const device = await adapter.requestDevice();
  const encoder = device.createCommandEncoder();

  return [canvasFormat, adapter, device, encoder] as const;
}

// NOTE: unused
export function useWebGPU(
  canvasRef: React.RefObject<HTMLCanvasElement>
): WebGPUStatus {
  const [status, setStatus] = useState<WebGPUStatus>({ status: "waiting" });
  useEffect(() => {
    async function main() {
      try {
        const canvas = nullthrows(
          canvasRef.current,
          "expected canvas to not be nil"
        );
        const context = nullthrows(
          canvas.getContext("webgpu"),
          "null webgpu context"
        );

        const [canvasFormat, adapter, device, encoder] =
          await initializeWebGPU();

        context.configure({
          device: device,
          format: canvasFormat,
        });

        setStatus({
          status: "ready",
          adapter,
          device,
          encoder,
          context,
          canvasFormat,
        });
      } catch (e) {
        setStatus({ status: "error", error: e });
      }
    }
    void main();
  }, [canvasRef]);

  return status;
}
