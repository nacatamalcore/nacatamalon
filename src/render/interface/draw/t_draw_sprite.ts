import type { TColor } from "../../../color";
import type { TDrawTexture } from "./t_draw_texture";
import type { TDrawShader } from "./t_draw_material";
import type { TUniformValues } from "../../../materials/types/t_uniforms";

/**
 * What a backend needs to draw one sprite: a quad placed, sized and colored.
 *
 * Owned by the renderer, not by the game. A game object never gets copied into this: its record
 * already has these fields, so it fits by shape and the same reference is passed. That is also
 * why this declares only what drawing reads, so a field the game adds never becomes something
 * every backend has to honour.
 *
 * The quad is placed by its `anchor`, which defaults to its **center**: `x`/`y` is that point of
 * the sprite, and rotation and scale happen around it. The default is the centre because that is
 * where every sprite written before anchors existed expects to be.
 *
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDrawSprite = {
    /**
     * Which kind of drawable this is, so a backend can tell it apart once there are others.
     */
    readonly type: 'sprite';
    /**
     * Where the sprite sits. `x`/`y` in pixels of the game's resolution (not the scaled canvas),
     * origin at the top-left, `y` growing downwards. `rotation` in radians, positive is clockwise.
     * `scaleX`/`scaleY` multiply the size: 1 is unchanged, a negative value mirrors it.
     */
    readonly transform: { x: number; y: number; rotation: number; scaleX: number; scaleY: number };
    /**
     * Where it ends up once everything above it has moved it, when something did. Worked out by the
     * engine each frame; a backend reads this when it is there and `transform` when it is not, which
     * is what `worldOf` answers.
     */
    readonly worldTransform?: { x: number; y: number; rotation: number; scaleX: number; scaleY: number };
    /**
     * Width in pixels, before scale. Omitted: the texture's width, or 0 with no texture.
     */
    readonly width?: number;
    /**
     * Height in pixels, before scale. Omitted: the texture's height, or 0 with no texture.
     */
    readonly height?: number;
    /**
     * The image it shows, or `null` for a plain quad. See {@link TDrawTexture} for what each
     * status draws.
     */
    readonly texture: TDrawTexture | null;
    /**
     * Multiplies the sprite's color, components 0-1, `a` as opacity. With no texture the quad is
     * white underneath, so this is the color it is painted.
     */
    readonly tint: TColor;
    /**
     * Which point of the sprite sits on `transform`, in 0-1 of its own size: `0.5, 0.5` is its
     * middle, `0, 0` its top-left corner, `0.5, 1` the middle of its bottom edge. Rotation and
     * scale happen around it. Omitted is the middle.
     */
    readonly anchor?: { x: number; y: number };
    /**
     * Which part of the texture to show, in 0-1: where the window starts. Omitted is `0, 0`.
     */
    readonly uvOffset?: { x: number; y: number };
    /**
     * How big that window is, in 0-1: `1, 1` is the whole image, `0.5, 1` is its left half.
     * Omitted is the whole image.
     */
    readonly uvScale?: { x: number; y: number };
    /**
     * Mirrors what it shows left to right, and top to bottom. Applied to the window into the
     * texture, never to the quad, so a mirrored sprite covers exactly the same place.
     */
    readonly flipX?: boolean;
    readonly flipY?: boolean;
    /**
     * How the texture is sampled: `false` nearest (crisp), `true` linear (blended). Omitted, the
     * backend uses whatever the game asked for at boot.
     */
    readonly smooth?: boolean;
    /**
     * The texture is a multi-channel distance field (a vector font's letters), not a picture: the
     * shader takes the median of its three channels and turns it into an edge exactly one screen
     * pixel soft, at whatever size the sprite is drawn. Its alpha is the coverage and its colour the
     * tint. Set only by the engine, for the characters of a text in a vector font.
     */
    readonly distanceField?: boolean;
    /**
     * An effect of its own, or nothing for the built-in shader.
     *
     * Only the shader half: a sprite's picture and colour are its own and are already above. Two
     * sprites carrying the same one can still be drawn together, which is why it is compared by
     * identity when the batches are worked out.
     */
    readonly material?: TDrawShader;
    /**
     * This sprite's own values for that material's knobs.
     *
     * Written per batch, so a sprite that has any is a batch of one. That is the cost of the
     * feature and it is worth stating: the alternative was a compiled shader per sprite.
     */
    readonly uniforms?: TUniformValues;
};
