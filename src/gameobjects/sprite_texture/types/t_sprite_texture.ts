import type { TColor } from '../../../color';
import type { TTexture } from '../../../loaders';
import type { TBox } from '../../../box';
import type { TDrawable } from '../../types/t_drawable';

/**
 * What a picture made by `createSpriteTexture` takes from outside itself: nothing, a world of its
 * own, or the 3D of the world around it.
 *
 * @category Sprites
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSpriteTextureSees = 'inside' | '3d' | 'world';

/**
 * Which part of the world a view (`sees: 'world'`) takes in, or leaves out: by tags (an object's,
 * `TBox.tags`, or a sprite's, text's or panel's own), by kind of drawing, or by naming objects.
 *
 * The three add up: `{ tags: ['terrain'], objects: [player] }` is the terrain and the player. A tag
 * or a named object takes everything under it as well. As a view's `hide` it leaves what matches out,
 * and as its `only` it takes in nothing else; `hide` wins wherever the two meet. Neither reaches what
 * the view draws itself, and neither brings back what is hidden (`visible: false`), which no view
 * shows. A mask's shape left out still cuts what the view does draw, as it does on the screen.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TViewFilter = {
    /**
     * Objects carrying any of these tags, and everything under them, and sprites, texts and panels
     * carrying one themselves (`useTag(name).add(sprite)`).
     */
    tags?: readonly string[];
    /**
     * Drawings of these kinds: `'sprite'`, `'text'`, `'nine-slice'`, `'tilemap'`, `'particles'`,
     * `'particles-3d'`, `'mesh'`, `'lines'`, `'polygon'`, `'shapes'`.
     */
    kinds?: readonly TDrawable['type'][];
    /**
     * These objects and everything under them, or these drawings. In code only: an object cannot be
     * written into a scene document, so a saved view keeps its tags and kinds and not these, and
     * saving it says so.
     */
    objects?: ReadonlyArray<TBox | TDrawable>;
};

/**
 * A picture that part of a scene is drawn into instead of the screen: a screen inside the game, a
 * monitor, a handheld's display.
 *
 * It sits on the object whose contents it shows. Everything on that object and under it is drawn
 * into `texture` every frame, in the picture's own pixels, and anything else can show `texture` the
 * way it shows a loaded image. The object is where the picture's world ends: a camera asked for in
 * there belongs to the picture, and a lamp in there lights only the picture.
 *
 * Plain data like every record, apart from `texture.gpu`, which is the renderer's.
 *
 * @category Sprites
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSpriteTexture = {
    type: 'sprite-texture';
    id: string;
    /**
     * In pixels. Also how wide the world inside is, before any camera.
     */
    width: number;
    /**
     * In pixels. Also how tall the world inside is, before any camera.
     */
    height: number;
    /**
     * What is drawn into it. `'inside'`: only what is on its object and under it, a world of its own.
     * `'3d'`: the models of the world around it as well, seen from its own camera, which is a
     * security camera and a monitor showing it. `'world'`: the whole world of its scene, its sprites,
     * maps, texts, particles and models, through its own cameras: a minimap, a mirror, half of a
     * split screen. What is on its object is drawn either way, on top: `sees` says only what comes in
     * from outside.
     */
    sees: TSpriteTextureSees;
    /**
     * What a view (`'world'`) leaves out of the world it sees, or `null`. Changed with `setViewFilter`.
     */
    hide: TViewFilter | null;
    /**
     * What alone a view (`'world'`) takes in of the world it sees, or `null` for all of it.
     */
    only: TViewFilter | null;
    /**
     * What the picture is cleared to every frame, behind everything drawn into it.
     */
    background: TColor;
    /**
     * The picture itself, ready from the first frame and found in the game's textures by its `key`.
     */
    texture: TTexture;
};
