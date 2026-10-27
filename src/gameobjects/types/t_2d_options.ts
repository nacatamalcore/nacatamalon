import type { TColorOption } from '../../color';
import type { TSpriteEvents } from '../../input/types/t_sprite_events';
import type { TSpriteMaterial, TUniformValues } from '../../materials';
import type { TTransform2d } from './t_transform_2d';

/**
 * What the flat pictures share, a sprite, a text and a panel: a rectangle placed by its anchor, turned
 * about its pivot, touched by the pointer. Each adds what is its own (a picture, the words, the
 * borders); these mean the same on all three.
 *
 * Not everything drawn flat: a polygon, a tilemap and particles have options of their own, and
 * something new that is not one of these pictures does not have to fit it. `T3dOptions` is the same
 * for the lit models.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type T2dOptions = {
    /**
     * Where it is, how it is turned and how big. Only what is given: the rest is no turn and a scale
     * of 1, so `{ x, y }` is enough. Copied, so the object handed in stays the caller's.
     */
    transform?: Partial<TTransform2d>;
    /**
     * Which point of it sits on its transform, in 0-1 of its own size: `{ x: 0.5, y: 0.5 }` is its
     * middle, `{ x: 0.5, y: 1 }` the middle of its bottom edge (a character standing on a floor),
     * `{ x: 0, y: 0 }` its top-left corner. Rotation and scale happen around it, unless `pivot` says
     * another point. Default: the middle for a sprite and a panel, the top-left corner for a text.
     *
     * They differ on purpose. A thing of the world sits by its middle, the point it turns and grows
     * on; a text sits by its corner so it grows without moving, and a score going from 9 to 10 does not
     * shift. A label centred on a panel gives them both the same anchor.
     */
    anchor?: { x: number; y: number };
    /**
     * The point it turns and grows about, in 0-1 of its own size, when it is not the anchor: the
     * anchor decides where it sits, the pivot what it spins on. A door anchored at its corner turns on
     * its hinge (`{ x: 0, y: 0.5 }`); a score anchored at its left edge pops bigger from its middle
     * (`{ x: 0.5, y: 0.5 }`). Default: its anchor.
     */
    pivot?: { x: number; y: number };
    /**
     * Its colour, multiplied over what it draws: `'#ff6b1a'`, `0xff6b1a`, `'tomato'` or a `TColor`.
     * Default white, drawn as it is. A `TColor` is copied, so changing this one's `tint` changes no
     * other thing given the same colour.
     */
    tint?: TColorOption;
    /**
     * Whether it is drawn. Default `true`. `false` makes it hidden from the start, which is how a set
     * of them is prepared in advance and shown one at a time.
     */
    visible?: boolean;
    /**
     * Which others it is drawn in front of, within its own scene: higher numbers go on top, and
     * negatives are allowed. The same number keeps the order they were made in. Default `0`. It can
     * be changed at any time and takes effect on the next frame drawn.
     */
    zIndex?: number;
    /**
     * Crisp (`false`) or blended (`true`) when scaled: `false` keeps pixel art crisp. Default: the
     * game's `smooth`.
     */
    smooth?: boolean;
    /**
     * How much it moves with the camera: `1` (the default) as everything else, `0` not at all, and in
     * between further away: `{ x: 0.3, y: 0 }` is a far range of mountains that slides slowly by and
     * keeps its height. Only how it is drawn and touched by the pointer: its placement stays what it
     * says. Something pinned to the screen (`useScreenSpace`, a HUD) does not see the camera, so it
     * has no parallax whatever this says.
     */
    parallax?: { x: number; y: number };
    /**
     * How it lands on what is behind it. `'alpha'` (the default) covers it as far as its alpha says.
     * `'additive'` adds its colour instead, so it can only brighten: a halo, a flash, a glowing
     * "LEVEL UP!", a lamp at night. Two additive things over each other are brighter than one. Can be
     * changed any frame.
     */
    blend?: 'alpha' | 'additive';
    /**
     * What it is, as `useTag` says it: `['wall']`. The same as adding them after.
     */
    tags?: string[];
    /**
     * An effect of its own, from `createMaterial`. Omitted is the built-in shader.
     */
    material?: TSpriteMaterial;
    /**
     * Its own values for that material's knobs, laid over the material's own.
     */
    uniforms?: TUniformValues;
} & TSpriteEvents;
