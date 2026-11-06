// everyframe
/**
 * Keeps a WebGL2 pass from leaving the engine's drawing state changed. The pass may bind, enable and
 * set whatever it likes; once it returns, everything is as it was.
 *
 * Reading the state back from GL is what costs. Some questions (which texture is bound, what is
 * enabled) the browser answers at once. Others (the blend, the stencil, the depth, the scissor, most
 * of the pixel store) wait for the GPU process, about 40 µs each in Chrome: asking all of them for
 * every pass, every frame, took 4 ms a pass. So only the quick ones are asked every time, and the
 * pass is handed a `gl` that notes the slow ones the first time it changes each: one that only sets
 * the clear colour pays for one question, not forty. The viewport goes the same way, because asking
 * for it makes an array each time.
 *
 * Whether a binding is still alive is not asked of GL either (`isTexture` and its kind wait too):
 * the `gl` the pass is handed notes what it deletes. Only when a pass is made or let go of, once,
 * is it asked, because there the engine deletes the pass's pictures with its own context.
 *
 * What is not kept: what is inside objects. A pass binds its own vertex array, framebuffer and
 * transform feedback before changing them (they are unbound for it when it starts), and never
 * changes the buffers, programs or textures of the engine. Queries and transform feedback it begins
 * it ends before returning. Of the extensions, the state of `OES_draw_buffers_indexed` and
 * `EXT_polygon_offset_clamp` is put back; that of `EXT_clip_control`, `WEBGL_provoking_vertex`,
 * `WEBGL_polygon_mode` and `EXT_depth_clamp` is not, and a pass that changes it sets it back itself.
 */

/**
 * State the pass's `gl` notes when it is changed, rather than asking for it every run: how to read
 * it, and how to set it back.
 */
type TNotedState = { read(): unknown[]; write(values: any[]): void };

