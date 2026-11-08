// everyframe
import { SPRITE_TEXTURE_SLOTS } from '../../shared/sprite_batch';
import { SPRITE_ATTRIBUTES } from './create_sprite_pipeline';
import { SPRITE_STRIDE } from './write_sprite_instances';
import type { TSpritePipeline } from './types/t_sprite_pipeline';
import type { TSpriteRun } from './types/t_sprite_run';

/**
 * Gets everything ready to draw sprites. WebGL2 is one big state machine, so this is set again every
 * time rather than trusted to be as the last draw left it: a map's layer in between changed all of
 * it. `lit` is whether the pass has any 2D lights: with none, the program that does not read them.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const beginSprites = (gl: WebGL2RenderingContext, sprites: TSpritePipeline, lit: boolean): void => {
    gl.useProgram((lit ? sprites.lit : sprites.unlit).program);
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
 * byte. A handful of cheap calls per batch, and batches are few: one draws up to eight pictures.
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
    lit: boolean,
): boolean => {
    let ordinary = true;
    let custom = false;
    const material = run.material;
    const materials = run.distanceField ? sprites.distanceFieldMaterials : sprites.materials;

    if (material !== null && material.fragment !== null) {
        materials.warnIfWgpuOnly(material);

        if (material.fragmentGlsl !== null) {
            const compiled = materials.get(material, lit);
            if (!compiled.failed && compiled.program !== null) {
                gl.useProgram(compiled.program);
                // Its maps are read as its sheet is, when they say nothing.
                materials.bind(compiled, material, run.uniforms, time, width, height, run.sampler === sprites.samplers.linear);
                // `vertexAttribPointer` below reads whatever is bound now, and binding the parameters
                // left something else there.
                gl.bindBuffer(gl.ARRAY_BUFFER, sprites.instances);
                ordinary = false;
                custom = true;
            }
        }
    }

    const batch = run.textures.length > 1;
    if (ordinary && (run.distanceField || batch)) {
        // Everything but the program is what plain sprites use, so only that is swapped, and the
        // next plain batch is told to set it back.
        const programs = lit ? sprites.lit : sprites.unlit;
        gl.useProgram(batch
            ? (run.distanceField ? programs.batchDistanceFieldProgram : programs.batchProgram)
            : programs.distanceFieldProgram);
        ordinary = false;
    }

    if (run.additive) {
        // Adding light, the same as additive particles: the colour is added and the alpha of the
        // picture left alone. The next batch is told to put straight alpha back.
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ZERO, gl.ONE);
        ordinary = false;
    }

    const base = run.start * SPRITE_STRIDE;
    for (const { location, size, offset } of SPRITE_ATTRIBUTES) {
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, SPRITE_STRIDE, base + offset);
    }
    if (custom || !batch) {
        // An effect reads its maps from units of its own; its main picture stays on unit zero.
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, run.texture);
        gl.bindSampler(0, run.sampler);
    } else {
        for (let i = 0; i < SPRITE_TEXTURE_SLOTS; i++) {
            gl.activeTexture(gl.TEXTURE0 + i);
            gl.bindTexture(gl.TEXTURE_2D, run.textures[i] ?? sprites.whiteTexture);
            gl.bindSampler(i, run.sampler);
        }
        gl.activeTexture(gl.TEXTURE0);
    }
    // 4 corners (triangle strip) per sprite, `run.count` sprites.
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, run.count);
    return ordinary;
};
