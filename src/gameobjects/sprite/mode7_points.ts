import type { TMode7 } from './create_mode7';
import type { TSprite } from './types';

/**
 * Where a point of a Mode 7 map is seen on its floor.
 *
 * @category Sprites
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMode7Point = {
    /**
     * Across, in the floor's own place: where its sprite is measured from, the screen's pixels in a
     * scene without a camera.
     */
    x: number;
    /**
     * Down, measured the same way.
     */
    y: number;
    /**
     * How many pixels of the screen a pixel of the map is there: what something standing on that
     * point is scaled by.
     */
    scale: number;
    /**
     * How far ahead of the camera the point is, in pixels of the map: the larger, the further.
     */
    depth: number;
};

/**
 * How many map pixels ahead is "on the camera itself": nothing that close is seen.
 */
const NEAREST = 1e-6;

/**
 * The placed things go between `-1` and `0`, the nearest closest to `0`: over the floor and the
 * backdrops, under the player's own sprite and the HUD at `0` and above. A pixel of the map this far
 * ahead is halfway.
 */
const HALFWAY = 256;

/**
 * Where the floor is on the screen, and how its view opens. The view is worked out in the floor's own
 * pixels (`uniforms.size`), as the shader works it out, and then laid over the sprite as it is now:
 * moved, or stretched by a `width` or `height` changed since, the two still agree.
 */
const frameOf = (floor: TMode7) => {
    const view = floor.uniforms;
    const width = floor.width ?? view.size.x;
    const height = floor.height ?? view.size.y;
    return {
        left: floor.transform.x - width * (floor.anchor?.x ?? 0.5),
        top: floor.transform.y - height * (floor.anchor?.y ?? 0.5),
        // The floor's own pixels and how many of the screen's each one is drawn as.
        size: view.size,
        acrossScale: width / view.size.x,
        downScale: height / view.size.y,
        width,
        height,
        // How far the screen is from the eye, in the floor's pixels, for the view to open `fov` across it.
        focal: view.size.x / 2 / Math.tan((view.fov * Math.PI) / 360),
        sin: Math.sin(view.angle),
        cos: Math.cos(view.angle),
    };
};

/**
 * Where a point of the map is seen on the floor, and how large: the floor's own arithmetic run the
 * other way, on the CPU. `null` when the point is behind the camera, where nothing of the floor is.
 *
 * A point well ahead but off to the side still has a place, off the floor's edges; a point very far
 * ahead lands just under the horizon, very small.
 *
 * @param floor The floor, from `createMode7`.
 * @param x Across the map, in its pixels.
 * @param y Down the map, in its pixels.
 * @returns Where it is seen, its scale and how far ahead it is, or `null`.
 *
 * @category Sprites
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const mode7ToScreen = (floor: TMode7, x: number, y: number): TMode7Point | null => {
    const view = floor.uniforms;
    const frame = frameOf(floor);
    const dx = x - view.x;
    const dy = y - view.y;
    // Forward is (sin, -cos) and right is (cos, sin): `angle` 0 looks up the map.
    const depth = dx * frame.sin - dy * frame.cos;
    if (depth <= NEAREST) {
        return null;
    }
    const side = dx * frame.cos + dy * frame.sin;
    // Floor pixels per map pixel there, then the screen's.
    const grow = frame.focal / depth;
    return {
        x: frame.left + (frame.size.x / 2 + side * grow) * frame.acrossScale,
        y: frame.top + (view.horizon + view.height * grow) * frame.downScale,
        scale: grow * frame.acrossScale,
        depth,
    };
};

/**
 * The point of the map a point of the floor shows: a click on the track turned into where on the
 * track it is. `null` above the horizon, where there is no floor, and outside the floor.
 *
 * @param floor The floor, from `createMode7`.
 * @param x Across, measured as the floor is (the screen's pixels in a scene without a camera).
 * @param y Down, measured the same way.
 * @returns The point of the map, in its pixels, or `null`.
 *
 * @category Sprites
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const screenToMode7 = (floor: TMode7, x: number, y: number): { x: number; y: number } | null => {
    const view = floor.uniforms;
    const frame = frameOf(floor);
    // In the floor's own pixels, as the shader measures them.
    const across = (x - frame.left) / frame.acrossScale;
    const down = (y - frame.top) / frame.downScale;
    const below = down - view.horizon;
    if (below <= 0 || across < 0 || across > frame.size.x || down > frame.size.y) {
        return null;
    }
    const ahead = (view.height * frame.focal) / below;
    const side = ((across - frame.size.x / 2) * view.height) / below;
    return {
        x: view.x + frame.sin * ahead + frame.cos * side,
        y: view.y - frame.cos * ahead + frame.sin * side,
    };
};

/**
 * Stands a sprite on a point of the map: puts it where the floor shows that point, scales it by how
 * far away it is, orders it with the rest by distance and hides it when it is behind the camera or
 * off the floor. Called every frame for whatever stands on the floor, since the camera moves.
 *
 * The sprite's own size is its size on the map, in the map's pixels, and its `anchor` is the point
 * that stands on it: `{ x: 0.5, y: 1 }`, the middle of its feet, is what a tree or a kart wants.
 *
 * It writes the sprite's `transform` (`x`, `y`, `scaleX`, `scaleY`), its `zIndex` and its
 * `visible`. The `zIndex` it writes is between `-1` and `0`, the nearer the higher: in front of the
 * floor, behind anything at `0` or more, which is where the player's own kart and the HUD go.
 *
 * @param floor The floor, from `createMode7`.
 * @param sprite What stands there.
 * @param x Across the map, in its pixels.
 * @param y Down the map, in its pixels.
 * @returns Whether it is seen.
 *
 * @category Sprites
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const placeOnMode7 = (floor: TMode7, sprite: TSprite, x: number, y: number): boolean => {
    const at = mode7ToScreen(floor, x, y);
    if (at === null) {
        sprite.visible = false;
        return false;
    }
    const frame = frameOf(floor);
    const wide = (sprite.width ?? sprite.texture?.width ?? 0) * at.scale;
    const tall = (sprite.height ?? sprite.texture?.height ?? 0) * at.scale;
    // Off the floor once the whole of it is, whatever its anchor: its size either side is enough.
    const seen = at.x + wide >= frame.left && at.x - wide <= frame.left + frame.width && at.y - tall <= frame.top + frame.height;
    sprite.visible = seen;
    sprite.transform.x = at.x;
    sprite.transform.y = at.y;
    sprite.transform.scaleX = at.scale;
    // Down as the floor is drawn down: the same unless the floor was stretched one way only.
    sprite.transform.scaleY = (at.scale / frame.acrossScale) * frame.downScale;
    sprite.zIndex = -at.depth / (at.depth + HALFWAY);
    return seen;
};