const notedStates = (gl: WebGL2RenderingContext, clamp: () => Record<string, any> | null) => {
    const get = (...keys: number[]) => () => keys.map((key) => gl.getParameter(key));
    const one = (key: number, write: (value: any) => void): TNotedState => ({ read: get(key), write: ([value]) => write(value) });
    const face = (front: boolean) => front
        ? [gl.STENCIL_FUNC, gl.STENCIL_REF, gl.STENCIL_VALUE_MASK, gl.STENCIL_WRITEMASK, gl.STENCIL_FAIL, gl.STENCIL_PASS_DEPTH_FAIL, gl.STENCIL_PASS_DEPTH_PASS]
        : [gl.STENCIL_BACK_FUNC, gl.STENCIL_BACK_REF, gl.STENCIL_BACK_VALUE_MASK, gl.STENCIL_BACK_WRITEMASK, gl.STENCIL_BACK_FAIL, gl.STENCIL_BACK_PASS_DEPTH_FAIL, gl.STENCIL_BACK_PASS_DEPTH_PASS];
    const stencil: TNotedState = {
        read: get(...face(true), ...face(false)),
        write: (s) => {
            for (const [side, at] of [[gl.FRONT, 0], [gl.BACK, 7]] as const) {
                gl.stencilFuncSeparate(side, s[at], s[at + 1], s[at + 2]);
                gl.stencilMaskSeparate(side, s[at + 3]);
                gl.stencilOpSeparate(side, s[at + 4], s[at + 5], s[at + 6]);
            }
        },
    };
    const blendFunc: TNotedState = {
        read: get(gl.BLEND_SRC_RGB, gl.BLEND_DST_RGB, gl.BLEND_SRC_ALPHA, gl.BLEND_DST_ALPHA),
        write: ([a, b, c, d]) => gl.blendFuncSeparate(a, b, c, d),
    };
    const blendEquation: TNotedState = {
        read: get(gl.BLEND_EQUATION_RGB, gl.BLEND_EQUATION_ALPHA),
        write: ([a, b]) => gl.blendEquationSeparate(a, b),
    };
    return {
        viewport: one(gl.VIEWPORT, (box) => gl.viewport(box[0], box[1], box[2], box[3])),
        scissor: one(gl.SCISSOR_BOX, (box) => gl.scissor(box[0], box[1], box[2], box[3])),
        colorMask: one(gl.COLOR_WRITEMASK, (mask) => gl.colorMask(mask[0], mask[1], mask[2], mask[3])),
        clearColor: one(gl.COLOR_CLEAR_VALUE, (colour) => gl.clearColor(colour[0], colour[1], colour[2], colour[3])),
        depthRange: one(gl.DEPTH_RANGE, (range) => gl.depthRange(range[0], range[1])),
        depthFunc: one(gl.DEPTH_FUNC, (value) => gl.depthFunc(value)),
        depthMask: one(gl.DEPTH_WRITEMASK, (value) => gl.depthMask(value)),
        clearDepth: one(gl.DEPTH_CLEAR_VALUE, (value) => gl.clearDepth(value)),
        blendFunc,
        blendFuncSeparate: blendFunc,
        blendEquation,
        blendEquationSeparate: blendEquation,
        blendColor: one(gl.BLEND_COLOR, (colour) => gl.blendColor(colour[0], colour[1], colour[2], colour[3])),
        cullFace: one(gl.CULL_FACE_MODE, (value) => gl.cullFace(value)),
        frontFace: one(gl.FRONT_FACE, (value) => gl.frontFace(value)),
        // With EXT_polygon_offset_clamp in use, its clamp goes with the factor and the units: both calls
        // set all three, so they are kept as one.
        polygonOffset: {
            read: () => {
                const extension = clamp();
                const offset = [gl.getParameter(gl.POLYGON_OFFSET_FACTOR), gl.getParameter(gl.POLYGON_OFFSET_UNITS)];
                return extension === null ? offset : [...offset, gl.getParameter(extension.POLYGON_OFFSET_CLAMP_EXT)];
            },
            // The plain call first, which also sets the clamp to none, as the engine never uses one.
            write: ([factor, units, most]) => {
                gl.polygonOffset(factor, units);
                const extension = clamp();
                if (extension !== null && most) extension.polygonOffsetClampEXT(factor, units, most);
            },
        },
        sampleCoverage: { read: get(gl.SAMPLE_COVERAGE_VALUE, gl.SAMPLE_COVERAGE_INVERT), write: ([a, b]) => gl.sampleCoverage(a, b) },
        clearStencil: one(gl.STENCIL_CLEAR_VALUE, (value) => gl.clearStencil(value)),
        lineWidth: one(gl.LINE_WIDTH, (value) => gl.lineWidth(value)),
        stencilFunc: stencil,
        stencilFuncSeparate: stencil,
        stencilOp: stencil,
        stencilOpSeparate: stencil,
        stencilMask: stencil,
        stencilMaskSeparate: stencil,
    } satisfies Record<string, TNotedState>;
};

/**
 * An object that answers like `real`, and is one to `instanceof`: every method of its prototype
 * called on `real`, every property asked of `real`. The constants are read through the prototype,
 * as they are on `real`.
 */
const forwarding = (real: object): Record<string, unknown> => {
    const copy = Object.create(Object.getPrototypeOf(real)) as Record<string, unknown>;
    for (let proto = Object.getPrototypeOf(real); proto !== null && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
        for (const name of Object.getOwnPropertyNames(proto)) {
            if (name === 'constructor' || Object.prototype.hasOwnProperty.call(copy, name)) continue;
            const descriptor = Object.getOwnPropertyDescriptor(proto, name)!;
            if (descriptor.get || descriptor.set) {
                Object.defineProperty(copy, name, {
                    get: descriptor.get && (() => descriptor.get!.call(real)),
                    set: descriptor.set && ((value: unknown) => descriptor.set!.call(real, value)),
                });
            } else if (typeof descriptor.value === 'function') {
                copy[name] = descriptor.value.bind(real);
            }
        }
    }
    return copy;
};

/**
 * Wraps `object[name]` so `before` runs first with the same arguments.
 */
const noting = (object: Record<string, unknown>, name: string, before: () => void): void => {
    const real = object[name] as ((...args: unknown[]) => unknown) | undefined;
    if (real === undefined) return;
    object[name] = function (this: unknown) {
        before();
        return real.apply(null, arguments as unknown as unknown[]);
    };
};

