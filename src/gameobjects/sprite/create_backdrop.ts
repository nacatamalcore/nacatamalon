import { createSprite } from './create_sprite';
import { whenLoaded } from '../../loaders';
import type { TSprite, TSpriteOptions } from './types';

/**
 * How wide a backdrop is laid, in pixels, centred where it is: far more than any level a game scrolls.
 */
const SPAN = 65536;

/**
 * What a backdrop shows and where.
 *
 * @category Sprites
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TBackdropOptions = Pick<TSpriteOptions, 'key' | 'texture' | 'atlas' | 'frame' | 'tint' | 'smooth'> & {
    /**
     * How much it moves with the camera: `{ x: 0.2, y: 0 }`, clouds far away that slide slowly by.
     */
    parallax: { x: number; y: number };
    /**
     * Where its top is, in the world: with `parallax.y` at `0`, where it sits on the screen. `0` by
     * default.
     */
    y?: number;
    /**
     * How tall it is. Its picture's height by default; with `repeatY`, ignored.
     */
    height?: number;
    /**
     * Repeats down as well as across, filling everything: a sky, a cave wall. `false` by default.
     */
    repeatY?: boolean;
    /**
     * Where it is drawn among the rest. Behind everything by default.
     */
    zIndex?: number;
};

/**
 * A strip of picture that repeats endlessly across the world and moves with the camera only so much:
 * the far layers of a platformer, clouds, hills, a city skyline, as the 16-bit consoles drew them.
 *
 * One sprite, laid far wider than any level and repeated, with `parallax`: nothing to move every
 * frame, and it is there wherever the camera goes. It moves in whole pixels.
 *
 * @param options The picture, its `parallax`, and where its top is.
 * @returns The sprite, to tint, hide or scroll (`repeatOffset` moves the pattern: clouds drifting).
 *
 * @example
 * ```ts
 * export const Level: TSceneFn = () => {
 *     useLoadTexture({ src: '/backdrops/clouds.png', key: 'clouds' });
 *     useLoadTexture({ src: '/backdrops/hills.png', key: 'hills' });
 *     createBackdrop({ key: 'clouds', parallax: { x: 0.1, y: 0 }, y: 20 });
 *     createBackdrop({ key: 'hills', parallax: { x: 0.4, y: 0.2 }, y: 120 });
 *     return createScene();
 * };
 * ```
 *
 * @category Sprites
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createBackdrop = (options: TBackdropOptions): TSprite => {
    const repeatY = options.repeatY === true;
    const sprite = createSprite({
        key: options.key,
        texture: options.texture,
        atlas: options.atlas,
        frame: options.frame,
        tint: options.tint,
        smooth: options.smooth,
        width: SPAN,
        height: repeatY ? SPAN : options.height ?? 1,
        anchor: { x: 0.5, y: repeatY ? 0.5 : 0 },
        transform: { x: 0, y: options.y ?? 0 },
        repeat: true,
        parallax: options.parallax,
        zIndex: options.zIndex ?? -10000,
    });
    if (!repeatY && options.height === undefined) {
        // Its picture's height once the picture is there: until then a sprite has no size of its own.
        const fit = (): void => {
            const texture = sprite.texture;
            if (texture !== null && texture.status === 'ready') {
                sprite.height = texture.height * Math.abs(sprite.uvScale?.y ?? 1);
            }
        };
        fit();
        if (sprite.texture !== null && sprite.texture.status === 'loading') {
            void whenLoaded(sprite.texture).then(fit);
        }
    }
    return sprite;
};
