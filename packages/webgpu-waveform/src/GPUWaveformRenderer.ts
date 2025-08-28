import Color from "color";
import { nullthrows } from "./nullthrows";
import { waveformShader } from "./waveformShader";

const DEFAULT_WAVEFORM_COLOR = [0, 1, 0, 1] as const; // green

// we want to render a 2d texture, for vertices, we just set up two
// trianges covering the whole vieport
const TWO_TRIANGLES_COVERING_VIEWPORT = new Float32Array([
  //   X,    Y,
  // Triangle 1
  -1, -1, 1, -1, 1, 1,
  // Triangle 2
  -1, -1, 1, 1, -1, 1,
] as const);

export class GPUWaveformRenderer {
  readonly bindGroup: GPUBindGroup;

  readonly vertices: Float32Array<ArrayBuffer>;
  readonly vertexBuffer: GPUBuffer;
  readonly vertexCount: number;

  readonly uniformArray: Float32Array<ArrayBuffer>;
  readonly uniformBuffer: GPUBuffer;

  readonly waveformColor: Float32Array<ArrayBuffer>;
  readonly waveformColorBuffer: GPUBuffer;

  readonly channelData: Float32Array<ArrayBuffer>;
  readonly channelDataStorage: GPUBuffer;

  protected setWaveformColor([r, g, b, a]: readonly [
    r: number,
    g: number,
    b: number,
    a: number
  ]) {
    this.waveformColor[0] = r;
    this.waveformColor[1] = g;
    this.waveformColor[2] = b;
    this.waveformColor[3] = a;
  }

  protected setOptions(
    scale?: number,
    width?: number,
    height?: number,
    offset?: number
  ) {
    if (scale != null) {
      this.uniformArray[0] = scale;
    }
    if (width != null) {
      this.uniformArray[1] = width;
    }
    if (height != null) {
      this.uniformArray[2] = height;
    }
    if (offset != null) {
      this.uniformArray[3] = offset;
    }
  }

