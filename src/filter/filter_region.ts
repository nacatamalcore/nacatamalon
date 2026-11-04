import { applyView2d } from '../render/shared/apply_view_2d';
import { pivotPlace } from '../render/shared/pivot_place';
import { spriteSize } from '../render/shared/sprite_size';
import { worldOf } from '../render/shared/world_of';
import type { TDrawCamera2d, TDrawSprite, TDrawTilemapLayer } from '../render/interface';
import type { TDrawFilterLayer } from '../render/interface/draw/t_draw_filter_layer';
import type { TTransform2d } from '../gameobjects/types/t_transform_2d';
import type { TFilter, TFilterRect } from './types/t_filter';

/**
 * A rectangle of what a pass draws on, in its real pixels.
 *
 * @internal
 */
export type TFilterRegion = { x: number; y: number; width: number; height: number };

const CENTRE = { x: 0.5, y: 0.5 };

/**
 * How many real pixels a measured region grows by at a time. Its size changes only when what the
 * object draws outgrows a step, so a turning or a breathing sprite keeps the same pictures rather
 * than making new ones every frame.
 */
const STEP = 16;

/**
 * The most real pixels a `rect` may span before it is cut to what is drawn on: a picture larger than
 * a card can hold would fail, and one this size is already far past any screen.
 */
const LARGEST = 4096;

const stepUp = (size: number): number => Math.max(STEP, Math.ceil(size / STEP) * STEP);

/** Where a picture with a pivot is measured from, written over picture by picture. */
const pivoted: TTransform2d = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };

/**
 * What is being measured, in the pass's game pixels: the smallest and largest corner so far, or
 * `everything` once something without an outline turned up.
 */
type TSpan = { left: number; top: number; right: number; bottom: number; everything: boolean };

/**
 * A fresh measure, with nothing in it.
 *
 * @internal
 */
export const emptySpan = (): TSpan => ({ left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity, everything: false });

const take = (span: TSpan, x: number, y: number): void => {
    // A corner nowhere (a sprite placed at NaN) takes nothing, rather than the whole group with it.
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return;
    }
    span.left = Math.min(span.left, x);
    span.top = Math.min(span.top, y);
    span.right = Math.max(span.right, x);
    span.bottom = Math.max(span.bottom, y);
};

/**
 * Adds what a sprite covers on the screen: its four corners, placed as the renderer places them,
 * through its camera.
 *
 * @internal
 */
export const spanSprite = (span: TSpan, sprite: TDrawSprite, camera: TDrawCamera2d | null): void => {
    const size = spriteSize(sprite);
    const world = worldOf(sprite);
    const place = pivotPlace(world, sprite, sprite.anchor ?? CENTRE, size.width, size.height, pivoted);
    const anchor = sprite.pivot ?? sprite.anchor ?? CENTRE;
    const cos = Math.cos(place.rotation);
    const sin = Math.sin(place.rotation);
    for (let corner = 0; corner < 4; corner++) {
        const u = corner & 1;
        const v = corner >> 1;
        const lx = (u - anchor.x) * size.width * place.scaleX;
        const ly = (v - anchor.y) * size.height * place.scaleY;
        const at = applyView2d(camera, { x: place.x + lx * cos - ly * sin, y: place.y + lx * sin + ly * cos });
        take(span, at.x, at.y);
    }
};

/**
 * Adds a filter's layer already drawn inside this one: its rectangle, which is in real pixels.
 *
 * @internal
 */
export const spanLayer = (span: TSpan, layer: TDrawFilterLayer, pixelRatio: number): void => {
    take(span, layer.x / pixelRatio, layer.y / pixelRatio);
    take(span, (layer.x + layer.width) / pixelRatio, (layer.y + layer.height) / pixelRatio);
};

/**
 * Adds what a map layer covers when it says so (`bounds`, a shape's): the four corners of that
 * rectangle placed as the layer is, through its camera. One that does not say is all of the screen,
 * and one with nothing drawn adds nothing.
 *
 * @internal
 */
export const spanTiles = (span: TSpan, layer: TDrawTilemapLayer, camera: TDrawCamera2d | null): void => {
    // Nothing drawn this frame (shapes with none in their list yet): nothing to measure, rather than
    // the whole screen.
    if (layer.meshes.every((mesh) => mesh.vertexCount === 0)) {
        return;
    }
    const bounds = layer.bounds;
    if (bounds === undefined) {
        spanEverything(span);
        return;
    }
    spanRect(span, bounds, layer.worldTransform ?? layer.transform, camera);
};

/**
 * Says that something without an outline is in it (a model, particles, a map): the region is then
 * all of what is drawn on.
 *
 * @internal
 */
export const spanEverything = (span: TSpan): void => {
    span.everything = true;
};

/**
 * How much room around what it draws a filter leaves: what it was told, or else the most any of its
 * effects says it draws beyond what it is handed.
 *
 * @internal
 */