const BUFFER_TARGETS = ['ARRAY_BUFFER', 'COPY_READ_BUFFER', 'COPY_WRITE_BUFFER', 'PIXEL_PACK_BUFFER', 'PIXEL_UNPACK_BUFFER', 'UNIFORM_BUFFER', 'TRANSFORM_FEEDBACK_BUFFER'] as const;
const TEXTURE_TARGETS = ['TEXTURE_2D', 'TEXTURE_CUBE_MAP', 'TEXTURE_3D', 'TEXTURE_2D_ARRAY'] as const;
const TEXTURE_BINDINGS = ['TEXTURE_BINDING_2D', 'TEXTURE_BINDING_CUBE_MAP', 'TEXTURE_BINDING_3D', 'TEXTURE_BINDING_2D_ARRAY'] as const;
const CAPABILITIES = ['BLEND', 'CULL_FACE', 'DEPTH_TEST', 'DITHER', 'POLYGON_OFFSET_FILL', 'SAMPLE_ALPHA_TO_COVERAGE',
    'SAMPLE_COVERAGE', 'SCISSOR_TEST', 'STENCIL_TEST', 'RASTERIZER_DISCARD'] as const;
const INDEXED_BLEND = ['enableiOES', 'disableiOES', 'blendEquationiOES', 'blendEquationSeparateiOES', 'blendFunciOES', 'blendFuncSeparateiOES', 'colorMaskiOES'];

/**
 * What a WebGL2 pass is handed, and what runs its code with the state kept.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGlGuard = {
    /**
     * The context for the pass: the real one underneath, noting the slow state it changes and what
     * it deletes. It is still a `WebGL2RenderingContext` to `instanceof`, but not to what needs the
     * real one (`new XRWebGLLayer`).
     */
    gl: WebGL2RenderingContext;
    /**
     * Runs `callback` and puts the state back afterwards, even when it throws. `careful` asks GL
     * whether each binding is still alive before setting it back: for making and letting go of a
     * pass, never for its frames.
     */
    run<T>(callback: () => T, careful?: boolean): T;
};

