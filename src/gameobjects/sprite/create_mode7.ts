import { createSprite } from './create_sprite';
import { createMaterial } from '../material/create_material';
import { getColor } from '../../color/get_color';
import { screenSizeOf } from '../../DOM/screen_size';
import { viewOf } from '../../box/view_of';
import { getActiveBox, getActiveGame } from '../../store';
import { outsideSceneBody } from '../../utils/outside_scene_body';
import { MODE7_GLSL, MODE7_WGSL } from './mode7_shader';
import type { TColor, TColorOption } from '../../color';
import type { TSprite, TSpriteOptions } from './types';

/**
 * Where a Mode 7 floor is looked at from, and how it looks: the numbers its picture is drawn with.
 * They are the floor's `uniforms`, so writing one is what moves the floor on the next frame:
 * `floor.uniforms.angle += 0.1`.
 *
 * Distances are in the pixels of the floor's picture, the map: a kart at `x: 300` is 300 pixels of
 * the map across, the same numbers `tileAt` and the physics read.
 *
 * @category Sprites
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMode7View = {
    /**
     * Where the camera stands on the map, across.
     */
    x: number;
    /**
     * Where the camera stands on the map, down.
     */
    y: number;
    /**
     * Which way it looks, in radians, as a 2D turn is measured: `0` looks up the map, and it grows
     * clockwise, so `Math.PI / 2` looks to the right of it.
     */
    angle: number;
    /**
     * How high above the floor the camera is, in pixels of the map. Lower is faster-looking and
     * flatter; higher sees more of the map at once, the view of a world map.
     */
    height: number;
    /**
     * The row of the floor where the horizon is, in pixels from its top. Nothing is drawn above it.
     */
    horizon: number;
    /**
     * The floor's own size, in pixels, which the view is worked out in: the size it was made with.
     * The shader and `placeOnMode7` both read it, so they agree whatever the screen does afterwards;
     * changing the sprite's `width` or `height` stretches the floor and what stands on it alike.
     */
    size: { x: number; y: number };
    /**
     * How wide the view opens from side to side, in degrees. It is also how deep the floor looks
     * from top to bottom, since the screen is one picture seen through one eye: a wider view brings
     * every point of the map nearer the horizon and makes it smaller. So changing it moves whatever
     * stands on the floor; what `placeOnMode7` places follows, and a sprite put on the screen by
     * hand (a kart always at the bottom) has to be put again, or it shows another point of the map.
     */
    fov: number;
    /**
     * `1` repeats the map past its edges, `0` shows `outside` there. Set by the `outside` option.
     */
    repeat: number;
    /**
     * What is past the edges of the map when it does not repeat. Transparent shows what is behind.
     */
    outside: TColor;
    /**
     * The colour the far floor fades into. Its alpha is how much it fades in the end.
     */
    hazeColor: TColor;
    /**
     * How far ahead the haze starts, in pixels of the map.
     */
    hazeFrom: number;
    /**
     * How far ahead it is complete. No haze while this is not past `hazeFrom`.
     */
    hazeTo: number;
};

/**
 * A Mode 7 floor: a sprite, whose `uniforms` are where it is looked at from.
 *
 * @category Sprites
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMode7 = TSprite & { uniforms: TMode7View };

/**
 * What a Mode 7 floor shows and how it is first looked at. Everything but the picture can be changed
 * afterwards in the floor's `uniforms`.
 *
 * @category Sprites
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMode7Options = Pick<TSpriteOptions, 'key' | 'texture' | 'smooth'> & {
    /**
     * Where the camera starts, across the map. `0` by default.
     */
    x?: number;
    /**
     * Where the camera starts, down the map. `0` by default.
     */
    y?: number;
    /**
     * Which way it starts looking. `0`, up the map, by default.
     */
    angle?: number;
    /**
     * How high above the floor the camera is, in pixels of the map. `32` by default.
     */
    height?: number;
    /**
     * The row of the horizon, in pixels from the top. A third of the way down by default.
     */
    horizon?: number;
    /**
     * How wide the view opens, in degrees, and so how deep the floor looks (see `TMode7View.fov`).
     * `45` by default.
     */
    fov?: number;
    /**
     * What is past the edges of the map: `'repeat'`, the default, carries on with the map itself;
     * a colour shows that colour, and a transparent one whatever is behind the floor.
     */
    outside?: 'repeat' | TColorOption;
    /**
     * The far floor fading into a colour, from `from` pixels ahead until it is all colour at `to`:
     * a distance of its own, and what hides the shimmer of hard pixels that far away. None by
     * default.
     */
    haze?: { color: TColorOption; from: number; to: number };
    /**
     * Where it is drawn among the rest. Behind what is placed on it and in front of the backdrops
     * by default (`-5000`).
     */
    zIndex?: number;
};

