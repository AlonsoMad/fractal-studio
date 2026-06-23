import complexMathWGSL from '../../shaders/complex_math.wgsl?raw';
import fractalComputeWGSL from '../../shaders/fractal_compute.wgsl?raw';
import displayWGSL from '../../shaders/display.wgsl?raw';
import type { GradientStop } from '../../types/index.ts';

// ─── Uniform buffer layout ─────────────────────────────────────
// Must match the Uniforms struct in fractal_compute.wgsl
// Total: 48 bytes base + dynamic params (padded to 256 alignment)
const UNIFORM_BUFFER_SIZE = 256; // plenty of room for params

export interface RenderUniforms {
  centerX: number;
  centerY: number;
  zoom: number;
  aspect: number;
  maxIter: number;
  escapeRadius: number;
  juliaMode: number;
  juliaCRe: number;
  juliaCIm: number;
  colorMode: number;
  width: number;
  height: number;
  newtonMode: number;
  params: Record<string, number>;
}

export class WebGPURenderer {
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private format!: GPUTextureFormat;

  // Compute pipeline
  private computePipeline: GPUComputePipeline | null = null;
  private computeBindGroup: GPUBindGroup | null = null;

  // Display pipeline
  private displayPipeline!: GPURenderPipeline;
  private displayBindGroup!: GPUBindGroup;
  private sampler!: GPUSampler;

  // Resources
  private uniformBuffer!: GPUBuffer;
  private outputTexture: GPUTexture | null = null;
  private gradientTexture!: GPUTexture;

  // State
  private width = 0;
  private height = 0;
  private dirty = true;
  private running = false;
  private animFrameId = 0;
  private currentFormulaHash = '';
  private paramNames: string[] = [];

  // Pipeline cache
  private pipelineCache = new Map<string, { pipeline: GPUComputePipeline; bindGroupLayout: GPUBindGroupLayout }>();