/**
 * Makes the guard of one context, which has to be there: a lost one answers its limits with
 * nothing. Everything it keeps is made here, once: a run makes no arrays for the quick state, and
 * none at all when the pass changes nothing slow.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createGlGuard = (gl: WebGL2RenderingContext): TGlGuard => {
    const units = gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS) as number;
    const uniformSlots = gl.getParameter(gl.MAX_UNIFORM_BUFFER_BINDINGS) as number;
    const drawBufferCount = gl.getParameter(gl.MAX_DRAW_BUFFERS) as number;
    const capabilities = CAPABILITIES.map((name) => gl[name]);
    const blendAt = CAPABILITIES.indexOf('BLEND');
    const bufferTargets = BUFFER_TARGETS.map((name) => gl[name]);
    const bufferBindings = BUFFER_TARGETS.map((name) => gl[`${name}_BINDING`]);
    const textureTargets = TEXTURE_TARGETS.map((name) => gl[name]);
    const textureBindings = TEXTURE_BINDINGS.map((name) => gl[name]);
    const spaces = gl as unknown as { unpackColorSpace?: string; drawingBufferColorSpace?: string };

    // The quick state, written over by each run.
    const enabled = capabilities.map(() => false);
    const buffers: (WebGLBuffer | null)[] = bufferTargets.map(() => null);
    const uniforms: (WebGLBuffer | null)[] = new Array(uniformSlots).fill(null);
    const textures: (WebGLTexture | null)[] = new Array(units * textureTargets.length).fill(null);
    const samplers: (WebGLSampler | null)[] = new Array(units).fill(null);
    const drawBuffers: number[] = new Array(drawBufferCount).fill(gl.NONE);
    let program: WebGLProgram | null = null;
    let vertexArray: WebGLVertexArrayObject | null = null;
    let drawFramebuffer: WebGLFramebuffer | null = null;
    let readFramebuffer: WebGLFramebuffer | null = null;
    let renderbuffer: WebGLRenderbuffer | null = null;
    let feedback: WebGLTransformFeedback | null = null;
    let readBuffer = gl.BACK;
    // The screen's own, when it was not what was bound: the pass starts on the screen and may
    // change them there.
    let screenDraw = gl.BACK;
    let screenRead = gl.BACK;
    let activeTexture = gl.TEXTURE0;
    let unpackAlignment = 4;
    let flipY = false;
    let premultiply = false;
    let colorspace = gl.BROWSER_DEFAULT_WEBGL;
    let unpackSpace: string | undefined;
    let bufferSpace: string | undefined;

    // The clamp extension, once the pass has asked for it: what sets the polygon offset back uses it.
    let clampExtension: Record<string, any> | null = null;
    // The clamp only while it is still this context's: one from before a lost context came back
    // answers nothing, and the clamp is not even a question to the new one until it is asked for
    // again.
    const noted = notedStates(gl, () => (clampExtension !== null && realGetExtension('EXT_polygon_offset_clamp') === clampExtension ? clampExtension : null));
    // What the pass changed, read the first time it did, set back in the order it was met.
    const changed = new Map<TNotedState, unknown[]>();
    const pixelStore = new Map<number, number | boolean>();
    const uniformRanges = new Map<number, [number, number]>();
    // The blend of one draw buffer was changed: the blend switch is set back on all of them, as
    // the browser may not count it in what `isEnabled` answers.
    let indexedBlend = false;
    // What the pass deleted: set back, a binding to one of these is set to nothing.
    const deleted = new WeakSet<object>();
    let depth = 0;
    let careful = false;

    const note = (state: TNotedState): void => {
        if (depth > 0 && !changed.has(state)) changed.set(state, state.read());
    };
    const alive = <T>(object: T | null, is: (object: T) => boolean): T | null => {
        if (object === null || deleted.has(object as object)) return null;
        return !careful || is.call(gl, object) ? object : null;
    };

    const tracked = forwarding(gl);
    for (const [name, state] of Object.entries(noted)) noting(tracked, name, () => note(state));
    const realPixelStorei = tracked.pixelStorei as WebGL2RenderingContext['pixelStorei'];
    tracked.pixelStorei = (key: number, value: number | boolean) => {
        if (depth > 0 && !pixelStore.has(key)) pixelStore.set(key, gl.getParameter(key));
        realPixelStorei(key, value as number);
    };
    const noteRange = (target: number, index: number): void => {
        if (depth > 0 && target === gl.UNIFORM_BUFFER && !uniformRanges.has(index)) {
            uniformRanges.set(index, [gl.getIndexedParameter(gl.UNIFORM_BUFFER_START, index), gl.getIndexedParameter(gl.UNIFORM_BUFFER_SIZE, index)]);
        }
    };
    const realBase = tracked.bindBufferBase as WebGL2RenderingContext['bindBufferBase'];
    const realRange = tracked.bindBufferRange as WebGL2RenderingContext['bindBufferRange'];
    tracked.bindBufferBase = (target: number, index: number, buffer: WebGLBuffer | null) => {
        noteRange(target, index);
        realBase(target, index, buffer);
    };
    tracked.bindBufferRange = (target: number, index: number, buffer: WebGLBuffer | null, offset: number, size: number) => {
        noteRange(target, index);
        realRange(target, index, buffer, offset, size);
    };
    for (const kind of ['Texture', 'Buffer', 'Program', 'VertexArray', 'Framebuffer', 'Sampler', 'Renderbuffer', 'TransformFeedback', 'Shader', 'Query', 'Sync']) {
        const real = tracked[`delete${kind}`] as (object: object | null) => void;
        tracked[`delete${kind}`] = (object: object | null) => {
            if (object !== null) deleted.add(object);
            real(object);
        };
    }

    // The extensions that change drawing state the engine relies on are handed noting too. The real
    // `getExtension` is asked every time, since that is what turns an extension on, and a context
    // that comes back after being lost has new extension objects: each gets its own copy.
    const copies = new WeakMap<object, unknown>();
    const extensionFor = (name: string, real: Record<string, any> | null): unknown => {
        if (real === null) return null;
        const made = copies.get(real);
        if (made !== undefined) return made;
        const copy = copyOf(name, real);
        copies.set(real, copy);
        return copy;
    };
    const copyOf = (name: string, real: Record<string, any>): unknown => {
        if (name === 'OES_draw_buffers_indexed') {
            const copy = forwarding(real);
            for (const method of INDEXED_BLEND) {
                noting(copy, method, () => {
                    if (depth === 0) return;
                    // The calls for every buffer at once set them all back.
                    note(noted.blendFunc);
                    note(noted.blendEquation);
                    note(noted.colorMask);
                    indexedBlend = true;
                });
            }
            return copy;
        }
        if (name === 'EXT_polygon_offset_clamp') {
            clampExtension = real;
            const copy = forwarding(real);
            noting(copy, 'polygonOffsetClampEXT', () => note(noted.polygonOffset));
            return copy;
        }
        return real;
    };
    const realGetExtension = tracked.getExtension as (name: string) => Record<string, any> | null;
    tracked.getExtension = (name: string) => extensionFor(name, realGetExtension(name));

    const save = (): void => {
        for (let i = 0; i < capabilities.length; i++) enabled[i] = gl.isEnabled(capabilities[i]);
        program = gl.getParameter(gl.CURRENT_PROGRAM);
        vertexArray = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
        drawFramebuffer = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
        readFramebuffer = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
        readBuffer = gl.getParameter(gl.READ_BUFFER);
        for (let i = 0; i < drawBufferCount; i++) drawBuffers[i] = gl.getParameter(gl.DRAW_BUFFER0 + i);
        renderbuffer = gl.getParameter(gl.RENDERBUFFER_BINDING);
        feedback = gl.getParameter(gl.TRANSFORM_FEEDBACK_BINDING);
        unpackAlignment = gl.getParameter(gl.UNPACK_ALIGNMENT);
        flipY = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
        premultiply = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
        colorspace = gl.getParameter(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL);
        unpackSpace = spaces.unpackColorSpace;
        bufferSpace = spaces.drawingBufferColorSpace;
        for (let i = 0; i < bufferTargets.length; i++) buffers[i] = gl.getParameter(bufferBindings[i]);
        for (let i = 0; i < uniformSlots; i++) uniforms[i] = gl.getIndexedParameter(gl.UNIFORM_BUFFER_BINDING, i);
        activeTexture = gl.getParameter(gl.ACTIVE_TEXTURE);
        for (let unit = 0; unit < units; unit++) {
            gl.activeTexture(gl.TEXTURE0 + unit);
            for (let t = 0; t < textureTargets.length; t++) textures[unit * textureTargets.length + t] = gl.getParameter(textureBindings[t]);
            samplers[unit] = gl.getParameter(gl.SAMPLER_BINDING);
        }
        gl.activeTexture(activeTexture);
    };

    // Each binding is set back only if the pass left another, so a pass that touched nothing costs
    // only the questions.
    const restore = (): void => {
        for (let i = 0; i < capabilities.length; i++) {
            if (gl.isEnabled(capabilities[i]) !== enabled[i]) {
                if (enabled[i]) gl.enable(capabilities[i]);
                else gl.disable(capabilities[i]);
            }
        }
        if (indexedBlend) {
            if (enabled[blendAt]) gl.enable(gl.BLEND);
            else gl.disable(gl.BLEND);
            indexedBlend = false;
        }
        if (changed.size > 0) {
            changed.forEach((values, state) => state.write(values as any[]));
            changed.clear();
        }
        if (pixelStore.size > 0) {
            pixelStore.forEach((value, key) => gl.pixelStorei(key, value as number));
            pixelStore.clear();
        }
        if (gl.getParameter(gl.UNPACK_ALIGNMENT) !== unpackAlignment) gl.pixelStorei(gl.UNPACK_ALIGNMENT, unpackAlignment);
        if (gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL) !== flipY) gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipY);
        if (gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL) !== premultiply) gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);
        if (gl.getParameter(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL) !== colorspace) gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, colorspace);
        if (spaces.unpackColorSpace !== unpackSpace) spaces.unpackColorSpace = unpackSpace;
        if (spaces.drawingBufferColorSpace !== bufferSpace) spaces.drawingBufferColorSpace = bufferSpace;

        if (gl.getParameter(gl.CURRENT_PROGRAM) !== program) gl.useProgram(alive(program, gl.isProgram));
        if (gl.getParameter(gl.VERTEX_ARRAY_BINDING) !== vertexArray) gl.bindVertexArray(alive(vertexArray, gl.isVertexArray));
        // The screen first, when the engine had a framebuffer of its own bound: the pass started on
        // the screen and may have changed what it draws into.
        if (drawFramebuffer !== null || readFramebuffer !== null) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            if (gl.getParameter(gl.DRAW_BUFFER0) !== screenDraw) gl.drawBuffers([screenDraw]);
            if (gl.getParameter(gl.READ_BUFFER) !== screenRead) gl.readBuffer(screenRead);
        }
        const liveDraw = alive(drawFramebuffer, gl.isFramebuffer);
        const liveRead = alive(readFramebuffer, gl.isFramebuffer);
        if (gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) !== drawFramebuffer) gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, liveDraw);
        if (gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) !== readFramebuffer) gl.bindFramebuffer(gl.READ_FRAMEBUFFER, liveRead);
        // A framebuffer that is gone leaves the screen, which takes exactly one BACK.
        if (drawFramebuffer !== null && liveDraw === null) {
            gl.drawBuffers([gl.BACK]);
        } else {
            let same = true;
            const count = liveDraw === null ? 1 : drawBufferCount;
            for (let i = 0; i < count; i++) same &&= gl.getParameter(gl.DRAW_BUFFER0 + i) === drawBuffers[i];
            if (!same) gl.drawBuffers(drawBuffers.slice(0, count));
        }
        const wantRead = readFramebuffer !== null && liveRead === null ? gl.BACK : readBuffer;
        if (gl.getParameter(gl.READ_BUFFER) !== wantRead) gl.readBuffer(wantRead);
        if (gl.getParameter(gl.RENDERBUFFER_BINDING) !== renderbuffer) gl.bindRenderbuffer(gl.RENDERBUFFER, alive(renderbuffer, gl.isRenderbuffer));
        if (gl.getParameter(gl.TRANSFORM_FEEDBACK_BINDING) !== feedback) gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, alive(feedback, gl.isTransformFeedback));

        // The indexed uniform slots first: binding one also binds the general UNIFORM_BUFFER, which
        // is set back below.
        for (let i = 0; i < uniformSlots; i++) {
            const range = uniformRanges.size > 0 ? uniformRanges.get(i) : undefined;
            if (range === undefined && gl.getIndexedParameter(gl.UNIFORM_BUFFER_BINDING, i) === uniforms[i]) continue;
            const buffer = alive(uniforms[i], gl.isBuffer);
            if (buffer !== null && range !== undefined && range[1] > 0) gl.bindBufferRange(gl.UNIFORM_BUFFER, i, buffer, range[0], range[1]);
            else gl.bindBufferBase(gl.UNIFORM_BUFFER, i, buffer);
        }
        uniformRanges.clear();
        for (let i = 0; i < bufferTargets.length; i++) {
            if (gl.getParameter(bufferBindings[i]) !== buffers[i]) gl.bindBuffer(bufferTargets[i], alive(buffers[i], gl.isBuffer));
        }
        for (let unit = 0; unit < units; unit++) {
            gl.activeTexture(gl.TEXTURE0 + unit);
            for (let t = 0; t < textureTargets.length; t++) {
                const was = textures[unit * textureTargets.length + t];
                if (gl.getParameter(textureBindings[t]) !== was) gl.bindTexture(textureTargets[t], alive(was, gl.isTexture));
            }
            if (gl.getParameter(gl.SAMPLER_BINDING) !== samplers[unit]) gl.bindSampler(unit, alive(samplers[unit], gl.isSampler));
        }
        gl.activeTexture(activeTexture);
    };

    return {
        gl: tracked as unknown as WebGL2RenderingContext,
        run: (callback, carefully = false) => {
            // Inside another run, the outer one sets everything back.
            if (depth > 0 || gl.isContextLost()) return callback();
            careful = carefully;
            save();
            // Making and letting go of a pass also runs the engine's own code, on its own context:
            // the viewport is kept whether or not the pass's `gl` sees it change.
            if (careful) changed.set(noted.viewport, noted.viewport.read());
            // The engine's own objects are out of the pass's reach: ordinary setup code such as
            // vertexAttribPointer would otherwise change the engine's vertex array.
            gl.bindVertexArray(null);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
            if (drawFramebuffer !== null || readFramebuffer !== null) {
                screenDraw = gl.getParameter(gl.DRAW_BUFFER0);
                screenRead = gl.getParameter(gl.READ_BUFFER);
            }
            depth++;
            try {
                return callback();
            } finally {
                depth--;
                if (!gl.isContextLost()) {
                    restore();
                } else {
                    changed.clear();
                    pixelStore.clear();
                    uniformRanges.clear();
                    indexedBlend = false;
                }
            }
        },
    };
};
