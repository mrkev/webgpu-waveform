import Color from "color";
import { nullthrows } from "./nullthrows";
import { waveformComputeShader, waveformShader } from "./waveformShader";

const DEFAULT_WAVEFORM_COLOR = [0, 1, 0, 1] as const; // green
const COMPUTE_WORKGROUP_SIZE = 64;

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
  private readonly vertices: Float32Array<ArrayBuffer>;
  private readonly vertexBuffer: GPUBuffer;
  private readonly vertexCount: number;

  private readonly uniformArray: ArrayBuffer;
  private readonly uniformBuffer: GPUBuffer;
  private readonly uniformBytesView: Uint8Array;
  private readonly prevUniformBytes: Uint8Array;
  private prevUniformBytesValid = false;

  private readonly waveformColor: Float32Array<ArrayBuffer>;
  private readonly waveformColorBuffer: GPUBuffer;
  private readonly prevWaveformColor = new Float32Array(4);
  private prevWaveformColorValid = false;

  private readonly channelData: Float32Array<ArrayBuffer>;
  private readonly channelDataStorage: GPUBuffer;

  private readonly computePipeline: GPUComputePipeline;

  private colMinMaxBuffer: GPUBuffer | null = null;
  private colMinMaxCapacity = 0;
  private computeBindGroup: GPUBindGroup | null = null;
  private renderBindGroup: GPUBindGroup | null = null;

  private configuredContext: GPUCanvasContext | null = null;

  private lastColorInput:
    | string
    | readonly [number, number, number, number]
    | null = null;
  private lastColorOutput: readonly [
    number,
    number,
    number,
    number,
  ] | null = null;

  protected setWaveformColor([r, g, b, a]: readonly [
    r: number,
    g: number,
    b: number,
    a: number,
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
    offset?: number,
  ) {
    const f32View = new Float32Array(this.uniformArray);
    const i32View = new Int32Array(this.uniformArray);
    if (scale != null) {
      f32View[0] = scale;
    }
    if (width != null) {
      f32View[1] = width;
    }
    if (height != null) {
      f32View[2] = height;
    }
    if (offset != null) {
      i32View[3] = offset | 0;
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

    const device = await adapter.requestDevice();

    return GPUWaveformRenderer.createSync(device, channelData);
  }

  static createSync(device: GPUDevice, channelData: Float32Array<ArrayBuffer>) {
    if (!navigator.gpu) {
      throw new Error("WebGPU not supported in this browser.");
    }

    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

    return GPUWaveformRenderer.createPipeline(
      channelData,
      device,
      canvasFormat,
    );
  }

  private static createPipeline(
    channelData: Float32Array<ArrayBuffer>,
    device: GPUDevice,
    canvasFormat: GPUTextureFormat,
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
    const renderShaderModule = device.createShaderModule({
      label: "Waveform Render Shader",
      code: waveformShader,
    });

    const computeShaderModule = device.createShaderModule({
      label: "Waveform Compute Shader",
      code: waveformComputeShader,
    });

    const renderPipeline = device.createRenderPipeline({
      label: "Waveform render pipeline",
      layout: "auto",
      vertex: {
        module: renderShaderModule,
        entryPoint: "vertexMain",
        buffers: [vertexBufferLayout],
      },
      fragment: {
        module: renderShaderModule,
        entryPoint: "fragmentMain",
        targets: [
          {
            format: canvasFormat,
          },
        ],
      },
    });

    const computePipeline = device.createComputePipeline({
      label: "Waveform compute pipeline",
      layout: "auto",
      compute: {
        module: computeShaderModule,
        entryPoint: "computeMain",
      },
    });

    return new GPUWaveformRenderer(
      renderPipeline,
      computePipeline,
      channelData,
      device,
      canvasFormat,
    );
  }

  private defaultUniformArray() {
    // 5 slots, 4 bytes each
    const arrayBuffer = new ArrayBuffer(4 * 5);
    const f32View = new Float32Array(arrayBuffer);
    const i32View = new Int32Array(arrayBuffer);
    f32View[0] = 1; // scale
    f32View[1] = 1; // width
    f32View[2] = 1; // height
    i32View[3] = 0; // offset
    i32View[4] = arrayBuffer.byteLength; // bufferLength
    return arrayBuffer;
  }

  private constructor(
    readonly renderPipeline: GPURenderPipeline,
    computePipeline: GPUComputePipeline,
    channelData: Float32Array<ArrayBuffer>,
    readonly device: GPUDevice,
    readonly presentationFormat: GPUTextureFormat,
  ) {
    this.computePipeline = computePipeline;

    // VERTICES
    this.vertices = TWO_TRIANGLES_COVERING_VIEWPORT;
    this.vertexBuffer = this.device.createBuffer({
      label: "Cell vertices",
      size: this.vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.vertexCount = this.vertices.length / 2; // 6 vertices

    // UNIFORMS
    this.uniformArray = this.defaultUniformArray();
    this.uniformBuffer = this.device.createBuffer({
      label: "Grid Uniforms",
      size: this.uniformArray.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.uniformBytesView = new Uint8Array(this.uniformArray);
    this.prevUniformBytes = new Uint8Array(this.uniformArray.byteLength);

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

    this.device.queue.writeBuffer(this.channelDataStorage, 0, this.channelData);
    // vertices don't change, only send them once here
    this.device.queue.writeBuffer(this.vertexBuffer, 0, this.vertices);
  }

  private ensureColMinMaxBuffer(width: number) {
    if (this.colMinMaxBuffer != null && this.colMinMaxCapacity >= width) {
      return;
    }
    const capacity = Math.max(width, 1);
    this.colMinMaxBuffer?.destroy();
    this.colMinMaxBuffer = this.device.createBuffer({
      label: "Column min/max",
      size: capacity * 8, // vec2<f32> per column
      usage: GPUBufferUsage.STORAGE,
    });
    this.colMinMaxCapacity = capacity;

    this.computeBindGroup = this.device.createBindGroup({
      label: "Compute bind group",
      layout: this.computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: { buffer: this.channelDataStorage } },
        { binding: 2, resource: { buffer: this.colMinMaxBuffer } },
      ],
    });

    this.renderBindGroup = this.device.createBindGroup({
      label: "Render bind group",
      layout: this.renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: { buffer: this.colMinMaxBuffer } },
        { binding: 2, resource: { buffer: this.waveformColorBuffer } },
      ],
    });
  }

  private uniformChanged(): boolean {
    const cur = this.uniformBytesView;
    const prev = this.prevUniformBytes;
    if (!this.prevUniformBytesValid) {
      prev.set(cur);
      this.prevUniformBytesValid = true;
      return true;
    }
    for (let i = 0; i < cur.length; i++) {
      if (cur[i] !== prev[i]) {
        prev.set(cur);
        return true;
      }
    }
    return false;
  }

  private colorChanged(): boolean {
    if (!this.prevWaveformColorValid) {
      this.prevWaveformColor.set(this.waveformColor);
      this.prevWaveformColorValid = true;
      return true;
    }
    for (let i = 0; i < 4; i++) {
      if (this.prevWaveformColor[i] !== this.waveformColor[i]) {
        this.prevWaveformColor.set(this.waveformColor);
        return true;
      }
    }
    return false;
  }

  private resolveColor(
    color: string | readonly [number, number, number, number] | undefined,
  ): readonly [number, number, number, number] {
    const input = color ?? DEFAULT_WAVEFORM_COLOR;
    if (this.lastColorInput === input && this.lastColorOutput != null) {
      return this.lastColorOutput;
    }
    const out = ensureColorFormat(input);
    this.lastColorInput = input;
    this.lastColorOutput = out;
    return out;
  }

  public render(
    destination: HTMLCanvasElement | OffscreenCanvas | GPUCanvasContext,
    scale: number,
    offset: number,
    color?: string | [r: number, g: number, b: number, a: number],
  ) {
    const [canvas, context] = ((): [
      HTMLCanvasElement | OffscreenCanvas,
      GPUCanvasContext,
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

    if (this.configuredContext !== context) {
      context.configure({
        device: this.device,
        format: this.presentationFormat,
        // https://webgpufundamentals.org/webgpu/lessons/webgpu-transparency.html
        alphaMode: "premultiplied", //by default, canvas is opaque. dont ignore alpha.
      });
      this.configuredContext = context;
    }

    const cwidth = canvas.width;
    const cheight = canvas.height;

    this.ensureColMinMaxBuffer(cwidth);

    const waveformColor = this.resolveColor(color);

    this.setOptions(scale, cwidth, cheight, offset);
    this.setWaveformColor(waveformColor);

    if (this.uniformChanged()) {
      this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformArray);
    }
    if (this.colorChanged()) {
      this.device.queue.writeBuffer(
        this.waveformColorBuffer,
        0,
        this.waveformColor,
      );
    }

    const encoder = this.device.createCommandEncoder();

    // Compute pass: one (min, max) per pixel column into colMinMax.
    const computePass = encoder.beginComputePass();
    computePass.setPipeline(this.computePipeline);
    computePass.setBindGroup(0, nullthrows(this.computeBindGroup));
    computePass.dispatchWorkgroups(
      Math.max(1, Math.ceil(cwidth / COMPUTE_WORKGROUP_SIZE)),
    );
    computePass.end();

    // Render pass: per-fragment just reads colMinMax[x] and does the inside test.
    const renderPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          loadOp: "clear",
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          storeOp: "store",
        },
      ],
    });

    renderPass.setPipeline(this.renderPipeline);
    renderPass.setVertexBuffer(0, this.vertexBuffer);
    renderPass.setBindGroup(0, nullthrows(this.renderBindGroup));
    renderPass.draw(this.vertexCount);
    renderPass.end();

    this.device.queue.submit([encoder.finish()]);
  }
}

function ensureColorFormat(
  arg: string | readonly [r: number, g: number, b: number, a: number],
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
