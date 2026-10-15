import { getActiveBox, getActiveGame } from '../../store';
import { viewOf } from '../../box';
import { ownerOfDrawable } from '../../box/drawable_owner';
import { placementInside, worldPlacementOf } from '../../box/world_placement_of';
import { createCamera2d } from '../../camera';
import { screenSizeOf } from '../../DOM/screen_size';
import { tilemapPlacement } from '../../gameobjects/tilemap/tile_queries';
import { useLateUpdate } from '../loop/use_late_update';
import type { TBox } from '../../box/types/t_box';
import type { TCamera2d } from '../../camera';
import type { TSprite } from '../../gameobjects/sprite/types/t_sprite';
import type { TText } from '../../gameobjects/text/types/t_text';
import type { TNineSlice } from '../../gameobjects/nine_slice/types/t_nine_slice';
import type { TTilemap } from '../../gameobjects/tilemap/types/t_tilemap';
import type { TRect } from '../../hitbox/overlaps';

/**
 * What a camera can follow: an object, something it draws, or a point that the game moves.
 *
 * @category Camera
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCameraTarget = TBox | TSprite | TText | TNineSlice | { x: number; y: number };

/**
 * How a camera follows.
 *
 * @category Camera
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCameraFollowOptions = {
    /**
     * A box in the middle of the screen, in pixels, that the target moves inside without the camera
     * moving: the camera only follows once the target pushes against one of its edges. Nothing by
     * default: the target stays in the very middle.
     */
    deadzone?: { width: number; height: number };
    /**
     * Where the camera may look, so it never shows past the edges of the level: a map, which is its
     * own rectangle, or a rectangle of the world. Nothing by default.
     */
    bounds?: TTilemap | TRect | null;
    /**
     * How far ahead of the target it looks, in pixels: `{ x: 24, y: 0 }` shows more of what is to the
     * right. Turned round by the game when the character turns.
     */
    lead?: { x: number; y: number };
    /**
     * How long it takes to catch up, in seconds, rather than following at once: `0.2` glides. `0`, the
     * default, follows at once, as the consoles did.
     */
    smooth?: number;
    /**
     * Whether the camera stays on whole pixels, so pixel art does not shimmer between two. `true` by
     * default.
     */
    round?: boolean;
};

/**
 * A camera following something: everything it was told, changeable at any time, and its tremor.
 *
 * @category Camera
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCameraFollow = {
    /**
     * The scene's camera, which this moves.
     */
    readonly camera: TCamera2d;
    /**
     * What it follows. `null` holds the camera where it is.
     */
    target: TCameraTarget | null;
    deadzone: { width: number; height: number };
    bounds: TTilemap | TRect | null;
    lead: { x: number; y: number };
    smooth: number;
    round: boolean;
    /**
     * Shakes the view, up to `strength` pixels either way, dying away over `seconds`: a hit, an
     * explosion, a boss landing. A stronger shake replaces a weaker one still going.
     */
    shake: (strength: number, seconds: number) => void;
    /**
     * Puts the camera on its target at once, smoothing or not: after a respawn, a door, a cut.
     */
    snap: () => void;
};

const isObject = (target: TCameraTarget): target is TBox => 'children' in target;
const isDrawn = (target: TCameraTarget): target is TSprite | TText | TNineSlice => 'type' in target && 'transform' in target;

/**
 * Where a target is in the world, now.
 */
const positionOf = (target: TCameraTarget): { x: number; y: number } => {
    if (isObject(target)) {
        const place = worldPlacementOf(target);
        return { x: place.x, y: place.y };
    }
    if (isDrawn(target)) {
        const place = placementInside(ownerOfDrawable(target)?.box ?? null, target.transform);
        return { x: place.x, y: place.y };
    }
    return { x: target.x, y: target.y };
};

/**
 * The rectangle of the world the camera keeps inside, or `null` while there is none: a map that has
 * not loaded yet has no size.
 */
const rectOf = (bounds: TTilemap | TRect | null): TRect | null => {
    if (bounds === null) {
        return null;
    }
    if ('type' in bounds && bounds.type === 'tilemapAsset') {
        if (bounds.status !== 'ready') {
            return null;
        }
        const place = tilemapPlacement(bounds);
        return {
            x: place.x,
            y: place.y,
            width: bounds.width * bounds.cell * Math.abs(place.scaleX),
            height: bounds.height * bounds.cell * Math.abs(place.scaleY),
        };
    }
    return bounds as TRect;
};

/**
 * Keeps a value of the middle of the view inside a stretch of the world, or in the middle of a
 * stretch smaller than the view.
 */
const keepInside = (centre: number, half: number, from: number, size: number): number =>
    size <= half * 2 ? from + size / 2 : Math.min(from + size - half, Math.max(from + half, centre));

