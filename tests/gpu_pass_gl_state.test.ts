import { describe, expect, it } from 'bun:test';
import { createGlGuard } from '../src/render/webgl2/extensions/guard_gl_state';

// What a browser answers at once. Any other question waits for the GPU process, so the guard may
// only ask it when the pass changed what it answers.
const QUICK = ['CURRENT_PROGRAM', 'VERTEX_ARRAY_BINDING', 'DRAW_FRAMEBUFFER_BINDING', 'READ_FRAMEBUFFER_BINDING', 'READ_BUFFER',
    'DRAW_BUFFER0', 'RENDERBUFFER_BINDING', 'TRANSFORM_FEEDBACK_BINDING', 'UNPACK_ALIGNMENT', 'UNPACK_FLIP_Y_WEBGL',
    'UNPACK_PREMULTIPLY_ALPHA_WEBGL', 'UNPACK_COLORSPACE_CONVERSION_WEBGL', 'ACTIVE_TEXTURE', 'TEXTURE_BINDING_2D',
    'TEXTURE_BINDING_CUBE_MAP', 'TEXTURE_BINDING_3D', 'TEXTURE_BINDING_2D_ARRAY', 'SAMPLER_BINDING', 'ARRAY_BUFFER_BINDING',
    'COPY_READ_BUFFER_BINDING', 'COPY_WRITE_BUFFER_BINDING', 'PIXEL_PACK_BUFFER_BINDING', 'PIXEL_UNPACK_BUFFER_BINDING',
    'UNIFORM_BUFFER_BINDING', 'TRANSFORM_FEEDBACK_BUFFER_BINDING'];

const CONSTANTS = [...QUICK, 'VIEWPORT', 'SCISSOR_BOX', 'COLOR_WRITEMASK', 'COLOR_CLEAR_VALUE', 'DEPTH_RANGE', 'DEPTH_FUNC',
    'DEPTH_WRITEMASK', 'DEPTH_CLEAR_VALUE', 'BLEND_SRC_RGB', 'BLEND_DST_RGB', 'BLEND_SRC_ALPHA', 'BLEND_DST_ALPHA',
    'BLEND_EQUATION_RGB', 'BLEND_EQUATION_ALPHA', 'BLEND_COLOR', 'CULL_FACE_MODE', 'FRONT_FACE', 'POLYGON_OFFSET_FACTOR',
    'POLYGON_OFFSET_UNITS', 'SAMPLE_COVERAGE_VALUE', 'SAMPLE_COVERAGE_INVERT', 'STENCIL_CLEAR_VALUE', 'LINE_WIDTH',
    'PACK_ROW_LENGTH', 'UNPACK_ROW_LENGTH', 'UNIFORM_BUFFER_START', 'UNIFORM_BUFFER_SIZE',
    ...['FUNC', 'REF', 'VALUE_MASK', 'WRITEMASK', 'FAIL', 'PASS_DEPTH_FAIL', 'PASS_DEPTH_PASS'].flatMap((n) => [`STENCIL_${n}`, `STENCIL_BACK_${n}`]),
    'BLEND', 'CULL_FACE', 'DEPTH_TEST', 'DITHER', 'POLYGON_OFFSET_FILL', 'SAMPLE_ALPHA_TO_COVERAGE', 'SAMPLE_COVERAGE',
    'SCISSOR_TEST', 'STENCIL_TEST', 'RASTERIZER_DISCARD', 'ARRAY_BUFFER', 'COPY_READ_BUFFER', 'COPY_WRITE_BUFFER',
    'PIXEL_PACK_BUFFER', 'PIXEL_UNPACK_BUFFER', 'UNIFORM_BUFFER', 'TRANSFORM_FEEDBACK_BUFFER', 'TEXTURE_2D', 'TEXTURE_CUBE_MAP',
    'TEXTURE_3D', 'TEXTURE_2D_ARRAY', 'MAX_COMBINED_TEXTURE_IMAGE_UNITS', 'MAX_UNIFORM_BUFFER_BINDINGS', 'MAX_DRAW_BUFFERS',
    'FRAMEBUFFER', 'DRAW_FRAMEBUFFER', 'READ_FRAMEBUFFER', 'RENDERBUFFER', 'TRANSFORM_FEEDBACK', 'BROWSER_DEFAULT_WEBGL',
    'TEXTURE0', 'BACK', 'NONE', 'FRONT', 'COLOR_ATTACHMENT0', 'FUNC_ADD', 'FUNC_REVERSE_SUBTRACT', 'LESS', 'NEVER', 'ONE'];

