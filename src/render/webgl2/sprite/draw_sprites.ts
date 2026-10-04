// everyframe
import { SPRITE_ATTRIBUTES } from './create_sprite_pipeline';
import { SPRITE_STRIDE } from './write_sprite_instances';
import type { TSpritePipeline } from './types/t_sprite_pipeline';
import type { TSpriteRun } from './types/t_sprite_run';

/**
 * Gets everything ready to draw sprites. WebGL2 is one big state machine, so this is set again every
 * time rather than trusted to be as the last draw left it: a map's layer in between changed all of
 * it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const beginSprites = (gl: WebGL2RenderingContext, sprites: TSpritePipeline): void => {
    gl.useProgram(sprites.program);
    gl.bindVertexArray(sprites.vao);
    // Straight alpha, the same blend as the WebGPU pipeline.
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.activeTexture(gl.TEXTURE0);
    // `vertexAttribPointer` reads the buffer bound right now.
    gl.bindBuffer(gl.ARRAY_BUFFER, sprites.instances);
};

/**
 * Draws one batch of sprites.
 *
 * WebGPU starts a batch at a given sprite; WebGL2 always starts at the first, so instead the
 * per-sprite attributes are pointed at the batch's first entry: the same buffer, read from a later
 * byte. Nine cheap calls per batch, and batches are few when a layer shares a sheet.
 *
 * A batch with an effect of its own runs a different program over the same corners, which is legal
 * because both were built from the same vertex half and so name the attributes in the same places.
 * Afterwards it says it left the ordinary program behind, so the next batch puts it back.
 *
 * An effect written for the other card only, or one that would not compile, falls through to the
 * built-in shader: the sprites keep their sheet, their colour and their place and lose the effect.
 *
 * @returns Whether the ordinary sprite state is still set, so the next batch knows.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const drawSpriteRun = (
    gl: WebGL2RenderingContext,
    sprites: TSpritePipeline,
    run: TSpriteRun,
    time: number,
    width: number,
    height: number,
): boolean => {
    let ordinary = true;
    const material = run.material;

    if (material !== null && material.fragment !== null) {
        sprites.materials.warnIfWgpuOnly(material);

        if (material.fragmentGlsl !== null) {
            const compiled = sprites.materials.get(material);
            if (!compiled.failed && compiled.program !== null) {
                gl.useProgram(compiled.program);
                sprites.materials.bind(compiled, material.uniforms ?? {}, run.uniforms, time, width, height);
                // `vertexAttribPointer` below reads whatever is bound now, and binding the parameters
                // left something else there.
                gl.bindBuffer(gl.ARRAY_BUFFER, sprites.instances);
                ordinary = false;
            }
        }
    }

    const base = run.start * SPRITE_STRIDE;
    for (const { location, size, offset } of SPRITE_ATTRIBUTES) {
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, SPRITE_STRIDE, base + offset);
    }
    gl.bindTexture(gl.TEXTURE_2D, run.texture);
    gl.bindSampler(0, run.sampler);
    // 4 corners (triangle strip) per sprite, `run.count` sprites.
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, run.count);
    return ordinary;
};