/**
 * Nothing at all, for the haze that is not asked for. A new one each time: the floor's colours are
 * its own to change (`floor.uniforms.hazeColor.a = 0.5`), and a shared one would change every floor.
 */
const clear = (): TColor => ({ r: 0, g: 0, b: 0, a: 0 });

/**
 * The size of what the floor is made on: the view it is drawn into (half of a split screen), or the
 * screen.
 */
const sizeHere = (): { width: number; height: number } => {
    const box = getActiveBox();
    const store = getActiveGame();
    if (box === null || store === null) {
        throw outsideSceneBody('createMode7');
    }
    const picture = viewOf(box).spriteTexture;
    return picture !== null ? { width: picture.texture.width, height: picture.texture.height } : screenSizeOf(store.get('screen').canvas);
};

/**
 * A floor seen in perspective that turns and stretches as the camera moves over it, the Mode 7 of
 * the 16-bit consoles: the track of a kart racer, the world map seen from the air, the arena that
 * spins under a boss.
 *
 * One sprite as large as the screen, or as the view it is made in, whose picture is the map seen
 * from above. A material works out, for every pixel below the horizon, the point of the map it is
 * looking at; above the horizon nothing is drawn, so a `createBackdrop` behind it is the sky.
 *
 * The camera is the floor's `uniforms` (`x`, `y`, `angle`, `height`…), in pixels of the map. Things
 * standing on the floor (trees, coins, the other karts) are ordinary sprites put where the floor
 * shows them with `placeOnMode7`, and `screenToMode7` turns a click into a point of the map.
 *
 * The scene it is in needs no camera of its own: the floor is its camera. It is drawn from the top
 * left of where it is made, and fills what it is made on with the size that has when it is made.
 *
 * @param options The map, how it is first looked at, what is past its edges and the haze.
 * @returns The floor, a sprite.
 *
 * @example
 * ```ts
 * export const Race: TSceneFn = () => {
 *     useLoadTexture({ src: '/maps/track.png', key: 'track' });
 *     createBackdrop({ key: 'hills', parallax: { x: 0, y: 0 }, y: 40 });
 *     const floor = createMode7({ key: 'track', horizon: 76, height: 24, x: 512, y: 900 });
 *     const tree = createSprite({ key: 'tree', anchor: { x: 0.5, y: 1 } });
 *     const keys = useKeyboard();
 *
 *     useUpdate((delta) => {
 *         if (keys.isDown('ArrowLeft')) floor.uniforms.angle -= delta * 2;
 *         if (keys.isDown('ArrowRight')) floor.uniforms.angle += delta * 2;
 *         if (keys.isDown('ArrowUp')) {
 *             floor.uniforms.x += Math.sin(floor.uniforms.angle) * delta * 200;
 *             floor.uniforms.y -= Math.cos(floor.uniforms.angle) * delta * 200;
 *         }
 *         placeOnMode7(floor, tree, 540, 700);
 *     });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Sprites
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createMode7 = (options: TMode7Options): TMode7 => {
    const size = sizeHere();
    const outside = options.outside ?? 'repeat';
    const view: TMode7View = {
        x: options.x ?? 0,
        y: options.y ?? 0,
        angle: options.angle ?? 0,
        height: options.height ?? 32,
        horizon: options.horizon ?? Math.round(size.height / 3),
        size: { x: size.width, y: size.height },
        fov: options.fov ?? 45,
        repeat: outside === 'repeat' ? 1 : 0,
        outside: outside === 'repeat' ? clear() : getColor(outside),
        hazeColor: options.haze === undefined ? clear() : getColor(options.haze.color),
        hazeFrom: options.haze?.from ?? 0,
        hazeTo: options.haze?.to ?? 0,
    };
    // The material carries the effect and the sprite its own numbers, so two floors (a split screen)
    // share one compiled shader and each still looks from its own place. The material's are only
    // the kinds of its numbers, and a copy all the way down, so nothing of the floor's is shared.
    const floor = createMaterial({ name: 'mode7', fragment: MODE7_WGSL, fragmentGlsl: MODE7_GLSL, uniforms: structuredClone(view) });
    return createSprite({
        key: options.key,
        texture: options.texture,
        smooth: options.smooth,
        width: size.width,
        height: size.height,
        anchor: { x: 0, y: 0 },
        material: floor,
        uniforms: view,
        zIndex: options.zIndex ?? -5000,
    }) as TMode7;
};
