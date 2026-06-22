import Color from "color";
import { nullthrows } from "./nullthrows";
import {
  waveformComputeShader,
  waveformPyramidComputeShader,
  waveformShader,
} from "./waveformShader";

const DEFAULT_WAVEFORM_COLOR = [0, 1, 0, 1] as const; // green
const COMPUTE_WORKGROUP_SIZE = 64;

// LOD pyramid tuning.
//
// PYRAMID_RATIO: each pyramid level summarizes this many bins of the level
// below it (so bin sizes grow 64, 4096, 262144, ... raw samples).
//
// COLUMN_LOOP_BUDGET: the most bins (or raw samples) a single pixel column's
// compute loop should ever touch. The renderer uses the raw samples directly
// while samplesPerPixel <= this budget, and otherwise selects the finest
// pyramid level for which a column spans at most this many bins. Keeping these
// equal means the per-column loop is always <= ~COLUMN_LOOP_BUDGET iterations,
// regardless of zoom.
const PYRAMID_RATIO = 64;
const COLUMN_LOOP_BUDGET = 64;

// we want to render a 2d texture, for vertices, we just set up two
// trianges covering the whole vieport
const TWO_TRIANGLES_COVERING_VIEWPORT = new Float32Array([
  //   X,    Y,
  // Triangle 1
  -1, -1, 1, -1, 1, 1,
  // Triangle 2
  -1, -1, 1, 1, -1, 1,
] as const);

