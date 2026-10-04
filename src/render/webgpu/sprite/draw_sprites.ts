// everyframe
import type { TSpritePipeline } from './types/t_sprite_pipeline';
import type { TSpriteRun } from './types/t_sprite_run';

/**
 * Gets the pass ready to draw sprites: the pipeline, the resolution and the views, the quad and the
 * per-sprite data. Called again after a map's layer has drawn, because that used a pipeline of its
 * own and left none of this set.
 *
 * The slot numbers match the shader: group 0 is the resolution and the views, group 1 is the sheet
 * (changed per batch), buffer 0 is the quad and buffer 1 is the per-sprite data.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const beginSprites = (gpuPass: GPURenderPassEncoder, sprites: TSpritePipeline): void => {
    gpuPass.setPipeline(sprites.pipeline);
    gpuPass.setBindGroup(0, sprites.bindGroup);
    gpuPass.setVertexBuffer(0, sprites.quad);
    gpuPass.setVertexBuffer(1, sprites.instances);
};

/**
 * Draws one batch of sprites: those next to each other that share a sheet and an effect.
 *
 * A batch with an effect of its own runs a different pipeline, so it sets everything itself and says
 * afterwards that it left none of the ordinary state behind. A batch with no effect is drawn exactly
 * as it always was, two calls and nothing else, which is what keeps a screen full of plain sprites
 * costing what it cost before any of this existed.
 *
 * An effect that would not compile is not a batch that disappears: it falls through to the built-in
 * shader, so the sprites keep their sheet, their colour and their place and lose only the effect.
 *
 * @returns Whether the ordinary sprite state is still set, so the next batch knows.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const drawSpriteRun = (
    gpuPass: GPURenderPassEncoder,
    sprites: TSpritePipeline,
    run: TSpriteRun,
    time: number,
    width: number,
    height: number,
): boolean => {
    const material = run.material;
    if (material !== null && material.fragment !== null) {
        const compiled = sprites.materials.get(material);
        if (!compiled.failed && compiled.pipeline !== null) {
            const parameters = sprites.materials.bind(
                compiled,
                material.uniforms ?? {},
                run.uniforms,
                time,
                width,
                height,
            );

            gpuPass.setPipeline(compiled.pipeline);
            gpuPass.setBindGroup(0, sprites.bindGroup);
            gpuPass.setBindGroup(1, run.bindGroup);
            gpuPass.setBindGroup(sprites.materials.group, parameters);
            gpuPass.setVertexBuffer(0, sprites.quad);
            gpuPass.setVertexBuffer(1, sprites.instances);
            gpuPass.draw(4, run.count, 0, run.start);
            return false;
        }
    }

    gpuPass.setBindGroup(1, run.bindGroup);
    // 4 corners (triangle strip) per sprite, `run.count` sprites starting at `run.start`.
    gpuPass.draw(4, run.count, 0, run.start);
    return true;
};
