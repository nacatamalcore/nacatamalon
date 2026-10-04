import type { TColor } from '../../../color';
import type { IBuffer } from '../i_buffer';
import type { TDrawTexture } from './t_draw_texture';

/**
 * One layer of a map, ready to be drawn in a single call.
 *
 * Where a sprite hands over its position and size and lets the shader build its corners, a layer
 * hands over the corners **already built**: one buffer holding every cell in its place, with the
 * part of the image each one shows written into its own corners.
 *
 * That is the whole reason a map is not a sprite per cell. A sprite says "one picture, here", and a
 * thousand cells showing thirty different parts of a sheet cannot be said that way in one go. With
 * the corners carrying their own piece of the image, the whole layer is one draw however many cells
 * it has.
 *
 * A layer and not the map, because the order things are drawn in belongs to the layer: the ground
 * goes under the player and the treetops over them, and both come from the same map.
 *
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
import type { TDrawShader } from './t_draw_material';
import type { TUniformValues } from '../../../materials/types/t_uniforms';

export type TDrawTilemapLayer = {
    readonly type: 'tilemap';
    /**
     * Where the map's top-left corner sits, in the game's pixels, and how it is turned and scaled.
     * The corners inside the buffer are relative to it.
     */
    readonly transform: { x: number; y: number; rotation: number; scaleX: number; scaleY: number };
    /**
     * Where it ends up once everything above it has moved it, when something did. What `worldOf`
     * answers, and what a backend has to place the corners by.
     */
    readonly worldTransform?: { x: number; y: number; rotation: number; scaleX: number; scaleY: number };
    /**
     * The corners: `x, y, u, v` each, three per triangle and two triangles per cell. Written by the
     * engine, read by the backend, and rewritten in place when a cell changes.
     */
    readonly meshes: ReadonlyArray<{ buffer: IBuffer | null; vertexCount: number }>;
    /**
     * The sheet every cell takes its picture from.
     */
    readonly texture: TDrawTexture | null;
    /**
     * Multiplies the colour of the whole layer, `a` as opacity.
     */
    readonly tint: TColor;
    /**
     * How the sheet is read. Omitted, the game's own setting decides.
     */
    readonly smooth?: boolean;
    /**
     * An effect of its own, or nothing for the built-in shader.
     */
    readonly material?: TDrawShader;
    /**
     * This layer's own values for that material's knobs.
     */
    readonly uniforms?: TUniformValues;
};