export const paddingOf = (filter: TFilter, effects: TFilter['effects']): number => {
    if (filter.padding !== null) {
        return Number.isFinite(filter.padding) ? Math.max(0, filter.padding) : 0;
    }
    let most = 0;
    for (const effect of effects) {
        const reach = effect.reach?.(effect.uniforms) ?? 0;
        if (Number.isFinite(reach)) {
            most = Math.max(most, reach);
        }
    }
    return most;
};

/**
 * The rectangle a filter's `rect` covers on the screen, in game pixels: its four corners, in the
 * space of the object, through its camera.
 *
 * @internal
 */
export const spanRect = (span: TSpan, rect: TFilterRect, place: TTransform2d, camera: TDrawCamera2d | null): void => {
    const cos = Math.cos(place.rotation);
    const sin = Math.sin(place.rotation);
    for (let corner = 0; corner < 4; corner++) {
        const cx = rect.x + (corner & 1) * rect.width;
        const cy = rect.y + (corner >> 1) * rect.height;
        const lx = cx * place.scaleX;
        const ly = cy * place.scaleY;
        const at = applyView2d(camera, { x: place.x + lx * cos - ly * sin, y: place.y + lx * sin + ly * cos });
        take(span, at.x, at.y);
    }
};

/**
 * One side of a measured region kept between `low` and `high`, the edge it was cut at fixed and the
 * other one a whole number of steps from it, never past `high` or below `low`.
 */
const keptTo = (from: number, to: number, low: number, high: number): [number, number] => {
    if (from >= low && to <= high) {
        return [from, to];
    }
    if (from < low && to > high) {
        return [low, high];
    }
    if (from < low) {
        return [low, Math.min(high, low + stepUp(to - low))];
    }
    return [Math.max(low, high - stepUp(high - from)), high];
};

/**
 * The region a measure comes to, in real pixels of what is drawn on, or `null` when none of it is on
 * it.
 *
 * A measured one has `padding` around it and grows by steps of `STEP` about its middle; one from a
 * `rect` (`exact`) is the rectangle as it is, so a `crt()` curves exactly the screen it was given.
 * **It is not cut at the edge** of what is drawn on but past the room around it, by steps: one
 * partly off it keeps its pictures as it crosses rather than wanting one of a new size every frame,
 * and one far larger than the screen wants none larger than it. What is off it is read as
 * see-through.
 *
 * @internal
 */
export const regionOf = (
    span: TSpan,
    padding: number,
    exact: boolean,
    target: { width: number; height: number; pixelRatio: number },
): TFilterRegion | null => {
    const ratio = target.pixelRatio;
    if (span.everything) {
        return { x: 0, y: 0, width: target.width, height: target.height };
    }
    if (!(span.right > span.left) || !(span.bottom > span.top)) {
        return null;
    }
    let left = (span.left - padding) * ratio;
    let top = (span.top - padding) * ratio;
    let right = (span.right + padding) * ratio;
    let bottom = (span.bottom + padding) * ratio;
    if (exact) {
        left = Math.round(left);
        top = Math.round(top);
        right = Math.round(right);
        bottom = Math.round(bottom);
        // Its own shape kept, unless it is larger than a picture can be: then what is drawn on.
        if (right - left > LARGEST || bottom - top > LARGEST) {
            left = Math.max(0, left);
            top = Math.max(0, top);
            right = Math.min(target.width, right);
            bottom = Math.min(target.height, bottom);
        }
    } else {
        // Every pixel it touches, whole, and then grown to the step about its middle.
        left = Math.floor(left);
        top = Math.floor(top);
        right = Math.ceil(right);
        bottom = Math.ceil(bottom);
        // Off what is drawn on, room and all: nothing of it, nor of what its effects draw, is seen.
        if (right <= 0 || bottom <= 0 || left >= target.width || top >= target.height) {
            return null;
        }
        // What lies far past the room is never read, so it is not measured: an object as large as
        // a number can be stays a number.
        const room = Math.ceil(padding * ratio);
        left = Math.max(left, -room - STEP);
        top = Math.max(top, -room - STEP);
        right = Math.min(right, target.width + room + STEP);
        bottom = Math.min(bottom, target.height + room + STEP);
        const width = stepUp(right - left);
        const height = stepUp(bottom - top);
        left -= Math.floor((width - (right - left)) / 2);
        top -= Math.floor((height - (bottom - top)) / 2);
        right = left + width;
        bottom = top + height;
        // Kept to what is drawn on and the room around it, which is all its effects can read: an
        // object far larger than the screen asks for no picture larger than the screen. Cut there,
        // it keeps growing by steps, so one crossing that edge still keeps its pictures.
        [left, right] = keptTo(left, right, -room, target.width + room);
        [top, bottom] = keptTo(top, bottom, -room, target.height + room);
    }
    if (right <= 0 || bottom <= 0 || left >= target.width || top >= target.height || right <= left || bottom <= top) {
        return null;
    }
    return { x: left, y: top, width: right - left, height: bottom - top };
};
