import { toGlTexture } from '../texture';
import type { TDrawItem, TDrawParticles, TDrawParticles3d } from '../../interface';
import type { TCameraSpace } from '../../shared/compute_mvp_3d';
import type { TParticlesPipeline } from './create_particles_pipeline';
import type { TSpritePipeline } from '../sprite/types/t_sprite_pipeline';

/**
 * An emitter's particles and those of every effect they set off, however deep.
 */
const countWithChildren = (item: TDrawParticles | TDrawParticles3d): number => {
    let total = item.count;
    for (const child of item.children ?? []) {
        total += countWithChildren(child);
    }
    return total;
};

/**
 * How many particles this frame will draw, counted before any of them is.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const countParticles = (drawables: readonly TDrawItem[]): number => {
    let total = 0;
    for (const item of drawables) {
        if (item.type === 'particles' || item.type === 'particles3d') {
            total += countWithChildren(item);
        }
    }
    return total;
};

/**
 * Draws one emitter's particles: one call, however many it is holding.
 *
 * **Everything it changes it puts back.** Blending on this card is state that belongs to the
 * context and not to a program, so an emitter that walked away leaving adding-light switched on
 * would brighten every sprite drawn after it, in a way that looks like the sprites are wrong.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
const drawOneEmitter = (
    gl: WebGL2RenderingContext,
    particles: TParticlesPipeline,
    sprites: TSpritePipeline,
    item: TDrawParticles,
): void => {
    if (item.count === 0) {
        return;
    }

    // No picture yet is drawn as a white square the colour tints, rather than not drawn at all.
    const texture = item.texture;
    const ready = texture !== null && texture.status === 'ready' && texture.gpu !== null;
    const smooth = item.smooth ?? sprites.defaultSmooth;

    gl.useProgram(particles.program);
    gl.bindVertexArray(particles.vao);
    particles.write(item.instances, item.count);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, ready ? toGlTexture(texture.gpu!) : sprites.whiteTexture);
    gl.bindSampler(0, sprites.samplers[smooth ? 'linear' : 'nearest']);

    // Turned on here and not assumed. Blending is context state on this card and every pipeline
    // sets it up for itself, so a scene made only of emitters would otherwise draw them with it
    // still switched off: opaque squares instead of a cloud, and four times too bright. It is not
    // hypothetical, because a fountain over a plain background is an ordinary scene.
    gl.enable(gl.BLEND);
    if (item.blend === 'additive') {
        // Colour adds, and the alpha channel is deliberately left alone. Adding that too would push
        // the opacity of the picture being drawn into past one, and a screen-wide effect reading it
        // afterwards would find it half transparent.
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ZERO, gl.ONE);
    } else {
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }

    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, item.count);

    // Handed back the way the sprites expect to find it: one that walked away leaving adding-light
    // switched on would brighten everything drawn after it, and it would look like the sprites were
    // the thing that was wrong.
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindSampler(0, null);
    gl.bindVertexArray(null);
    gl.useProgram(null);
};

/**
 * Draws one emitter's particles in three dimensions, seen through `space`.
 *
 * Everything the flat draw says about blending holds here too, and it is set up here for the same
 * reason. Depth is the difference: **tested and never written**, so a particle behind a model is
 * hidden by it while the particles never hide each other. Both are context state on this card, so
 * both are switched on here and handed back switched off, the way the models leave them.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
const drawOneEmitter3d = (
    gl: WebGL2RenderingContext,
    particles: TParticlesPipeline,
    sprites: TSpritePipeline,
    item: TDrawParticles3d,
    space: TCameraSpace | null,
): void => {
    if (item.count === 0 || space === null) {
        return;
    }

    const texture = item.texture;
    const ready = texture !== null && texture.status === 'ready' && texture.gpu !== null;
    const smooth = item.smooth ?? sprites.defaultSmooth;

    gl.useProgram(particles.program3d);
    particles.setView(space);
    gl.bindVertexArray(particles.vao3d);
    particles.write(item.instances, item.count, true);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, ready ? toGlTexture(texture.gpu!) : sprites.whiteTexture);
    gl.bindSampler(0, sprites.samplers[smooth ? 'linear' : 'nearest']);

    gl.enable(gl.BLEND);
    if (item.blend === 'additive') {
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ZERO, gl.ONE);
    } else {
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.depthMask(false);

    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, item.count);

    gl.disable(gl.DEPTH_TEST);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindSampler(0, null);
    gl.bindVertexArray(null);
    gl.useProgram(null);
};

/**
 * Draws an emitter and then every effect its particles set off, each in a call of its own.
 *
 * The children are drawn even when the emitter has nothing left of its own: a rocket that has burnt
 * out still has its sparks in the air.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const drawParticles = (
    gl: WebGL2RenderingContext,
    particles: TParticlesPipeline,
    sprites: TSpritePipeline,
    item: TDrawParticles,
): void => {
    drawOneEmitter(gl, particles, sprites, item);
    for (const child of item.children ?? []) {
        drawParticles(gl, particles, sprites, child);
    }
};

/**
 * The same in depth, through the same camera as its emitter.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const drawParticles3d = (
    gl: WebGL2RenderingContext,
    particles: TParticlesPipeline,
    sprites: TSpritePipeline,
    item: TDrawParticles3d,
    space: TCameraSpace | null,
): void => {
    drawOneEmitter3d(gl, particles, sprites, item, space);
    for (const child of item.children ?? []) {
        drawParticles3d(gl, particles, sprites, child, space);
    }
};