  async init(canvas: HTMLCanvasElement): Promise<boolean> {
    if (!navigator.gpu) {
      console.error('WebGPU not supported');
      return false;
    }

    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance',
    });
    if (!adapter) {
      console.error('No GPU adapter found');
      return false;
    }

    this.device = await adapter.requestDevice({
      requiredLimits: {
        maxStorageTexturesPerShaderStage: 1,
        maxComputeWorkgroupSizeX: 16,
        maxComputeWorkgroupSizeY: 16,
      },
    });

    this.context = canvas.getContext('webgpu')!;
    this.format = navigator.gpu.getPreferredCanvasFormat();

    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: 'premultiplied',
    });

    // Create uniform buffer
    this.uniformBuffer = this.device.createBuffer({
      size: UNIFORM_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Create sampler for display
    this.sampler = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
    });

    // Create display pipeline
    const displayModule = this.device.createShaderModule({
      code: displayWGSL,
    });

    this.displayPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: displayModule,
        entryPoint: 'vs_main',
      },
      fragment: {
        module: displayModule,
        entryPoint: 'fs_main',
        targets: [{ format: this.format }],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });

    // Create default gradient texture
    this.createGradientTexture([
      { position: 0, color: [0, 7, 100] },
      { position: 0.16, color: [32, 107, 203] },
      { position: 0.42, color: [237, 255, 255] },
      { position: 0.6425, color: [255, 170, 0] },
      { position: 0.8575, color: [0, 2, 0] },
      { position: 1, color: [0, 7, 100] },
    ]);

    // Set initial size
    this.resize(canvas.width, canvas.height);

    return true;
  }

  /**
   * Compile a new formula shader.
   */
  compileFormula(userFormulaWGSL: string, paramNames: string[] = []): { success: boolean; error?: string } {
    if (!this.device) return { success: false, error: 'WebGPU device not initialized' };
    this.paramNames = paramNames;

    // Build the full shader source
    let shaderSource = fractalComputeWGSL;

    // Inject complex math library
    shaderSource = shaderSource.replace('// __COMPLEX_MATH_LIBRARY__', complexMathWGSL);

    // Inject user formula
    shaderSource = shaderSource.replace('// __USER_FORMULA__', userFormulaWGSL);

    // If there are user params, we need to add them to the uniform struct
    // For now, params are passed via the user_formula function signature
    // and we read them from a fixed area of the uniform buffer
    shaderSource = shaderSource.replace('    // __USER_PARAM_UNIFORMS__',
      paramNames.map((name, i) => `    param_${name}: f32,  // offset ${56 + i * 4}`).join('\n')
    );

    // Also need to modify the user_formula call in main to pass params
    if (paramNames.length > 0) {
      const paramArgs = paramNames.map(p => `u.param_${p}`).join(', ');
      shaderSource = shaderSource.replace(
        'z = user_formula(z, c);',
        `z = user_formula(z, c, ${paramArgs});`
      );
    }

    // Hash for caching
    const hash = this.hashString(shaderSource);

    // Check cache
    const cached = this.pipelineCache.get(hash);
    if (cached) {
      this.computePipeline = cached.pipeline;
      this.currentFormulaHash = hash;
      this.rebuildComputeBindGroup();
      this.dirty = true;
      return { success: true };
    }

    try {
      const module = this.device.createShaderModule({ code: shaderSource });

      // Check for compilation errors
      // Note: compilationInfo() is async but we proceed optimistically
      module.getCompilationInfo().then(info => {
        for (const msg of info.messages) {
          if (msg.type === 'error') {
            console.error(`Shader error at line ${msg.lineNum}: ${msg.message}`);
          }
        }
      });

      const pipeline = this.device.createComputePipeline({
        layout: 'auto',
        compute: {
          module,
          entryPoint: 'main',
        },
      });

      const bindGroupLayout = pipeline.getBindGroupLayout(0);
      this.pipelineCache.set(hash, { pipeline, bindGroupLayout });
      this.computePipeline = pipeline;
      this.currentFormulaHash = hash;
      this.rebuildComputeBindGroup();
      this.dirty = true;

      return { success: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Shader compilation failed:', msg);
      return { success: false, error: msg };
    }
  }

  /**
   * Update uniform data (no shader recompile needed).
   */
  updateUniforms(data: RenderUniforms): void {
    if (!this.device) return;

    const buffer = new ArrayBuffer(UNIFORM_BUFFER_SIZE);
    const f32 = new Float32Array(buffer);
    const u32 = new Uint32Array(buffer);

    // Match Uniforms struct layout
    f32[0] = data.centerX;         // center.x
    f32[1] = data.centerY;         // center.y
    f32[2] = data.zoom;            // zoom
    f32[3] = data.aspect;          // aspect
    u32[4] = data.maxIter;         // max_iter
    f32[5] = data.escapeRadius;    // escape_radius
    u32[6] = data.juliaMode;       // julia_mode
    // f32[7] is padding for 8-byte alignment of the following vec2
    f32[8] = data.juliaCRe;        // julia_c.x
    f32[9] = data.juliaCIm;        // julia_c.y
    u32[10] = data.colorMode;      // color_mode
    u32[11] = data.width;          // width
    u32[12] = data.height;         // height
    u32[13] = data.newtonMode;     // newton_mode (offset 52)

    // Write user params starting at index 14 (byte 56)
    this.paramNames.forEach((name, i) => {
      f32[14 + i] = data.params[name] ?? 0;
    });

    this.device.queue.writeBuffer(this.uniformBuffer, 0, buffer);
    this.dirty = true;
  }

  /**
   * Update the gradient texture.
   */
  updateGradient(stops: GradientStop[]): void {
    if (!this.device) return;
    this.createGradientTexture(stops);
    this.rebuildComputeBindGroup();
    this.dirty = true;
  }

  /**
   * Resize the output texture.
   */
  resize(width: number, height: number): void {
    if (!this.device) return;
    if (width === this.width && height === this.height) return;
    if (width === 0 || height === 0) return;

    this.width = width;
    this.height = height;

    // Destroy old texture
    if (this.outputTexture) {
      this.outputTexture.destroy();
    }

    // Create new output texture
    this.outputTexture = this.device.createTexture({
      size: { width, height },
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING,
    });

    // Rebuild bind groups
    this.rebuildComputeBindGroup();
    this.rebuildDisplayBindGroup();
    this.dirty = true;
  }

  /**
   * Start the render loop.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.renderLoop();
  }

  /**
   * Stop the render loop.
   */
  stop(): void {
    this.running = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = 0;
    }
  }

  /**
   * Mark as needing a re-render.
   */
  markDirty(): void {
    this.dirty = true;
  }

  /**
   * Render a single frame (for export).
   */
  renderFrame(): void {
    this.render();
  }

  /**
   * Get the current canvas pixels as ImageData (for export).
   */
  async readPixels(): Promise<Uint8Array | null> {
    if (!this.outputTexture) return null;

    const bytesPerRow = Math.ceil(this.width * 4 / 256) * 256;
    const readBuffer = this.device.createBuffer({
      size: bytesPerRow * this.height,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const encoder = this.device.createCommandEncoder();
    encoder.copyTextureToBuffer(
      { texture: this.outputTexture },
      { buffer: readBuffer, bytesPerRow },
      { width: this.width, height: this.height }
    );
    this.device.queue.submit([encoder.finish()]);

    await readBuffer.mapAsync(GPUMapMode.READ);
    const data = new Uint8Array(readBuffer.getMappedRange()).slice();
    readBuffer.unmap();
    readBuffer.destroy();

    // Remove padding
    if (bytesPerRow !== this.width * 4) {
      const result = new Uint8Array(this.width * this.height * 4);
      for (let y = 0; y < this.height; y++) {
        result.set(
          data.subarray(y * bytesPerRow, y * bytesPerRow + this.width * 4),
          y * this.width * 4
        );
      }
      return result;
    }

    return data;
  }

  /**
   * Clean up GPU resources.
   */
  destroy(): void {
    this.stop();
    this.outputTexture?.destroy();
    this.uniformBuffer?.destroy();
    this.gradientTexture?.destroy();
    this.pipelineCache.clear();
  }

  // ─── Private methods ──────────────────────────────────────

  private renderLoop = (): void => {
    if (!this.running) return;

    if (this.dirty) {
      this.render();
      this.dirty = false;
    }

    this.animFrameId = requestAnimationFrame(this.renderLoop);
  };

  private render(): void {
    if (!this.computePipeline || !this.computeBindGroup || !this.outputTexture) return;

    const encoder = this.device.createCommandEncoder();

    // Compute pass
    const computePass = encoder.beginComputePass();
    computePass.setPipeline(this.computePipeline);
    computePass.setBindGroup(0, this.computeBindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(this.width / 16),
      Math.ceil(this.height / 16)
    );
    computePass.end();

    // Render pass (display the computed texture)
    const textureView = this.context.getCurrentTexture().createView();
    const renderPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    renderPass.setPipeline(this.displayPipeline);
    renderPass.setBindGroup(0, this.displayBindGroup);
    renderPass.draw(3);
    renderPass.end();

    this.device.queue.submit([encoder.finish()]);
  }

  private rebuildComputeBindGroup(): void {
    if (!this.computePipeline || !this.outputTexture || !this.gradientTexture) return;

    try {
      this.computeBindGroup = this.device.createBindGroup({
        layout: this.computePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer } },
          { binding: 1, resource: this.outputTexture.createView() },
          { binding: 2, resource: this.gradientTexture.createView() },
        ],
      });
    } catch (e) {
      console.error('Failed to create compute bind group:', e);
    }
  }

  private rebuildDisplayBindGroup(): void {
    if (!this.outputTexture) return;

    this.displayBindGroup = this.device.createBindGroup({
      layout: this.displayPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: this.outputTexture.createView() },
      ],
    });
  }

  private createGradientTexture(stops: GradientStop[]): void {
    const size = 256;
    const data = new Uint8Array(size * 4);

    // Interpolate gradient
    for (let i = 0; i < size; i++) {
      const t = i / (size - 1);
      const color = this.interpolateGradient(stops, t);
      data[i * 4 + 0] = color[0];
      data[i * 4 + 1] = color[1];
      data[i * 4 + 2] = color[2];
      data[i * 4 + 3] = 255;
    }

    if (this.gradientTexture) {
      this.gradientTexture.destroy();
    }

    this.gradientTexture = this.device.createTexture({
      size: { width: size },
      dimension: '1d',
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    this.device.queue.writeTexture(
      { texture: this.gradientTexture },
      data.buffer,
      { bytesPerRow: size * 4 },
      { width: size }
    );
  }

  private interpolateGradient(stops: GradientStop[], t: number): [number, number, number] {
    if (stops.length === 0) return [0, 0, 0];
    if (stops.length === 1) return stops[0].color;

    // Find surrounding stops
    let lower = stops[0];
    let upper = stops[stops.length - 1];

    for (let i = 0; i < stops.length - 1; i++) {
      if (t >= stops[i].position && t <= stops[i + 1].position) {
        lower = stops[i];
        upper = stops[i + 1];
        break;
      }
    }

    if (lower.position === upper.position) return lower.color;

    const f = (t - lower.position) / (upper.position - lower.position);
    return [
      Math.round(lower.color[0] + (upper.color[0] - lower.color[0]) * f),
      Math.round(lower.color[1] + (upper.color[1] - lower.color[1]) * f),
      Math.round(lower.color[2] + (upper.color[2] - lower.color[2]) * f),
    ];
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }
}
