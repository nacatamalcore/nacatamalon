import { buildSpriteMaterialShader } from '../render/webgpu/material/sprite_material_shader';
import { SPRITE_QUAD, VERTEX_BUFFERS } from '../render/webgpu/sprite/create_sprite_pipeline';
import { MAX_VIEWS } from '../render/webgpu/sprite/write_sprite_instance';
import { buildUniformLayout, writeUniformValues } from '../render/shared/material_uniforms';
import type { TUniformSignature, TUniformValues } from '../materials/types/t_uniforms';

// A node's small picture has to be drawn by the shader a sprite material really compiles to, or it
// becomes a second implementation that agrees with itself and not with the game. So what goes out
// here is one idea, "what a picture draws through", made of the renderer's own values rather than
// copies of them, and the renderer's own files stay closed.

/**
 * Everything needed to draw one node's small picture through the shader a sprite material compiles
 * to.
 *
 * It is bound the way a sprite with a material is: group `0` binding `0` the frame's numbers
 * (`PREVIEW_FRAME_UNIFORMS`, read by the vertex stage), group `1` binding `0` a sampler and binding
 * `1` the image, group `2` binding `0` the material's numbers (read by the fragment stage). The
 * entry points are `vs` and `fs`.
 *
 * For an editor's thumbnails, not for a game, and with no promise between versions: it follows the
 * renderer.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPreviewHarness = {
    /**
     * The whole WGSL module, exactly what a sprite with this material compiles.
     */
    wgsl: string;
    /**
     * How many numbers the material's buffer in group `2` holds.
     */
    materialFloatCount: number;
    /**
     * Fills that buffer: the engine's own numbers (`time`, `resolution`) and then `values`.
     */
    writeMaterialUniforms: (
        data: Float32Array,
        values: TUniformValues,
        time: number,
        width: number,
        height: number,
    ) => void;
};

/**
 * The corners of the quad a picture is drawn from, as a triangle strip of four: the first vertex
 * buffer, laid out as the first entry of `PREVIEW_VERTEX_BUFFERS`.
 *
 * With no promise between versions: it is the renderer's own quad and changes when it does.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const PREVIEW_QUAD_VERTICES: Float32Array = SPRITE_QUAD;

/**
 * How the two vertex buffers a picture draws with are read: the corners
 * (`PREVIEW_QUAD_VERTICES`) and one sprite (`PREVIEW_INSTANCE`).
 *
 * With no promise between versions: it is the renderer's own table and changes when it does.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const PREVIEW_VERTEX_BUFFERS: readonly GPUVertexBufferLayout[] = VERTEX_BUFFERS;

/**
 * The frame's numbers for a picture: a target one unit wide and one unit high, looked at straight
 * on through the screen's own view.
 *
 * One unit rather than the picture's size in pixels, so the same numbers fill a target of any size.
 * What the material itself reads as `mu.resolution` is the real size, written by
 * `writeMaterialUniforms`.
 *
 * With no promise between versions: it follows the renderer's frame layout.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const PREVIEW_FRAME_UNIFORMS: Float32Array = (() => {
    // The resolution, two numbers of padding, then the views, four numbers each: a position, a turn
    // and a zoom. Slot 0 is the screen, which does not move, turn or magnify.
    const data = new Float32Array(4 + MAX_VIEWS * 4);
    data.set([1, 1], 0);
    data[4 + 3] = 1;
    return data;
})();

/**
 * The one sprite a picture draws: the whole target, white, reading the whole image, upright, with
 * its middle in the middle. Written out by hand in the renderer's order, and a test holds it to the
 * renderer's count.
 *
 * So the coordinate a node reads as `uv` is `(0, 0)` at the top left and `(1, 1)` at the bottom
 * right, as on any sprite.
 *
 * With no promise between versions: it follows the renderer's instance layout.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const PREVIEW_INSTANCE: Float32Array = new Float32Array([
    0.5, 0.5, // position
    1, 1, // size
    0, // rotation
    1, 1, // scale
    1, 1, 1, 1, // tint
    0, 0, // uvOffset
    1, 1, // uvScale
    0.5, 0.5, // anchor
    0, // view: the screen
]);

/**
 * Builds the shader and the parameter plumbing for one node's small picture.
 *
 * `fragment` is what `compilePreviewShader` (or `compileNodePreviews`) wrote: a sprite's
 * `fn effect(color, uv)` and whatever it needs. What comes back is compiled the way a sprite
 * material is, bound as `TPreviewHarness` describes, and drawn with `PREVIEW_QUAD_VERTICES` and
 * `PREVIEW_INSTANCE` as a strip of four vertices and one instance.
 *
 * For an editor's thumbnails, not for a game, and with no promise between versions: it is the
 * renderer's own shader assembly.
 *
 * @param fragment The sprite hook to draw.
 * @param sig The type of each parameter it reads.
 * @returns The shader and how to fill its parameters.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const buildPreviewHarness = (fragment: string, sig: TUniformSignature): TPreviewHarness => {
    const layout = buildUniformLayout(sig);
    return {
        wgsl: buildSpriteMaterialShader(fragment, sig),
        materialFloatCount: layout.floatCount,
        writeMaterialUniforms: (data, values, time, width, height) =>
            writeUniformValues(data, layout, values, time, width, height),
    };
};
