import { spawnBox } from '../../box';
import { getActiveBox, getActiveGame } from '../../store';
import { outsideSceneBody } from '../../utils/outside_scene_body';
import { useScreenSpace } from '../../hooks/camera/use_screen_space';
import { createSprite } from '../sprite/create_sprite';
import { createSpriteTexture } from './create_sprite_texture';
import type { TSprite } from '../sprite/types/t_sprite';
import type { TViewOptions } from './types';

/**
 * A view of the world in a rectangle of the screen: half of a split screen, a minimap in a corner, a
 * rear-view mirror.
 *
 * The short way to write what `createSpriteTexture({ sees: 'world' })` does with a sprite pinned to
 * the screen showing it: `component` asks for the view's cameras and draws what only the view shows,
 * exactly as there. For a view that is round, carries a material or sits on something that moves,
 * make the picture and show it yourself.
 *
 * It does not take the world off the screen: a split screen, where the halves cover it, says so with
 * `useWorldOffScreen`, and a minimap over the game does not.
 *
 * Whatever you pass after the component reaches it as its arguments, as with `useSpawn`.
 *
 * @param options Where on the screen it goes and how big it is, what is behind it, and what of the
 * world it takes in.
 * @param component What the view looks through and draws on top: its `useCamera2d`, `useCamera3d`
 * or `useCameraFollow`, and a marker. Left out, it looks through the scene's cameras.
 * @returns The sprite showing it, for `viewToWorld` and the rest, and to move it. The picture is its
 * `texture`, for `setViewFilter` and `resizeSpriteTexture`. Its piece, `ownerOf(sprite)`, is the whole
 * view: hidden (`visible = false`) the view is not drawn at all, and `destroy` takes it away.
 *
 * @example
 * ```ts
 * const Half = (player: TSprite) => {
 *     useCamera2d();
 *     useCameraFollow(player);
 * };
 *
 * const Level = () => {
 *     useWorldOffScreen();
 *     const p1 = createSprite({ key: 'hero', transform: { x: 40, y: 200 } });
 *     const p2 = createSprite({ key: 'hero', transform: { x: 120, y: 200 } });
 *     createView({ x: 0, y: 0, width: 240, height: 270 }, Half, p1);
 *     createView({ x: 240, y: 0, width: 240, height: 270 }, Half, p2);
 *     return createScene();
 * };
 * ```
 *
 * @param args - What `component` is called with, the way a maker from `useSpawn` passes them on.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createView = <TArgs extends unknown[]>(
    options: TViewOptions,
    component?: (...args: TArgs) => unknown,
    ...args: TArgs
): TSprite => {
    const store = getActiveGame();
    const parent = getActiveBox();
    if (store === null || parent === null) {
        throw outsideSceneBody('createView');
    }
    const { x, y, ...picture } = options;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new Error(`[NacatamalOn] createView: a view goes at a place on the screen, and was given x ${String(x)}, y ${String(y)}. Give it two numbers, in screen pixels.`);
    }
    if ((options as { sees?: unknown }).sees !== undefined) {
        throw new Error("[NacatamalOn] createView: a view always sees the world, and was given sees. Leave it out, or make the picture with createSpriteTexture.");
    }

    // One piece pinned to the screen holding both, the picture and the sprite showing it, so taking
    // the piece away takes the view. A picture starts its own walk, so being pinned here does not pin
    // what the view draws inside it.
    let shown!: TSprite;
    spawnBox(store, parent, component !== undefined && component.name.length > 0 ? `${component.name}View` : 'view', () => {
        useScreenSpace();
        const texture = createSpriteTexture({ ...picture, sees: 'world' }, component, ...args);
        shown = createSprite({ texture, anchor: { x: 0, y: 0 }, transform: { x, y } });
    }, []);
    return shown;
};