/**
 * Makes the scene's camera follow something, the way a platformer's does: a box in the middle the
 * character moves inside freely (`deadzone`), never past the edges of the level (`bounds`), a little
 * ahead of where it goes (`lead`), and a shake for when something hits hard.
 *
 * It moves the camera once every `useUpdate` and every body's move is over, in `useLateUpdate`, so it
 * reads where the character ended up and the two never shake against each other. It follows at once
 * and on whole pixels by default, as the consoles did; `smooth` makes it glide. It works at any
 * `zoom`; a camera turned with `rotation` is not one it can keep a level's edges out of.
 *
 * It uses the scene's camera from `useCamera2d`, or makes it. Everything it was told can be changed
 * on what it returns, at any time: another target for a cutscene, other bounds for another room.
 *
 * @param target What to follow: an object, a sprite it draws, or a point the game moves. `null` to
 *   start still.
 * @param options How: see {@link TCameraFollowOptions}.
 * @returns The follow, to change and to shake.
 *
 * @example
 * ```ts
 * declare const Hero: () => void;
 *
 * export const Level: TSceneFn = () => {
 *     const map = createTilemap({ src: '/maps/level.tilemap' });
 *     const hero = useSpawn(Hero)();
 *     const follow = useCameraFollow(hero, { deadzone: { width: 32, height: 48 }, bounds: map });
 *     const keys = useKeyboard();
 *
 *     useUpdate(() => {
 *         if (keys.justPressed('x')) follow.shake(4, 0.3);
 *     });
 *     return createScene();
 * };
 * ```
 *
 * @category Camera
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useCameraFollow = (target: TCameraTarget | null, options: TCameraFollowOptions = {}): TCameraFollow => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw new Error('[NacatamalOn] useCameraFollow: call it inside a scene body, not from a timer or a callback.');
    }
    const scene = viewOf(box);
    if (scene.camera2d === null) {
        scene.camera2d = createCamera2d();
    }
    const camera = scene.camera2d;
    const random = store.get('random').rng;

    // Where the middle of the view is, unrounded: the camera itself is put on whole pixels, and
    // following from a rounded place would lose a fraction every frame.
    let centre: { x: number; y: number } | null = null;
    let tremor = { strength: 0, seconds: 0, left: 0 };

    const follow: TCameraFollow = {
        camera,
        target,
        deadzone: { width: options.deadzone?.width ?? 0, height: options.deadzone?.height ?? 0 },
        bounds: options.bounds ?? null,
        lead: { x: options.lead?.x ?? 0, y: options.lead?.y ?? 0 },
        smooth: options.smooth ?? 0,
        round: options.round ?? true,
        shake: (strength, seconds) => {
            if (seconds <= 0 || strength <= 0) return;
            const now = tremor.left > 0 ? tremor.strength * (tremor.left / tremor.seconds) : 0;
            if (strength >= now) tremor = { strength, seconds, left: seconds };
        },
        snap: () => {
            centre = null;
        },
    };

    useLateUpdate((delta) => {
        const screen = screenSizeOf(store.get('screen').canvas);
        const zoom = camera.zoom > 0 ? camera.zoom : 1;
        const half = { x: screen.width / zoom / 2, y: screen.height / zoom / 2 };

        if (follow.target !== null) {
            const at = positionOf(follow.target);
            const aim = { x: at.x + follow.lead.x, y: at.y + follow.lead.y };
            if (centre === null) {
                centre = { ...aim };
            } else {
                // Only once the target pushes past an edge of the dead zone, and only as far as it pushed.
                const slack = { x: follow.deadzone.width / 2, y: follow.deadzone.height / 2 };
                const wanted = {
                    x: aim.x > centre.x + slack.x ? aim.x - slack.x : aim.x < centre.x - slack.x ? aim.x + slack.x : centre.x,
                    y: aim.y > centre.y + slack.y ? aim.y - slack.y : aim.y < centre.y - slack.y ? aim.y + slack.y : centre.y,
                };
                // Gliding catches up a share of the way each frame, the same share of time at any
                // refresh rate.
                const share = follow.smooth > 0 ? 1 - Math.exp(-delta / follow.smooth) : 1;
                centre = { x: centre.x + (wanted.x - centre.x) * share, y: centre.y + (wanted.y - centre.y) * share };
            }
        }
        if (centre === null) {
            return;
        }

        const rect = rectOf(follow.bounds);
        if (rect !== null) {
            centre = {
                x: keepInside(centre.x, half.x, rect.x, rect.width),
                y: keepInside(centre.y, half.y, rect.y, rect.height),
            };
        }

        // The shake, on top of where the camera is, dying away; never kept, so it leaves nothing behind.
        let shaken = { x: 0, y: 0 };
        if (tremor.left > 0) {
            const strength = tremor.strength * (tremor.left / tremor.seconds);
            shaken = { x: random.rand(-strength, strength), y: random.rand(-strength, strength) };
            tremor.left = Math.max(0, tremor.left - delta);
        }

        const x = centre.x - half.x + shaken.x;
        const y = centre.y - half.y + shaken.y;
        camera.transform.x = follow.round ? Math.round(x) : x;
        camera.transform.y = follow.round ? Math.round(y) : y;
    });

    return follow;
};
