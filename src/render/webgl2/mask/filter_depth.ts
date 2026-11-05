import { compileProgram } from '../utils/compile_program';
import { toGlTexture } from '../texture';
import type { ITexture } from '../../interface';
import type { TDrawFilterLayer } from '../../interface/draw/t_draw_filter_layer';
import { LAYER_PARTS, type TLayerPart } from '../../shared/layer_parts';

/**
 * The depth of what a filter holds, kept for its layer: the twin of the WebGPU `filter_depth.ts`,
 * which says what it is for and how it goes. The same pictures, the same three parts.
 *
 * What differs is where the depth comes from. A pass's depth here is a buffer nothing can read, so
 * it is copied into a picture first (`grab`), and GL keeps rows from the bottom: the region's first
 * row is its bottom one, as the filter's own picture keeps it, so both are read at the same pixel.
 *
 * @internal
 */
export type TFilterDepth = {
    /** Starts a frame. */
    beginFrame(): void;
    /**
     * Copies the depth of what is bound for drawing, `width` by `height`, into a picture that can
     * be read, and leaves it bound. Called once the pass is drawn and before its samples are
     * resolved.
     */
    grab(width: number, height: number): void;
    /**
     * Makes the two pictures for one filter from the depth `grab` copied, and keeps them under the
     * filter's picture. `height` is that of the pass, to count rows from the bottom.
     */
    keep(region: { x: number; y: number; width: number; height: number }, height: number, reach: number, picture: ITexture): void;
    /**
     * Lays a filter's picture with the pictures kept for it, in the `parts` asked for (all three
     * unless said). `false` when none were kept this frame, and nothing was drawn.
     */
    drawLayer(layer: TDrawFilterLayer, targetWidth: number, targetHeight: number, vao: WebGLVertexArrayObject, parts?: readonly TLayerPart[]): boolean;
    /** Whether pictures were kept for this filter's picture this frame. */
    kept(picture: ITexture): boolean;
    /** Lets go of the pictures no frame has used in a while. */
    endFrame(): void;
    destroy(): void;
};

const PART_NUMBERS: Record<TLayerPart, number> = { own: 0, near: 1, rest: 2 };

/** How far the nearest depth is looked for: see the WebGPU twin. */
const MOST_REACH = 64;

/** How many frames in a row pictures go unused before they are let go of. */
const SPARE_FRAMES = 180;

/** Where the layer's own two pictures are bound, after the filter's picture at 0. */
const OWN_UNIT = 1;
const NEAR_UNIT = 2;

const FULL_TRIANGLE = /* glsl */ `#version 300 es
void main() {
    vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;

// The pass's depth, read at the region's pixels; off the pass, far.
const COPY_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

uniform highp sampler2D source;
uniform ivec2 offset;

void main() {
    ivec2 pixel = ivec2(gl_FragCoord.xy) + offset;
    ivec2 size = textureSize(source, 0);
    if (any(lessThan(pixel, ivec2(0))) || any(greaterThanEqual(pixel, size))) {
        gl_FragDepth = 1.0;
        return;
    }
    gl_FragDepth = texelFetch(source, pixel, 0).r;
}
`;

// The nearest depth within `reach` pixels, across or down.
const SPREAD_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

uniform highp sampler2D source;
uniform int reach;
uniform int across;

void main() {
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    ivec2 size = textureSize(source, 0);
    ivec2 along = across == 1 ? ivec2(1, 0) : ivec2(0, 1);
    float nearest = 1.0;
    for (int k = -reach; k <= reach; k++) {
        ivec2 other = pixel + along * k;
        if (all(greaterThanEqual(other, ivec2(0))) && all(lessThan(other, size))) {
            nearest = min(nearest, texelFetch(source, other, 0).r);
        }
    }
    gl_FragDepth = nearest;
}
`;

// The filter layer's own reading (see `mask_programs.ts`), one part at a time.
const LAYER_VERTEX = /* glsl */ `#version 300 es
uniform vec4 rect;
uniform vec2 target;
void main() {
    vec2 corner = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1));
    vec2 pixel = rect.xy + corner * rect.zw;
    vec2 clip = pixel / target * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}
`;

const LAYER_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D picture;
uniform highp sampler2D own;
uniform highp sampler2D near;
uniform vec4 rect;
uniform vec2 target;
uniform int part;
out vec4 fragColor;

void main() {
    ivec2 size = textureSize(picture, 0);
    ivec2 corner = ivec2(int(rect.x), int(target.y) - int(rect.y) - size.y);
    ivec2 pixel = clamp(ivec2(gl_FragCoord.xy) - corner, ivec2(0), size - 1);
    vec4 colour = texelFetch(picture, pixel, 0);
    float mine = texelFetch(own, pixel, 0).r;
    float nearest = texelFetch(near, pixel, 0).r;
    // Where a model is, and the effects left it more there than not: what hides what is behind.
    bool solid = mine < 1.0 && colour.a >= 0.5;
    float depth = mine;
    if (part == 0 && !solid) {
        discard;
    }
    if (part == 1) {
        if (solid || (mine >= 1.0 && nearest >= 1.0)) {
            discard;
        }
        depth = mine < 1.0 ? mine : nearest;
    }
    if (part == 2) {
        if (mine < 1.0 || nearest < 1.0) {
            discard;
        }
        depth = 0.0;
    }
    gl_FragDepth = depth;
    fragColor = colour;
}
`;

