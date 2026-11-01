import type { TCamera2d } from './types/t_camera_2d';
import type { TPixelSnap } from '../game/types/t_game_options';

/**
 * Where each camera is drawn from under `pixelSnap`, kept per camera so rounding allocates nothing
 * frame after frame.
 */
const snapped = new WeakMap<TCamera2d, TCamera2d>();

/**
 * How many of the pixels things are put on one unit of the world takes: the camera's zoom for
 * `'screen'`, since that is how many screen pixels a unit is drawn across, one for `'game'`, and
 * `0` for `'off'`, which puts nothing anywhere. Something seen through no camera is drawn at zoom 1,
 * where the two grids are the same.
 *
 * One number for the camera, the things it looks at and the layers with parallax, so all of them
 * land on the same grid: two grids would leave their difference showing as a pixel back and forth.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const pixelsPerUnit = (snap: TPixelSnap, camera: TCamera2d | null): number => {
    if (snap === 'off') {
        return 0;
    }
    if (snap === 'game' || camera === null || !(camera.zoom > 0)) {
        return 1;
    }
    return camera.zoom;
};

/**
 * A place put on the grid of `pixelsPerUnit`: on whole game pixels at one, on thirds of one at
 * three, which are whole pixels of a screen drawn three times bigger.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const onPixels = (value: number, perUnit: number): number => perUnit === 1 ? Math.round(value) : Math.round(value * perUnit) / perUnit;

/**
 * How far back a corner goes when it falls exactly between two pixels of the grid of
 * `pixelsPerUnit`: to the one before. Left to the graphics card, that tie went either way, so the
 * same sprite came out a column apart in WebGPU and in WebGL2, or with a column twice and its last
 * one gone; the one before is what WebGPU draws when it gets it right. Anywhere else the corner is
 * left where it was: a sprite growing by a fraction would have its far edge step back a pixel now
 * and then if its corner were pulled to the nearest one. Particles follow it too.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const backFromTie = (corner: number, perUnit: number): number => {
    const across = corner * perUnit;
    return Math.abs(across - Math.floor(across) - 0.5) < 1e-4 ? 0.5 / perUnit : 0;
};

const TURN = Math.PI * 2;

/**
 * Not turned: at 0, or a whole turn round, where a spin that has gone round once stops.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const unturned = (rotation: number): boolean => {
    if (rotation === 0) {
        return true;
    }
    const left = Math.abs(rotation % TURN);
    return left < 1e-9 || TURN - left < 1e-9;
};

/**
 * A scene's camera as the picture is drawn through it. Under `pixelSnap` that is on the same pixels
 * as each object, so a camera moved by hand (a `useCamera2d` panned in an update) does not shimmer
 * the picture by a fraction of a pixel. Where it is keeps its fractions, so it moves as fast as it
 * says.
 *
 * The pointer reads the world through this same one, so what is touched is what is seen: a click on
 * the pixel a sprite is drawn on is on the sprite, and `worldX` is the world under that pixel.
 *
 * @param snap The game's `pixelSnap`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const cameraAsDrawn = (camera: TCamera2d | null, snap: TPixelSnap): TCamera2d | null => {
    if (camera === null || snap === 'off') {
        return camera;
    }
    const perUnit = pixelsPerUnit(snap, camera);
    let out = snapped.get(camera);
    if (out === undefined) {
        out = { type: 'camera-2d', id: camera.id, transform: { x: 0, y: 0, rotation: 0 }, zoom: 1 };
        snapped.set(camera, out);
    }
    out.transform.x = onPixels(camera.transform.x, perUnit);
    out.transform.y = onPixels(camera.transform.y, perUnit);
    out.transform.rotation = camera.transform.rotation;
    out.zoom = camera.zoom;
    return out;
};