/**
 * A WebGL2 context with what the guard asks and sets, counting the questions that would wait for the
 * GPU process in a browser. Its methods live on its prototype, as a real context's do, and each
 * framebuffer has its own draw and read buffer, as a real one has.
 */
const fakeContext = () => {
    const proto: Record<string, unknown> = {};
    CONSTANTS.forEach((name, i) => { proto[name] = 100 + i; });
    const k = proto as Record<string, number>;
    // The buffer bindings are kept half a step above their target, so each answers on its own.
    for (const name of ['ARRAY_BUFFER', 'COPY_READ_BUFFER', 'COPY_WRITE_BUFFER', 'PIXEL_PACK_BUFFER', 'PIXEL_UNPACK_BUFFER', 'UNIFORM_BUFFER', 'TRANSFORM_FEEDBACK_BUFFER']) {
        proto[`${name}_BINDING`] = k[name] + 0.5;
    }
    const quick = new Set(QUICK.map((name) => k[name]));
    const state = new Map<number, unknown>();
    const enabled = new Set<number>([k.DITHER]);
    const units = [new Map<number, unknown>(), new Map<number, unknown>()];
    const indexed = new Map<number, unknown>();
    const deleted = new Set<object>();
    const drawBufferOf = new Map<object | null, number>([[null, k.BACK]]);
    const readBufferOf = new Map<object | null, number>([[null, k.BACK]]);
    let unit = 0;
    let drawFramebuffer: object | null = null;
    let readFramebuffer: object | null = null;
    let construction = true;
    const counts = { slow: 0, alive: 0, indexedBlend: false, extensions: 0 };
    const set = (name: string, value: unknown) => state.set(k[name], value);
    const ask = (key: number) => {
        if (!construction && !quick.has(key)) counts.slow++;
    };
    const bindingOf: Record<number, number> = {
        [k.TEXTURE_BINDING_2D]: k.TEXTURE_2D, [k.TEXTURE_BINDING_CUBE_MAP]: k.TEXTURE_CUBE_MAP,
        [k.TEXTURE_BINDING_3D]: k.TEXTURE_3D, [k.TEXTURE_BINDING_2D_ARRAY]: k.TEXTURE_2D_ARRAY,
    };
    const defaults: Record<string, unknown> = {
        MAX_COMBINED_TEXTURE_IMAGE_UNITS: 2, MAX_UNIFORM_BUFFER_BINDINGS: 2, MAX_DRAW_BUFFERS: 1,
        VIEWPORT: new Int32Array([0, 0, 64, 64]), SCISSOR_BOX: new Int32Array([0, 0, 64, 64]), COLOR_WRITEMASK: [true, true, true, true],
        COLOR_CLEAR_VALUE: new Float32Array([0, 0, 1, 1]), DEPTH_RANGE: new Float32Array([0, 1]), DEPTH_FUNC: k.LESS,
        BLEND_EQUATION_RGB: k.FUNC_ADD, BLEND_EQUATION_ALPHA: k.FUNC_ADD, ACTIVE_TEXTURE: k.TEXTURE0,
        UNPACK_ALIGNMENT: 4, PACK_ROW_LENGTH: 0, UNPACK_ROW_LENGTH: 0, UNPACK_FLIP_Y_WEBGL: false,
        UNPACK_PREMULTIPLY_ALPHA_WEBGL: false, UNPACK_COLORSPACE_CONVERSION_WEBGL: k.BROWSER_DEFAULT_WEBGL,
    };
    for (const [name, value] of Object.entries(defaults)) set(name, value);

    const indexedBlend = {
        colorMaskiOES: (_: number, ...mask: boolean[]) => set('COLOR_WRITEMASK', mask),
        blendEquationiOES: (_: number, value: number) => set('BLEND_EQUATION_RGB', value),
        // A browser may not count this in what isEnabled(BLEND) answers.
        enableiOES: () => { counts.indexedBlend = true; },
    };
    const methods: Record<string, (...args: any[]) => unknown> = {
        isContextLost: () => false,
        // A new object each time, as after a lost context comes back.
        getExtension: (name: string) => {
            counts.extensions++;
            if (name === 'OES_draw_buffers_indexed') return Object.create(indexedBlend);
            return name === 'EXT_color_buffer_float' ? {} : null;
        },
        getParameter: (key: number) => {
            ask(key);
            if (key in bindingOf) return units[unit].get(bindingOf[key]) ?? null;
            if (key === k.SAMPLER_BINDING) return units[unit].get(k.SAMPLER_BINDING) ?? null;
            if (key === k.DRAW_FRAMEBUFFER_BINDING) return drawFramebuffer;
            if (key === k.READ_FRAMEBUFFER_BINDING) return readFramebuffer;
            if (key === k.DRAW_BUFFER0) return drawBufferOf.get(drawFramebuffer) ?? k.COLOR_ATTACHMENT0;
            if (key === k.READ_BUFFER) return readBufferOf.get(readFramebuffer) ?? k.COLOR_ATTACHMENT0;
            return state.get(key) ?? null;
        },
        getIndexedParameter: (key: number, i: number) => {
            ask(key);
            return key === k.UNIFORM_BUFFER_BINDING ? indexed.get(i) ?? null : 0;
        },
        isEnabled: (cap: number) => enabled.has(cap),
        enable: (cap: number) => { enabled.add(cap); if (cap === k.BLEND) counts.indexedBlend = false; },
        disable: (cap: number) => { enabled.delete(cap); if (cap === k.BLEND) counts.indexedBlend = false; },
        activeTexture: (value: number) => { unit = value - k.TEXTURE0; set('ACTIVE_TEXTURE', value); },
        bindTexture: (target: number, value: object | null) => {
            if (value !== null && deleted.has(value)) throw new Error('a deleted texture was bound again');
            units[unit].set(target, value);
        },
        bindSampler: (i: number, value: object | null) => { units[i].set(k.SAMPLER_BINDING, value); },
        bindFramebuffer: (target: number, value: object | null) => {
            if (target !== k.READ_FRAMEBUFFER) drawFramebuffer = value;
            if (target !== k.DRAW_FRAMEBUFFER) readFramebuffer = value;
        },
        bindBuffer: (target: number, value: object | null) => { state.set(target + 0.5, value); },
        bindBufferBase: (target: number, i: number, value: object | null) => { indexed.set(i, value); state.set(target + 0.5, value); },
        bindBufferRange: (target: number, i: number, value: object | null) => { indexed.set(i, value); state.set(target + 0.5, value); },
        useProgram: (value: unknown) => set('CURRENT_PROGRAM', value),
        bindVertexArray: (value: unknown) => set('VERTEX_ARRAY_BINDING', value),
        bindRenderbuffer: (_: number, value: unknown) => set('RENDERBUFFER_BINDING', value),
        bindTransformFeedback: (_: number, value: unknown) => set('TRANSFORM_FEEDBACK_BINDING', value),
        readBuffer: (value: number) => { readBufferOf.set(readFramebuffer, value); },
        drawBuffers: (values: number[]) => { drawBufferOf.set(drawFramebuffer, values[0]); },
        viewport: (...box: number[]) => set('VIEWPORT', new Int32Array(box)),
        scissor: (...box: number[]) => set('SCISSOR_BOX', new Int32Array(box)),
        colorMask: (...mask: boolean[]) => set('COLOR_WRITEMASK', mask),
        clearColor: (...colour: number[]) => set('COLOR_CLEAR_VALUE', new Float32Array(colour)),
        depthRange: (...range: number[]) => set('DEPTH_RANGE', new Float32Array(range)),
        depthFunc: (value: number) => set('DEPTH_FUNC', value),
        blendFuncSeparate: () => {},
        blendEquation: (value: number) => { set('BLEND_EQUATION_RGB', value); set('BLEND_EQUATION_ALPHA', value); },
        blendEquationSeparate: (rgb: number, alpha: number) => { set('BLEND_EQUATION_RGB', rgb); set('BLEND_EQUATION_ALPHA', alpha); },
        pixelStorei: (key: number, value: unknown) => { state.set(key, value); },
        deleteTexture: (texture: object) => {
            deleted.add(texture);
            for (const bound of units) for (const [target, value] of bound) if (value === texture) bound.set(target, null);
        },
    };
    for (const name of ['isTexture', 'isBuffer', 'isProgram', 'isVertexArray', 'isFramebuffer', 'isSampler', 'isRenderbuffer', 'isTransformFeedback']) {
        methods[name] = (object: object) => { counts.alive++; return !deleted.has(object); };
    }
    Object.assign(proto, methods);
    let unpackColorSpace = 'srgb';
    Object.defineProperty(proto, 'unpackColorSpace', { get: () => unpackColorSpace, set: (value: string) => { unpackColorSpace = value; } });
    const gl = Object.create(proto) as WebGL2RenderingContext;
    const guard = createGlGuard(gl);
    construction = false;
    return { gl, guard, k, state, enabled, units, counts, framebuffers: () => ({ draw: drawFramebuffer, read: readFramebuffer }), buffersOf: (fb: object | null) => ({ draw: drawBufferOf.get(fb), read: readBufferOf.get(fb) }) };
};