  static async create(channelData: Float32Array<ArrayBuffer>) {
    if (!navigator.gpu) {
      throw new Error("WebGPU not supported in this browser.");
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (adapter == null) {
      throw new Error("No appropriate GPUAdapter found.");
    }

    const device = await adapter.requestDevice({
      label: `Device ${new Date().getTime()}`,
    });

    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

    return GPUWaveformRenderer.createPipeline(
      channelData,
      device,
      canvasFormat
    );
  }

  static createSync(device: GPUDevice, channelData: Float32Array<ArrayBuffer>) {
    if (!navigator.gpu) {
      throw new Error("WebGPU not supported in this browser.");
    }

    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

    return GPUWaveformRenderer.createPipeline(
      channelData,
      device,
      canvasFormat
    );
  }

  private static createPipeline(
    channelData: Float32Array<ArrayBuffer>,
    device: GPUDevice,
    canvasFormat: GPUTextureFormat
  ) {
    const vertexBufferLayout: GPUVertexBufferLayout = {
      arrayStride: 8,
      attributes: [
        {
          format: "float32x2",
          offset: 0,
          shaderLocation: 0, // Position, see vertex shader
        },
      ],
    } as const;

    /**
     * IDEA: optimization idea: metadata sampling min/max at a scale factor of 100, (is 10,000 necessary too?).
     * looping +100x can start to get choppy, at this point we can fallback to this alternative buffer for this
     * and higher scale factors.
     */
    const cellShaderModule = device.createShaderModule({
      label: "Waveform Shader",
      code: waveformShader,
    });

    const cellPipeline = device.createRenderPipeline({
      label: "Cell pipeline",
      layout: "auto",
      vertex: {
        module: cellShaderModule,
        entryPoint: "vertexMain",
        buffers: [vertexBufferLayout],
      },
      fragment: {
        module: cellShaderModule,
        entryPoint: "fragmentMain",
        targets: [
          {
            format: canvasFormat,
          },
        ],
      },
    });

    const waveformRenderer = new GPUWaveformRenderer(
      cellPipeline,
      channelData,
      device,
      canvasFormat
    );

    return waveformRenderer;
  }

  private constructor(
    readonly renderPipeline: GPURenderPipeline,
    channelData: Float32Array<ArrayBuffer>,
    readonly device: GPUDevice,
    readonly presentationFormat: GPUTextureFormat
  ) {
    // VERTICES
    this.vertices = TWO_TRIANGLES_COVERING_VIEWPORT;
    this.vertexBuffer = this.device.createBuffer({
      label: "Cell vertices",
      size: this.vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.vertexCount = this.vertices.length / 2; // 6 vertices

    // UNIFORMS
    this.uniformArray = new Float32Array([1, 1, 1, 0]); // just some default: scale, width, height, offset
    this.uniformBuffer = this.device.createBuffer({
      label: "Grid Uniforms",
      size: this.uniformArray.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // CHANNEL DATA
    this.channelData = channelData;
    this.channelDataStorage = this.device.createBuffer({
      label: "Channel Data",
      size: channelData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // WAVEFORM COLOR
    this.waveformColor = new Float32Array(DEFAULT_WAVEFORM_COLOR);
    this.waveformColorBuffer = this.device.createBuffer({
      label: "Waveform Color",
      size: this.waveformColor.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = this.device.createBindGroup({
      label: "GPU Waveform renderer bind group",
      layout: renderPipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: { buffer: this.uniformBuffer },
        },
        {
          binding: 1,
          resource: { buffer: this.channelDataStorage },
        },
        {
          binding: 2,
          resource: { buffer: this.waveformColorBuffer },
        },
      ],
    });

    // performance.mark("writeBuffer1");
    this.device.queue.writeBuffer(this.channelDataStorage, 0, this.channelData);
    // performance.mark("writeBuffer2");
    // performance.measure("writeBufferFoo", "writeBuffer1", "writeBuffer2");
  }

  public render(
    destination: HTMLCanvasElement | OffscreenCanvas | GPUCanvasContext,
    scale: number,
    offset: number,
    color?: string | [r: number, g: number, b: number, a: number]
  ) {
    const [canvas, context] = ((): [
      HTMLCanvasElement | OffscreenCanvas,
      GPUCanvasContext
    ] => {
      if (destination instanceof GPUCanvasContext) {
        return [destination.canvas, destination];
      } else {
        return [
          destination,
          nullthrows(destination.getContext("webgpu"), "nil webgpu context"),
        ];
      }
    })();

    context.configure({
      device: this.device,
      format: this.presentationFormat,
      // https://webgpufundamentals.org/webgpu/lessons/webgpu-transparency.html
      alphaMode: "premultiplied", //by default, canvas is opaque. dont ignore alpha.
    });

    const cwidth = canvas.width;
    const cheight = canvas.height;

    const waveformColor = ensureColorFormat(color ?? DEFAULT_WAVEFORM_COLOR);

    this.setOptions(scale, cwidth, cheight, offset);
    this.setWaveformColor(waveformColor);

    this.device.queue.writeBuffer(this.vertexBuffer, 0, this.vertices);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformArray);
    this.device.queue.writeBuffer(
      this.waveformColorBuffer,
      0,
      this.waveformColor
    );

    const renderPassOpts = {
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView({ label: "view" }),
          loadOp: "clear",
          // other clear value?
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          storeOp: "store",
        },
      ],
    } as const;

    const encoder = this.device.createCommandEncoder({
      label: `encoder ${new Date().getTime()}`,
    });
    const pass = encoder.beginRenderPass(renderPassOpts);

    pass.setPipeline(this.renderPipeline);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(this.vertexCount);

    pass.end();
    // Finish the command buffer and immediately submit it.
    this.device.queue.submit([encoder.finish()]);
  }
}

function ensureColorFormat(
  arg: string | readonly [r: number, g: number, b: number, a: number]
): readonly [r: number, g: number, b: number, a: number] {
  if (!(typeof arg === "string")) {
    return arg;
  }

  const color = Color(arg);

  return [
    color.red() / 255,
    color.green() / 255,
    color.blue() / 255,
    color.alpha(),
  ];
}
