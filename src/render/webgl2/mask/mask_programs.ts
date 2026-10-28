// everyframe
import { compileProgram } from '../utils/compile_program';
import { FRAME_UNIFORMS_BINDING } from '../bindings';
import { DISTANCE_FIELD_COVERAGE_GLSL, SPRITE_FRAGMENT_HEAD_GLSL, SPRITE_VERTEX_SHADER } from '../sprite/sprite_shader';
import { SPRITE_ATTRIBUTES } from '../sprite/create_sprite_pipeline';
import { SPRITE_STRIDE } from '../sprite/write_sprite_instances';
import { TILEMAP_FRAGMENT_HEAD_GLSL, TILEMAP_VERTEX_SHADER } from '../tilemap/tilemap_shader';
import { toGlTexture } from '../texture';
import type { TDrawMaskLayer } from '../../interface/draw/t_draw_mask_layer';
import type { TDrawStencil } from '../../interface/draw/t_draw_stencil';
import type { TSpritePipeline } from '../sprite/types/t_sprite_pipeline';
import type { TSpriteRun } from '../sprite/types/t_sprite_run';
import type { TTilemapPipeline } from '../tilemap/types/t_tilemap_pipeline';

/**
 * The programs that write masks into the stencil, and the one that lays a soft mask's picture over a
 * pass: the twins of the WebGPU pipelines, line for line the same arithmetic. Made the first time a
 * frame has a mask.
 *
 * @internal
 */
export type TMaskPrograms = {
    sprite: { program: WebGLProgram; reading: WebGLUniformLocation | null };
    tilemap: { program: WebGLProgram; reading: WebGLUniformLocation | null; uniforms: TTilemapPipeline['uniforms'] };
    layer: { program: WebGLProgram; channel: WebGLUniformLocation | null; invert: WebGLUniformLocation | null; vao: WebGLVertexArrayObject };
};

const SPRITE_MASK_MAIN = /* glsl */ `
uniform int reading;

void main() {
    vec4 sampled = texture(spriteTexture, insideWindow(vUv, vWindow));
    float coverage = distanceFieldCoverage(sampled, vUv);
    float value = sampled.a * vTint.a;
    if (reading == 1) {
        value = dot(sampled.rgb * vTint.rgb, vec3(0.2126, 0.7152, 0.0722)) * value;
    }
    if (reading == 2) {
        value = vTint.a * coverage;
    }
    if (value < 0.5) {
        discard;
    }
    fragColor = vec4(0.0);
}
`;

const TILEMAP_MASK_MAIN = /* glsl */ `
uniform int reading;

void main() {
    vec4 sampled = texture(tilesTexture, tileUv()) * layerTint;
    float value = sampled.a;
    if (reading == 1) {
        value = dot(sampled.rgb, vec3(0.2126, 0.7152, 0.0722)) * sampled.a;
    }
    if (value < 0.5) {
        discard;
    }
    fragColor = vec4(0.0);
}
`;

const LAYER_VERTEX = /* glsl */ `#version 300 es
void main() {
    vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;

// A picture drawn by this backend is kept the right way up, its first row at the top, while the
// pixel being drawn counts from the bottom: the row is turned round to read the same pixel.
const LAYER_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D content;
uniform sampler2D shape;
uniform int channel;
uniform int invert;
out vec4 fragColor;

void main() {
    ivec2 size = textureSize(content, 0);
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    pixel.y = size.y - 1 - pixel.y;
    vec4 seen = texelFetch(content, pixel, 0);
    vec4 cut = texelFetch(shape, pixel, 0);
    float through = channel == 1 ? dot(cut.rgb, vec3(0.2126, 0.7152, 0.0722)) : cut.a;
    if (invert == 1) {
        through = 1.0 - through;
    }
    fragColor = seen * clamp(through, 0.0, 1.0);
}
`;

const READINGS = { alpha: 0, luminance: 1, field: 2 } as const;