/** A single pre-reduced min/max LOD level living on the GPU. */
type PyramidLevel = {
  /** array<vec2f> of (min, max) per bin. */
  dataBuffer: GPUBuffer;
  /** LodParams uniform (binSize, levelLength) for the pyramid compute shader. */
  lodBuffer: GPUBuffer;
  /** Raw samples summarized by each bin of this level. */
  binSize: number;
  /** Number of bins in this level. */
  length: number;
};

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

  // Two compute paths share the same colMinMax output: a fine path that scans
  // raw samples, and a LOD path that reads a pyramid level (see selectLevel).
  private readonly computePipeline: GPUComputePipeline; // raw / fine zoom
  private readonly pyramidColumnPipeline: GPUComputePipeline; // LOD / zoomed out

  // Pyramid levels 1..K. Level 0 (raw samples) is not stored here; the fine
  // path scans channelDataStorage directly.
  private readonly pyramidLevels: PyramidLevel[] = [];

  private colMinMaxBuffer: GPUBuffer | null = null;
  private colMinMaxCapacity = 0;
  private rawComputeBindGroup: GPUBindGroup | null = null;
  private pyramidComputeBindGroups: GPUBindGroup[] = [];
  private renderBindGroup: GPUBindGroup | null = null;

  // Compute-pass memoization. colMinMax is fully determined by
  // (channelData, scale, offset, width); channelData is fixed for the lifetime
  // of a renderer, so when scale/offset/width match the previous frame the
  // existing colMinMax contents are still correct and we skip the compute pass
  // entirely (height- and color-only changes never touch colMinMax). The
  // colMinMaxValid flag is cleared whenever the buffer is (re)allocated, since
  // a fresh buffer has no valid contents yet.
  private lastComputeScale = NaN;
  private lastComputeOffset = NaN;
  private lastComputeWidth = NaN;
  private colMinMaxValid = false;

  private configuredContext: GPUCanvasContext | null = null;

  private lastColorInput:
    | string
    | readonly [number, number, number, number]
    | null = null;
  private lastColorOutput: readonly [number, number, number, number] | null =
    null;

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

    const renderShaderModule = device.createShaderModule({
      label: "Waveform Render Shader",
      code: waveformShader,
    });

    const computeShaderModule = device.createShaderModule({
      label: "Waveform Compute Shader",
      code: waveformComputeShader,
    });

    // Used at high zoom-out: reads a pre-reduced pyramid level instead of
    // looping over every raw sample. See the LOD comments above.
    const pyramidColumnShaderModule = device.createShaderModule({
      label: "Waveform Pyramid Column Shader",
      code: waveformPyramidComputeShader,
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

    const pyramidColumnPipeline = device.createComputePipeline({
      label: "Waveform pyramid column pipeline",
      layout: "auto",
      compute: {
        module: pyramidColumnShaderModule,
        entryPoint: "computeMain",
      },
    });

    return new GPUWaveformRenderer(
      renderPipeline,
      computePipeline,
      pyramidColumnPipeline,
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
    i32View[4] = 0; // bufferLength (set to the real sample count in the ctor)
    return arrayBuffer;
  }

  private constructor(
    readonly renderPipeline: GPURenderPipeline,
    computePipeline: GPUComputePipeline,
    pyramidColumnPipeline: GPUComputePipeline,
    channelData: Float32Array<ArrayBuffer>,
    readonly device: GPUDevice,
    readonly presentationFormat: GPUTextureFormat,
  ) {
    this.computePipeline = computePipeline;
    this.pyramidColumnPipeline = pyramidColumnPipeline;

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

    // The shaders need the raw sample count for bounds checks. It never changes
    // after construction, and setOptions() never touches this slot, so writing
    // it once here is sufficient.
    new Int32Array(this.uniformArray)[4] = this.channelData.length;

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

    this.buildPyramid();
  }

  /**
   * Builds the min/max LOD pyramid once and uploads each level to the GPU.
   *
   * The reduction runs on the CPU (see buildMinMaxPyramid): it's a one-time,
   * load-only cost and keeping it on the CPU makes the buffer layout trivial to
   * reason about. For very large buffers the level-1 pass is O(N) and can take
   * tens of milliseconds; if that ever becomes a problem it can be moved to a
   * GPU reduction pass or a worker without touching the render path — only this
   * method and the buffers it fills would change.
   */
  private buildPyramid() {
    const levels = buildMinMaxPyramid(this.channelData, PYRAMID_RATIO);
    for (const level of levels) {
      const dataBuffer = this.device.createBuffer({
        label: `Pyramid level (bin ${level.binSize})`,
        size: level.data.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      this.device.queue.writeBuffer(dataBuffer, 0, level.data);

      const lodBuffer = this.device.createBuffer({
        label: `Pyramid LOD params (bin ${level.binSize})`,
        size: 16, // LodParams: binSize, levelLength + padding
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this.device.queue.writeBuffer(
        lodBuffer,
        0,
        new Uint32Array([level.binSize, level.length, 0, 0]),
      );

      this.pyramidLevels.push({
        dataBuffer,
        lodBuffer,
        binSize: level.binSize,
        length: level.length,
      });
    }
  }

  /**
   * Chooses which compute path to run for the given samples-per-pixel.
   * Returns -1 for the raw (fine) path, or an index into pyramidLevels.
   */
  private selectLevel(samplesPerPixel: number): number {
    if (
      samplesPerPixel <= COLUMN_LOOP_BUDGET ||
      this.pyramidLevels.length === 0
    ) {
      return -1;
    }
    // Pick the finest level whose bins keep the per-column loop within budget:
    // bins-per-column ~= samplesPerPixel / binSize, want <= COLUMN_LOOP_BUDGET.
    const minBinSize = samplesPerPixel / COLUMN_LOOP_BUDGET;
    for (let i = 0; i < this.pyramidLevels.length; i++) {
      if (this.pyramidLevels[i].binSize >= minBinSize) {
        return i;
      }
    }
    // Zoomed out past the coarsest level: use it. The loop may slightly exceed
    // the budget here, bounded by that level's (small) bin count.
    return this.pyramidLevels.length - 1;
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

    this.rawComputeBindGroup = this.device.createBindGroup({
      label: "Raw compute bind group",
      layout: this.computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: { buffer: this.channelDataStorage } },
        { binding: 2, resource: { buffer: this.colMinMaxBuffer } },
      ],
    });

    this.pyramidComputeBindGroups = this.pyramidLevels.map((level) =>
      this.device.createBindGroup({
        label: `Pyramid compute bind group (bin ${level.binSize})`,
        layout: this.pyramidColumnPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer } },
          { binding: 1, resource: { buffer: level.dataBuffer } },
          {
            binding: 2,
            resource: { buffer: nullthrows(this.colMinMaxBuffer) },
          },
          { binding: 3, resource: { buffer: level.lodBuffer } },
        ],
      }),
    );

    this.renderBindGroup = this.device.createBindGroup({
      label: "Render bind group",
      layout: this.renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: { buffer: this.colMinMaxBuffer } },
        { binding: 2, resource: { buffer: this.waveformColorBuffer } },
      ],
    });

    // A freshly (re)allocated colMinMax has no valid contents yet, so the next
    // frame must run the compute pass even if scale/offset/width are unchanged.
    this.colMinMaxValid = false;
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

    // colMinMax only depends on (scale, offset, width); skip the compute pass
    // when none of those changed and the buffer still holds valid contents.
    const needsCompute =
      !this.colMinMaxValid ||
      scale !== this.lastComputeScale ||
      offset !== this.lastComputeOffset ||
      cwidth !== this.lastComputeWidth;

    const encoder = this.device.createCommandEncoder();

    if (needsCompute) {
      // Compute pass: one (min, max) per pixel column into colMinMax. Uses the
      // raw samples at fine zoom, or a pyramid level once zoomed out enough.
      const level = this.selectLevel(scale);
      const computePass = encoder.beginComputePass();
      if (level < 0) {
        computePass.setPipeline(this.computePipeline);
        computePass.setBindGroup(0, nullthrows(this.rawComputeBindGroup));
      } else {
        computePass.setPipeline(this.pyramidColumnPipeline);
        computePass.setBindGroup(
          0,
          nullthrows(this.pyramidComputeBindGroups[level]),
        );
      }
      computePass.dispatchWorkgroups(
        Math.max(1, Math.ceil(cwidth / COMPUTE_WORKGROUP_SIZE)),
      );
      computePass.end();

      this.lastComputeScale = scale;
      this.lastComputeOffset = offset;
      this.lastComputeWidth = cwidth;
      this.colMinMaxValid = true;
    }

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

