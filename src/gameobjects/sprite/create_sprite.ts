import { atlasFrame, setSpriteFrame } from "../../atlas";
import { whenLoaded } from "../../loaders";
import type { TLoadable } from "../../loaders";
import { getColor } from "../../color";
import { trackDrawableOwner } from "../../box";
import { getActiveBox, getActiveGame } from "../../store";
import { createRecord } from "../create_record";
import type { TTexture } from "../../loaders";
import type { TSprite, TSpriteOptions } from "./types";
import { listen } from "../../events/listen";

/**
 * Finds the texture the options ask for: an explicit record wins, then a key looked up in this
 * game's cache. A key that is not there throws, because a key is always a deliberate reference and
 * a silent white square would hide the typo.
 */
const resolveTexture = (options: TSpriteOptions): TTexture | null => {
    if (options.texture !== undefined) {
        return options.texture;
    }
    if (options.atlas !== undefined) {
        return options.atlas.texture;
    }
    if (options.key === undefined) {
        return null;
    }

    const found = getActiveGame()?.get('assets').textures.get(options.key);
    if (found === undefined) {
        throw new Error(
            `[NacatamalOn] createSprite: no texture loaded under key '${options.key}'. ` +
            `Did you forget useLoadTexture({ src, key: '${options.key}' })?`,
        );
    }
    return found;
};

/**
 * The window into the image and the image itself, whichever way they were asked for: a sheet plus
 * a frame number, or spelled out by hand. What is written explicitly wins, so a sprite can take
 * its picture from a sheet and still crop it differently.
 */
const resolveFrame = (options: TSpriteOptions) => {
    // No sheet, or one read from a file that has not arrived: nothing to work out yet. The
    // waiting is arranged below, once the record exists.
    if (options.atlas === undefined || options.atlas.frames === 0) {
        return { uvOffset: options.uvOffset, uvScale: options.uvScale };
    }

    const frame = atlasFrame(options.atlas, options.frame ?? 0);
    return {
        uvOffset: options.uvOffset ?? frame.uvOffset,
        uvScale: options.uvScale ?? frame.uvScale,
    };
};

const cleanSpriteOptions = (options: TSpriteOptions) => {
    const { width, height, smooth, anchor, zIndex, flipX, flipY, visible, material, uniforms, tint = getColor('white') } = options;
    const { uvOffset, uvScale } = resolveFrame(options);

    // Default transform
    const transform = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, ...options.transform };

    return { width, height, smooth, anchor, zIndex, flipX, flipY, visible, material, uniforms, uvOffset, uvScale, atlas: options.atlas, texture: resolveTexture(options), transform, tint };
};

/**
 * The two ways to call `createSprite`. Given a `width` and a `height` (a coloured rectangle, or a
 * picture drawn at a size of its own), the sprite that comes back has them as numbers, so
 * `paddle.width` can be used in sums straight away. Given neither, they stay optional: the size is
 * the picture's, and it is not known until the picture has loaded.
 *
 * @category Sprites
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCreateSprite = {
    (options: TSpriteOptions & { width: number; height: number }): TSprite & { width: number; height: number };
    (options: TSpriteOptions): TSprite;
};

/**
 * Puts a picture in the scene: an image from `useLoadTexture`, a frame of a sheet, or a plain
 * coloured rectangle when it has neither.
 *
 * It is placed by its anchor, its middle unless you say otherwise, so `transform: { x: 160, y: 120 }`
 * centres it there. Everything about it is a plain field you can change at any time
 * (`hero.transform.x += 1`, `hero.tint = red`), and the next frame shows it.
 *
 * @example
 * ```ts
 * export const Level: TSceneFn = () => {
 *     const texture = useLoadTexture({ src: '/assets/hero.png' });
 *     const hero = createSprite({ texture, transform: { x: 160, y: 120 } });
 *     // No picture: a coloured rectangle, placed by its top-left corner.
 *     createSprite({ width: 320, height: 16, tint: getColor('#3a2a1a'), anchor: { x: 0, y: 0 }, transform: { y: 224 } });
 *
 *     useUpdate((delta) => {
 *         hero.transform.rotation += delta;
 *     });
 *
 *     return createScene();
 * };
 * ```
 *
 * @param options - Its picture, size, place and look: see {@link TSpriteOptions}.
 * @returns The sprite. Change its fields to move or change it; `destroy(sprite)` removes it.
 *
 * @category Sprites
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createSprite = ((options: TSpriteOptions): TSprite => {
    // Checked before the options are cleaned: resolving a `key` needs the active game, and outside a
    // scene body the honest error is this one, not "no texture under that key".
    const box = getActiveBox();
    const store = getActiveGame();

    if (!box || !store) {
        throw new Error('[NacatamalOn] createSprite: call it inside a scene body, or inside something created with useSpawn.');
    }

    const { width, height, smooth, anchor, zIndex, flipX, flipY, visible, material, uniforms, uvOffset, uvScale, atlas, texture, transform, tint } = cleanSpriteOptions(options);

    // Create a record
    // The frame only means something with a sheet, and is kept so a saved scene keeps its picture.
    const frame = atlas !== undefined ? options.frame ?? 0 : undefined;
    const sprite = createRecord('sprite', { width, height, smooth, anchor, zIndex, flipX, flipY, visible, material, uniforms, uvOffset, uvScale, atlas, frame, texture, transform, tint, destroyed: false });

    box.drawables.push(sprite);

    // Where it ended up, kept outside the record so the record stays plain data. It is what lets
    // `destroy(sprite)` work later, from gameplay code, with no active scene to ask.
    trackDrawableOwner(sprite, box, store);

    // Events are not copied into the sprite: a function is the one thing plain data cannot hold. The
    // pointer keeps them, and forgets them when this part of the scene goes away.
    listen(sprite, options);

    // A sheet from a file only knows its grid once its image has landed, so the frame is set
    // then. Nothing is lost by waiting: the sprite has no image to draw until that same moment.
    if (options.atlas !== undefined && options.atlas.frames === 0) {
        whenLoaded(options.atlas as unknown as TLoadable).then(() => setSpriteFrame(sprite, options.frame ?? 0));
    }

    // return the sprite
    return sprite;
}) as TCreateSprite;