/**
 * Compiles the mask programs.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createMaskPrograms = (gl: WebGL2RenderingContext): TMaskPrograms => {
    const sprite = compileProgram(gl, SPRITE_VERTEX_SHADER, SPRITE_FRAGMENT_HEAD_GLSL + DISTANCE_FIELD_COVERAGE_GLSL + SPRITE_MASK_MAIN, 'mask sprite');
    gl.uniformBlockBinding(sprite, gl.getUniformBlockIndex(sprite, 'Uniforms'), FRAME_UNIFORMS_BINDING);
    gl.useProgram(sprite);
    gl.uniform1i(gl.getUniformLocation(sprite, 'spriteTexture'), 0);

    const tilemap = compileProgram(gl, TILEMAP_VERTEX_SHADER, TILEMAP_FRAGMENT_HEAD_GLSL + TILEMAP_MASK_MAIN, 'mask tilemap');
    gl.uniformBlockBinding(tilemap, gl.getUniformBlockIndex(tilemap, 'Uniforms'), FRAME_UNIFORMS_BINDING);
    gl.useProgram(tilemap);
    gl.uniform1i(gl.getUniformLocation(tilemap, 'tilesTexture'), 0);

    const layer = compileProgram(gl, LAYER_VERTEX, LAYER_FRAGMENT, 'mask layer');
    gl.useProgram(layer);
    gl.uniform1i(gl.getUniformLocation(layer, 'content'), 0);
    gl.uniform1i(gl.getUniformLocation(layer, 'shape'), 1);

    return {
        sprite: { program: sprite, reading: gl.getUniformLocation(sprite, 'reading') },
        tilemap: {
            program: tilemap,
            reading: gl.getUniformLocation(tilemap, 'reading'),
            uniforms: {
                position: gl.getUniformLocation(tilemap, 'layerPosition'),
                scale: gl.getUniformLocation(tilemap, 'layerScale'),
                rotation: gl.getUniformLocation(tilemap, 'layerRotation'),
                view: gl.getUniformLocation(tilemap, 'layerView'),
                tint: gl.getUniformLocation(tilemap, 'layerTint'),
            },
        },
        // Nothing to read: the corners come from the vertex's number.
        layer: { program: layer, channel: gl.getUniformLocation(layer, 'channel'), invert: gl.getUniformLocation(layer, 'invert'), vao: gl.createVertexArray()! },
    };
};

/**
 * Puts the card in an entry's state: where the stencil has to be for it to draw, what it does to
 * the stencil, whether its colour is written, and the box it is kept inside. Set only when it
 * changes from the entry before.
 *
 * @param previous The state the card is in, `null` at the start of a pass.
 * @param ratio How many of the target's pixels each of the pass's own is.
 * @returns The state the card is in now.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const applyStencil = (gl: WebGL2RenderingContext, next: TDrawStencil, previous: TDrawStencil | null, ratio: number, width: number, height: number): TDrawStencil => {
    if (next === previous) {
        return next;
    }
    if (previous === null || previous.write !== next.write || previous.ref !== next.ref) {
        if (next.write === 'none') {
            gl.stencilFunc(gl.EQUAL, next.ref, 0xff);
            gl.stencilMask(0);
            gl.colorMask(true, true, true, true);
        } else {
            gl.stencilFunc(next.write === 'reset' ? gl.LESS : gl.EQUAL, next.ref, 0xff);
            gl.stencilOp(gl.KEEP, gl.KEEP, next.write === 'add' ? gl.INCR : next.write === 'sub' ? gl.DECR : gl.REPLACE);
            gl.stencilMask(0xff);
            gl.colorMask(false, false, false, false);
        }
    }
    const box = next.scissor;
    if (box !== (previous?.scissor ?? null)) {
        if (box === null) {
            gl.disable(gl.SCISSOR_TEST);
        } else {
            const left = Math.min(width, Math.max(0, Math.round(box.x * ratio)));
            const top = Math.min(height, Math.max(0, Math.round(box.y * ratio)));
            const right = Math.min(width, Math.max(left, Math.round((box.x + box.width) * ratio)));
            const bottom = Math.min(height, Math.max(top, Math.round((box.y + box.height) * ratio)));
            gl.enable(gl.SCISSOR_TEST);
            // Counted from the bottom here, from the top in the pass.
            gl.scissor(left, height - bottom, right - left, bottom - top);
        }
    }
    return next;
};

/**
 * Starts a pass that has something masked in it: the stencil tested, and nothing yet written.
 *
 * @internal
 */
export const beginStencil = (gl: WebGL2RenderingContext): void => {
    gl.enable(gl.STENCIL_TEST);
    gl.stencilFunc(gl.EQUAL, 0, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    gl.stencilMask(0);
};

/**
 * Leaves the card as a pass with nothing masked expects it: no stencil, no box, every colour written.
 *
 * @internal
 */
export const endStencil = (gl: WebGL2RenderingContext): void => {
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.SCISSOR_TEST);
    gl.stencilMask(0xff);
    gl.colorMask(true, true, true, true);
};

/**
 * Writes a run of sprites into the stencil as a mask's shape.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const drawMaskRun = (gl: WebGL2RenderingContext, sprites: TSpritePipeline, masks: TMaskPrograms, run: TSpriteRun): void => {
    gl.useProgram(masks.sprite.program);
    gl.uniform1i(masks.sprite.reading, READINGS[run.distanceField ? 'field' : run.stencil!.channel]);
    gl.bindVertexArray(sprites.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, sprites.instances);
    const base = run.start * SPRITE_STRIDE;
    for (const { location, size, offset } of SPRITE_ATTRIBUTES) {
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, SPRITE_STRIDE, base + offset);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, run.texture);
    gl.bindSampler(0, run.sampler);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, run.count);
    gl.bindVertexArray(null);
};

/**
 * Lays a soft mask's picture over the pass, as much as its shape lets through.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const drawMaskLayer = (gl: WebGL2RenderingContext, sprites: TSpritePipeline, masks: TMaskPrograms, layer: TDrawMaskLayer): void => {
    const content = toGlTexture(layer.content);
    const shape = toGlTexture(layer.shape);
    if (content === null || shape === null) {
        return;
    }
    gl.useProgram(masks.layer.program);
    gl.uniform1i(masks.layer.channel, layer.channel === 'luminance' ? 1 : 0);
    gl.uniform1i(masks.layer.invert, layer.invert ? 1 : 0);
    gl.bindVertexArray(masks.layer.vao);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    // Its colour is already multiplied by its alpha, which is what laying it over asks for.
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, shape);
    gl.bindSampler(1, sprites.samplers.nearest);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, content);
    gl.bindSampler(0, sprites.samplers.nearest);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
};
