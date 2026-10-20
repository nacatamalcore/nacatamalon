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
    /**
     * The level cut into rooms, as the action games of the consoles did: the camera keeps inside the
     * room the target is in, and when the target walks into another it scrolls across to it. A list of
     * rectangles of the world (rooms of any size, which may leave gaps), or one size for a grid of
     * equal rooms laid from the corner of `bounds` (or of the world, without it), screen by screen; the
     * last of a row that does not fit `bounds` is cut to it.
     * Nothing by default.
     */
    rooms?: TRect[] | { width: number; height: number } | null;
    /**
     * How long the scroll from one room to the next takes, in seconds. `0` cuts straight to it.
     * `0.6` by default.
     */
    scroll?: number;
    /**
     * Called when the target walks into another room, as the scroll starts: to bring back the
     * enemies of a room, to change the music. `from` is `null` for the first room.
     */
    onRoom?: (room: TRect, from: TRect | null) => void;
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
     * The scene's camera, which this moves: the one it has now, so a `useCamera2d` before or after
     * this in the body is the one followed.
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
    rooms: TRect[] | { width: number; height: number } | null;
    scroll: number;
    /**
     * The room the camera is in, or scrolling into. `null` without rooms, or before the target has
     * been in one.
     */
    readonly room: TRect | null;
    /**
     * `true` while the camera scrolls from one room to the next. Many games stop their characters
     * while it does, as the consoles did: that is for the game to do, reading this.
     */
    readonly scrolling: boolean;
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

const contains = (rect: TRect, at: { x: number; y: number }): boolean =>
    at.x >= rect.x && at.x < rect.x + rect.width && at.y >= rect.y && at.y < rect.y + rect.height;

/**
 * The room a point is in: the one it was in while it still is, so two rooms that overlap do not
 * swap back and forth, and the one it was in when it is in none, so a gap between rooms changes
 * nothing.
 */
const roomAt = (
    rooms: TRect[] | { width: number; height: number },
    at: { x: number; y: number },
    current: TRect | null,
    level: TRect | null,
): TRect | null => {
    if (current !== null && contains(current, at)) {
        return current;
    }
    if (Array.isArray(rooms)) {
        return rooms.find((room) => contains(room, at)) ?? current;
    }
    if (rooms.width <= 0 || rooms.height <= 0) {
        return current;
    }
    const origin = level ?? { x: 0, y: 0 };
    const x = origin.x + Math.floor((at.x - origin.x) / rooms.width) * rooms.width;
    const y = origin.y + Math.floor((at.y - origin.y) / rooms.height) * rooms.height;
    if (level === null) {
        return { x, y, width: rooms.width, height: rooms.height };
    }
    // The last room of a row or a column that does not fit the level is cut to it.
    return {
        x,
        y,
        width: Math.max(0, Math.min(x + rooms.width, level.x + level.width) - x),
        height: Math.max(0, Math.min(y + rooms.height, level.y + level.height) - y),
    };
};

const sameRect = (a: TRect, b: TRect): boolean =>
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

const between = (a: TRect, b: TRect, t: number): TRect => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    width: a.width + (b.width - a.width) * t,
    height: a.height + (b.height - a.height) * t,
});

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
 * With `rooms` the level is cut into rooms, as the action games of the consoles did: the camera stays
 * in the target's room and scrolls across when the target walks into the next. The scroll is the
 * bounds moving from one room to the other, so the dead zone and the rest keep working through it.
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
 * @example
 * ```ts
 * declare const Hero: () => void;
 *
 * // Screen by screen, 256 by 224 each, scrolling across in half a second.
 * export const Castle: TSceneFn = () => {
 *     const hero = useSpawn(Hero)();
 *     const follow = useCameraFollow(hero, { rooms: { width: 256, height: 224 }, scroll: 0.5 });
 *
 *     useUpdate(() => {
 *         if (follow.scrolling) return; // the hero waits for the screen
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
    /**
     * The scene's camera as it is now, made when it has none. Asked for every time rather than kept:
     * a `useCamera2d` after this one in the body replaces the scene's camera, and keeping the first
     * would leave this moving one nobody draws through. Not made here and now either, so that
     * `useCamera2d` coming second finds no camera of this one's to warn about.
     */
    const cameraOf = (): TCamera2d => {
        if (scene.camera2d === null) {
            scene.camera2d = createCamera2d();
        }
        return scene.camera2d;
    };
    const random = store.get('random').rng;

    // Where the middle of the view is, unrounded: the camera itself is put on whole pixels, and
    // following from a rounded place would lose a fraction every frame.
    let centre: { x: number; y: number } | null = null;
    let tremor = { strength: 0, seconds: 0, left: 0 };
    // The room it is in, and the one it scrolls from while it does: the scroll is the bounds moving
    // from one room to the other, and the camera kept inside them as always.
    let room: TRect | null = null;
    let leaving: { from: TRect; time: number } | null = null;
    // Where the bounds were last frame, which is where a scroll starts, even from halfway through
    // another one.
    let shown: TRect | null = null;

    const follow: TCameraFollow = {
        get camera() {
            return cameraOf();
        },
        target,
        deadzone: { width: options.deadzone?.width ?? 0, height: options.deadzone?.height ?? 0 },
        bounds: options.bounds ?? null,
        lead: { x: options.lead?.x ?? 0, y: options.lead?.y ?? 0 },
        smooth: options.smooth ?? 0,
        round: options.round ?? true,
        rooms: options.rooms ?? null,
        scroll: options.scroll ?? 0.6,
        get room() {
            return room;
        },
        get scrolling() {
            return leaving !== null;
        },
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
        const camera = cameraOf();
        const screen = screenSizeOf(store.get('screen').canvas);
        const zoom = camera.zoom > 0 ? camera.zoom : 1;
        const half = { x: screen.width / zoom / 2, y: screen.height / zoom / 2 };

        if (follow.target !== null && follow.rooms !== null) {
            const level = rectOf(follow.bounds);
            const next = roomAt(follow.rooms, positionOf(follow.target), room, level);
            if (next !== null && (room === null || !sameRect(next, room))) {
                const from = room;
                leaving = from !== null && follow.scroll > 0 ? { from: shown ?? from, time: 0 } : null;
                room = next;
                options.onRoom?.(next, from);
            }
        }
        if (follow.rooms === null) {
            room = null;
            leaving = null;
            shown = null;
        }

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

        let rect = room ?? rectOf(follow.bounds);
        if (room !== null && leaving !== null) {
            leaving.time += delta;
            const t = Math.min(1, leaving.time / follow.scroll);
            rect = between(leaving.from, room, t);
            if (t >= 1) {
                leaving = null;
            }
        }
        shown = room !== null ? rect : null;
        if (rect !== null) {
            centre = {
                x: keepInside(centre.x, half.x, rect.x, rect.width),
                y: keepInside(centre.y, half.y, rect.y, rect.height),
            };
        }
        // A room smaller than the screen is shown in the middle of it, which must still not show past
        // the level.
        const level = room !== null ? rectOf(follow.bounds) : null;
        if (level !== null) {
            centre = {
                x: keepInside(centre.x, half.x, level.x, level.width),
                y: keepInside(centre.y, half.y, level.y, level.height),
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