/**
 * Builds a min/max LOD pyramid from raw channel samples.
 *
 * Level 1 reduces the raw samples in groups of `ratio`; each subsequent level
 * reduces the previous level by `ratio` again (hierarchical, so building every
 * level is O(N) total and each reduction step is cheap). A level's element i
 * holds the (min, max) over `binSize` consecutive raw samples, stored as
 * interleaved [min0, max0, min1, max1, ...] which maps directly onto a WGSL
 * `array<vec2f>`.
 *
 * Level 0 (the raw samples) is intentionally not produced here — the fine-zoom
 * path scans channelData directly, so only the coarser levels are needed.
 * Building stops once a level collapses the whole buffer into a single bin.
 */
function buildMinMaxPyramid(
  channelData: Float32Array<ArrayBuffer>,
  ratio: number,
): { data: Float32Array<ArrayBuffer>; binSize: number; length: number }[] {
  const levels: {
    data: Float32Array<ArrayBuffer>;
    binSize: number;
    length: number;
  }[] = [];
  const sampleCount = channelData.length;
  if (sampleCount === 0) {
    return levels;
  }

  let binSize = ratio;
  for (;;) {
    const length = Math.ceil(sampleCount / binSize);
    const data = new Float32Array(length * 2);

    if (levels.length === 0) {
      // Level 1: reduce raw f32 samples in groups of `binSize`.
      for (let b = 0; b < length; b++) {
        const start = b * binSize;
        const end = Math.min(start + binSize, sampleCount);
        let mn = channelData[start];
        let mx = mn;
        for (let i = start + 1; i < end; i++) {
          const v = channelData[i];
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
        data[b * 2] = mn;
        data[b * 2 + 1] = mx;
      }
    } else {
      // Level k>1: reduce the previous (min, max) level in groups of `ratio`.
      const prev = levels[levels.length - 1];
      for (let b = 0; b < length; b++) {
        const start = b * ratio;
        const end = Math.min(start + ratio, prev.length);
        let mn = prev.data[start * 2];
        let mx = prev.data[start * 2 + 1];
        for (let i = start + 1; i < end; i++) {
          const pmn = prev.data[i * 2];
          const pmx = prev.data[i * 2 + 1];
          if (pmn < mn) mn = pmn;
          if (pmx > mx) mx = pmx;
        }
        data[b * 2] = mn;
        data[b * 2 + 1] = mx;
      }
    }

    levels.push({ data, binSize, length });
    if (length <= 1) {
      break;
    }
    binSize *= ratio;
  }

  return levels;
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