describe('the GL state around a WebGL2 pass', () => {
    it('is put back as it was, even when the pass throws', () => {
        const { gl, guard, k, state, enabled } = fakeContext();
        const program = {} as WebGLProgram;
        const vertexArray = {} as WebGLVertexArrayObject;
        gl.useProgram(program);
        gl.bindVertexArray(vertexArray);
        gl.enable(gl.BLEND);

        expect(() => guard.run(() => {
            const pass = guard.gl;
            pass.useProgram({} as WebGLProgram);
            pass.colorMask(false, false, false, false);
            pass.enable(pass.RASTERIZER_DISCARD);
            pass.disable(pass.BLEND);
            pass.viewport(2, 3, 4, 5);
            pass.blendEquation(pass.FUNC_REVERSE_SUBTRACT);
            pass.pixelStorei(pass.UNPACK_ROW_LENGTH, 17);
            pass.pixelStorei(pass.UNPACK_ALIGNMENT, 1);
            pass.activeTexture(pass.TEXTURE0 + 1);
            pass.drawBuffers([pass.NONE]);
            pass.readBuffer(pass.NONE);
            (pass as unknown as { unpackColorSpace: string }).unpackColorSpace = 'display-p3';
            throw new Error('the pass failed');
        })).toThrow('the pass failed');

        expect(state.get(k.CURRENT_PROGRAM)).toBe(program);
        expect(state.get(k.VERTEX_ARRAY_BINDING)).toBe(vertexArray);
        expect(state.get(k.COLOR_WRITEMASK)).toEqual([true, true, true, true]);
        expect([...(state.get(k.VIEWPORT) as Int32Array)]).toEqual([0, 0, 64, 64]);
        expect(state.get(k.BLEND_EQUATION_RGB)).toBe(k.FUNC_ADD);
        expect(state.get(k.UNPACK_ROW_LENGTH)).toBe(0);
        expect(state.get(k.UNPACK_ALIGNMENT)).toBe(4);
        expect(state.get(k.ACTIVE_TEXTURE)).toBe(k.TEXTURE0);
        expect((gl as unknown as { unpackColorSpace: string }).unpackColorSpace).toBe('srgb');
        expect(gl.getParameter(gl.DRAW_BUFFER0)).toBe(k.BACK);
        expect(gl.getParameter(gl.READ_BUFFER)).toBe(k.BACK);
        expect(enabled.has(k.RASTERIZER_DISCARD)).toBe(false);
        expect(enabled.has(k.BLEND)).toBe(true);
    });

    it('asks nothing slow of GL for a pass that changes nothing slow, and only what one changes', () => {
        const { guard, counts } = fakeContext();
        for (let frame = 0; frame < 3; frame++) {
            guard.run(() => {
                guard.gl.bindFramebuffer(guard.gl.FRAMEBUFFER, {} as WebGLFramebuffer);
                guard.gl.enable(guard.gl.BLEND);
            });
        }
        expect(counts.slow).toBe(0);

        guard.run(() => {
            guard.gl.clearColor(0, 1, 0, 1);
            guard.gl.clearColor(1, 0, 0, 1);
        });
        // The colour it had, asked once however many times the pass sets it.
        expect(counts.slow).toBe(1);
    });

    it('never asks GL whether a binding is alive while a frame runs, and binds nothing the pass deleted', () => {
        const { gl, guard, units, k, counts } = fakeContext();
        const output = {} as WebGLTexture;
        gl.bindTexture(gl.TEXTURE_2D, output);
        guard.run(() => guard.gl.deleteTexture(output));
        expect(units[0].get(k.TEXTURE_2D)).toBeNull();
        expect(counts.alive).toBe(0);
    });

    it('asks GL whether a binding is alive when a pass is let go of, where the engine deletes with its own context', () => {
        const { gl, guard, units, k } = fakeContext();
        const output = {} as WebGLTexture;
        gl.bindTexture(gl.TEXTURE_2D, output);
        guard.run(() => gl.deleteTexture(output), true);
        expect(units[0].get(k.TEXTURE_2D)).toBeNull();
    });

    it('puts back the screen\'s draw buffer when the engine had a framebuffer of its own bound', () => {
        const { gl, guard, k, framebuffers, buffersOf } = fakeContext();
        const engine = {} as WebGLFramebuffer;
        gl.bindFramebuffer(gl.FRAMEBUFFER, engine);
        guard.run(() => {
            // The pass starts on the screen.
            guard.gl.drawBuffers([guard.gl.NONE]);
            guard.gl.readBuffer(guard.gl.NONE);
        });
        expect(buffersOf(null)).toEqual({ draw: k.BACK, read: k.BACK });
        expect(framebuffers()).toEqual({ draw: engine, read: engine });
    });

    it('leaves the engine\'s framebuffer bound for code that draws into the pass, and puts back the rest', () => {
        const { gl, guard, k, state, framebuffers } = fakeContext();
        const engine = {} as WebGLFramebuffer;
        gl.bindFramebuffer(gl.FRAMEBUFFER, engine);
        let seen: unknown = null;
        // Never through the screen and back: it did not start there.
        const bind = gl.bindFramebuffer.bind(gl);
        let bound = 0;
        gl.bindFramebuffer = (target: number, framebuffer: WebGLFramebuffer | null) => {
            bound++;
            bind(target, framebuffer);
        };
        guard.run(() => {
            seen = framebuffers().draw;
            guard.gl.depthFunc(guard.gl.NEVER);
        }, false, true);
        expect(seen).toBe(engine);
        expect(bound).toBe(0);
        expect(framebuffers()).toEqual({ draw: engine, read: engine });
        expect(state.get(k.DEPTH_FUNC)).not.toBe(k.NEVER);
    });

    it('puts back what a pass changes for one draw buffer through OES_draw_buffers_indexed', () => {
        const { gl, guard, k, state, counts } = fakeContext();
        gl.enable(gl.BLEND);
        guard.run(() => {
            const indexed = guard.gl.getExtension('OES_draw_buffers_indexed')!;
            indexed.colorMaskiOES(0, false, false, false, false);
            indexed.blendEquationiOES(0, guard.gl.FUNC_REVERSE_SUBTRACT);
            indexed.enableiOES(guard.gl.BLEND, 0);
        });
        expect(state.get(k.COLOR_WRITEMASK)).toEqual([true, true, true, true]);
        expect(state.get(k.BLEND_EQUATION_RGB)).toBe(k.FUNC_ADD);
        // Set back on every buffer, whatever isEnabled answered.
        expect(counts.indexedBlend).toBe(false);
    });

    it('asks the real context for an extension every time, so one comes back on after a lost context', () => {
        const { guard, counts } = fakeContext();
        const before = guard.gl.getExtension('EXT_color_buffer_float');
        const after = guard.gl.getExtension('EXT_color_buffer_float');
        expect(counts.extensions).toBe(2);
        expect(after).not.toBe(before);
        const indexed = [guard.gl.getExtension('OES_draw_buffers_indexed'), guard.gl.getExtension('OES_draw_buffers_indexed')];
        expect(indexed[0]).not.toBe(indexed[1]);
    });

    it('hands the pass a context that is still one to instanceof', () => {
        const { gl, guard } = fakeContext();
        expect(Object.getPrototypeOf(guard.gl)).toBe(Object.getPrototypeOf(gl));
        expect(guard.gl.TEXTURE_2D).toBe(gl.TEXTURE_2D);
    });
});