type TDepthPicture = { texture: WebGLTexture; framebuffer: WebGLFramebuffer; width: number; height: number };
type TSlot = { own: TDepthPicture; near: TDepthPicture };

/**
 * Compiles what keeps a filter's depth and lays its layer with it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createFilterDepth = (gl: WebGL2RenderingContext): TFilterDepth => {
    const copy = compileProgram(gl, FULL_TRIANGLE, COPY_FRAGMENT, 'filter depth copy');
    const copyOffset = gl.getUniformLocation(copy, 'offset');
    gl.useProgram(copy);
    gl.uniform1i(gl.getUniformLocation(copy, 'source'), 0);
    const spread = compileProgram(gl, FULL_TRIANGLE, SPREAD_FRAGMENT, 'filter depth spread');
    const spreadReach = gl.getUniformLocation(spread, 'reach');
    const spreadAcross = gl.getUniformLocation(spread, 'across');
    gl.useProgram(spread);
    gl.uniform1i(gl.getUniformLocation(spread, 'source'), 0);
    const layer = compileProgram(gl, LAYER_VERTEX, LAYER_FRAGMENT, 'filter layer with depth');
    const layerRect = gl.getUniformLocation(layer, 'rect');
    const layerTarget = gl.getUniformLocation(layer, 'target');
    const layerPart = gl.getUniformLocation(layer, 'part');
    gl.useProgram(layer);
    gl.uniform1i(gl.getUniformLocation(layer, 'picture'), 0);
    gl.uniform1i(gl.getUniformLocation(layer, 'own'), OWN_UNIT);
    gl.uniform1i(gl.getUniformLocation(layer, 'near'), NEAR_UNIT);
    // Nothing to read: the corners come from the vertex's number.
    const vao = gl.createVertexArray();
    // Every picture here is read pixel for pixel, and a depth picture read any other way reads nothing.
    const sampler = gl.createSampler();
    gl.samplerParameteri(sampler, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.samplerParameteri(sampler, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const depthPicture = (internal: number, format: number, type: number, attachment: number, width: number, height: number): TDepthPicture => {
        const texture = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, internal, width, height, 0, format, type, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);
        const framebuffer = gl.createFramebuffer()!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, attachment, gl.TEXTURE_2D, texture, 0);
        gl.drawBuffers([gl.NONE]);
        gl.readBuffer(gl.NONE);
        return { texture, framebuffer, width, height };
    };
    // What a pass's depth is copied into: the same kind as the buffer, or GL will not copy it.
    const grabbed = (width: number, height: number): TDepthPicture =>
        depthPicture(gl.DEPTH24_STENCIL8, gl.DEPTH_STENCIL, gl.UNSIGNED_INT_24_8, gl.DEPTH_STENCIL_ATTACHMENT, width, height);
    const kept = (width: number, height: number): TDepthPicture =>
        depthPicture(gl.DEPTH_COMPONENT32F, gl.DEPTH_COMPONENT, gl.FLOAT, gl.DEPTH_ATTACHMENT, width, height);
    const release = (picture: TDepthPicture): void => {
        gl.deleteFramebuffer(picture.framebuffer);
        gl.deleteTexture(picture.texture);
    };

    const slots: TSlot[] = [];
    // The pass's depth, and the picture between the two sweeps: one per size each, used and done
    // with inside one filter.
    const grabs = new Map<string, TDepthPicture>();
    const between = new Map<string, TDepthPicture>();
    const sizesUsed = new Set<string>();
    const laid = new Map<ITexture, TSlot>();
    let current: TDepthPicture | null = null;
    let used = 0;
    let idle = 0;

    const bySize = (cache: Map<string, TDepthPicture>, make: (width: number, height: number) => TDepthPicture, width: number, height: number): TDepthPicture => {
        const key = `${width}x${height}`;
        sizesUsed.add(key);
        let picture = cache.get(key);
        if (picture === undefined) {
            picture = make(width, height);
            cache.set(key, picture);
        }
        return picture;
    };

    const slotFor = (index: number, width: number, height: number): TSlot => {
        const existing = slots[index];
        if (existing !== undefined && existing.own.width === width && existing.own.height === height) {
            return existing;
        }
        if (existing !== undefined) {
            release(existing.own);
            release(existing.near);
        }
        const slot = { own: kept(width, height), near: kept(width, height) };
        slots[index] = slot;
        return slot;
    };

    // One job: `source` read by the program in use into `into`, which writes only its depth.
    const run = (source: WebGLTexture, into: TDepthPicture): void => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, into.framebuffer);
        gl.viewport(0, 0, into.width, into.height);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, source);
        gl.bindSampler(0, sampler);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    return {
        beginFrame: () => {
            used = 0;
            laid.clear();
            current = null;
        },
        grab: (width, height) => {
            const drawing = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
            current = bySize(grabs, grabbed, width, height);
            // A box left on would keep the copy inside it.
            gl.disable(gl.SCISSOR_TEST);
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, drawing);
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, current.framebuffer);
            gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
            gl.bindFramebuffer(gl.FRAMEBUFFER, drawing);
        },
        keep: (region, height, reach, picture) => {
            const source = current;
            current = null;
            if (source === null) {
                return;
            }
            const slot = slotFor(used++, region.width, region.height);
            const far = Math.min(MOST_REACH, Math.max(0, Math.floor(reach)));
            gl.disable(gl.BLEND);
            gl.disable(gl.STENCIL_TEST);
            gl.disable(gl.SCISSOR_TEST);
            // Depth is written only while it is tested: tested, and every pixel passes.
            gl.enable(gl.DEPTH_TEST);
            gl.depthFunc(gl.ALWAYS);
            gl.depthMask(true);
            gl.bindVertexArray(vao);
            gl.useProgram(copy);
            // The region's bottom row, counted from the bottom of the pass.
            gl.uniform2i(copyOffset, region.x, height - region.y - region.height);
            run(source.texture, slot.own);
            if (far > 0) {
                const half = bySize(between, kept, region.width, region.height);
                gl.useProgram(spread);
                gl.uniform1i(spreadReach, far);
                gl.uniform1i(spreadAcross, 1);
                run(slot.own.texture, half);
                gl.uniform1i(spreadAcross, 0);
                run(half.texture, slot.near);
            }
            gl.bindVertexArray(null);
            gl.depthFunc(gl.LESS);
            gl.depthMask(false);
            gl.disable(gl.DEPTH_TEST);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            // With no reach, the nearest depth is each pixel's own.
            laid.set(picture, far > 0 ? slot : { own: slot.own, near: slot.own });
        },
        kept: (picture) => laid.has(picture),
        drawLayer: (item, targetWidth, targetHeight, layerVao, parts = LAYER_PARTS) => {
            const pair = laid.get(item.picture);
            const picture = toGlTexture(item.picture);
            if (pair === undefined || picture === null) {
                return false;
            }
            gl.useProgram(layer);
            gl.uniform4f(layerRect, item.x, item.y, item.width, item.height);
            gl.uniform2f(layerTarget, targetWidth, targetHeight);
            gl.bindVertexArray(layerVao);
            gl.enable(gl.BLEND);
            // Its colour is already multiplied by its alpha, which is what laying it over asks for.
            gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.activeTexture(gl.TEXTURE0 + NEAR_UNIT);
            gl.bindTexture(gl.TEXTURE_2D, pair.near.texture);
            gl.bindSampler(NEAR_UNIT, sampler);
            gl.activeTexture(gl.TEXTURE0 + OWN_UNIT);
            gl.bindTexture(gl.TEXTURE_2D, pair.own.texture);
            gl.bindSampler(OWN_UNIT, sampler);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, picture);
            gl.bindSampler(0, sampler);
            for (const part of parts) {
                // Each part meets the pass's depth its own way: see the WebGPU twin's `PART_DEPTHS`.
                if (part === 'rest') {
                    gl.disable(gl.DEPTH_TEST);
                } else {
                    gl.enable(gl.DEPTH_TEST);
                    gl.depthFunc(gl.LESS);
                    gl.depthMask(part === 'own');
                }
                gl.uniform1i(layerPart, PART_NUMBERS[part]);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }
            gl.disable(gl.DEPTH_TEST);
            gl.depthMask(false);
            gl.bindVertexArray(null);
            return true;
        },
        endFrame: () => {
            let spare = slots.length > used;
            for (const cache of [grabs, between]) {
                for (const key of cache.keys()) {
                    spare ||= !sizesUsed.has(key);
                }
            }
            idle = spare ? idle + 1 : 0;
            if (idle >= SPARE_FRAMES) {
                for (const slot of slots.splice(used)) {
                    release(slot.own);
                    release(slot.near);
                }
                for (const cache of [grabs, between]) {
                    for (const [key, picture] of cache) {
                        if (!sizesUsed.has(key)) {
                            release(picture);
                            cache.delete(key);
                        }
                    }
                }
                idle = 0;
            }
            sizesUsed.clear();
        },
        destroy: () => {
            for (const slot of slots.splice(0)) {
                release(slot.own);
                release(slot.near);
            }
            for (const cache of [grabs, between]) {
                for (const picture of cache.values()) {
                    release(picture);
                }
                cache.clear();
            }
            gl.deleteProgram(copy);
            gl.deleteProgram(spread);
            gl.deleteProgram(layer);
            gl.deleteVertexArray(vao);
            gl.deleteSampler(sampler);
        },
    };
};
