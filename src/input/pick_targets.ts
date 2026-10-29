import { createFrameContext } from '../game/loop/create_frame_context';
import { fillFrameContext } from '../game/loop/fill_frame_context';
import { spriteSize, unapplyView2d } from '../render/shared';
import { textBlockSize, textOfGlyph } from '../gameobjects/text/expand_text';
import { nineSliceOfPiece } from '../gameobjects/nine_slice/expand_nine_slice';
import type { TFrameContext } from '../render';
import type { TSprite } from '../gameobjects/sprite/types/t_sprite';
import type { TText } from '../gameobjects/text/types/t_text';
import type { TNineSlice } from '../gameobjects/nine_slice/types/t_nine_slice';
import type { TRuntimeStore } from '../store';
import { worldOf } from '../render/shared/world_of';
import { pivotPlace } from '../render/shared/pivot_place';
import { isAway } from '../loaders/texture/is_away';
import { spriteUvWindow } from '../render/shared/sprite_uv';
import { maskedPassOf, shapePixelsOf } from '../mask/masked_pick';
import type { TDrawCamera2d } from '../render/interface';
import type { TMask } from '../mask/types/t_mask';
import type { TMaskLevel, TShapeList } from '../mask/mask_walk';
import type { TPolygon } from '../gameobjects/polygon/types/t_polygon';

type TQuadTransform = { x: number; y: number; rotation: number; scaleX: number; scaleY: number };

/**
 * Whether a world point falls inside a quad placed the way the shader places one: the transform
 * undone (position, then rotation, then scale), and the anchor put back. The one definition of
 * "inside" for anything the pointer can touch, a sprite or the block of a text.
 */
const isInsideQuad = (transform: TQuadTransform, width: number, height: number, anchor: { x: number; y: number }, x: number, y: number): boolean =>
    quadFraction(transform, width, height, anchor, x, y) !== null;

/**
 * Where across and down a quad a world point falls, 0 to 1 each, or `null` when it is outside.
 */
const quadFraction = (transform: TQuadTransform, width: number, height: number, anchor: { x: number; y: number }, x: number, y: number): { u: number; v: number } | null => {
    const sizeX = width * transform.scaleX;
    const sizeY = height * transform.scaleY;
    // Something with no area covers nothing, and dividing by it below would say otherwise.
    if (sizeX === 0 || sizeY === 0) {
        return null;
    }

    const dx = x - transform.x;
    const dy = y - transform.y;
    const c = Math.cos(-transform.rotation);
    const s = Math.sin(-transform.rotation);
    const localX = dx * c - dy * s;
    const localY = dx * s + dy * c;

    // The shader places a corner at `(corner + 0.5 - anchor) * size * scale`, so a point is inside
    // when that fraction, anchor added back, lands between 0 and 1. A negative scale flips the sign
    // of the fraction, and the same test still holds.
    const u = localX / sizeX + anchor.x;
    const v = localY / sizeY + anchor.y;
    return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? { u, v } : null;
};

const CENTRE = { x: 0.5, y: 0.5 };
const TOP_LEFT = { x: 0, y: 0 };

/** Where a picture with a pivot is tested from, written over picture by picture. */
const pivoted = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };

/**
 * Whether a point is on a picture where it is drawn: turned about its pivot when it has one
 * (`pivotPlace`), as the renderer turns it, so it is touched where it is seen.
 */
const isOnPicture = (
    picture: TSprite | TText | TNineSlice,
    width: number,
    height: number,
    fallback: { x: number; y: number },
    x: number,
    y: number,
): boolean => {
    const anchor = picture.anchor ?? fallback;
    const place = pivotPlace(worldOf(picture), picture, anchor, width, height, pivoted);
    return isInsideQuad(place, width, height, picture.pivot ?? anchor, x, y);
};

/**
 * Every sprite, text and nine-slice under a screen point, the one on top first.
 *
 * Built from the same frame the renderer is handed (`fillFrameContext`), so the order of scenes,
 * the `zIndex` sort and which camera each one is seen through have one definition: the one used to
 * draw. What is picked is what is on screen.
 *
 * A text reaches the renderer as its letters, so a letter found on the way stands for its text: the
 * text's whole block is tested once, the first time one of its letters comes up, and the text is
 * listed in that place. Gaps between letters and spaces count as the text, which is what a menu
 * option needs. A nine-slice is the same: it reaches the renderer as its parts, and is tested once,
 * as the whole rectangle, where its first part comes up.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const pickTargets = (store: TRuntimeStore, screenX: number, screenY: number): Array<TSprite | TText | TNineSlice> =>
    pickTargetsAt(store, [{ x: screenX, y: screenY }])[0];

/**
 * `pickTargets` for several screen points at once, from one frame: each finger on the screen asks
 * what is under it every frame, and laying the scene out once per finger would be that many times
 * the work for the same answer.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const pickTargetsAt = (store: TRuntimeStore, points: ReadonlyArray<{ x: number; y: number }>): Array<Array<TSprite | TText | TNineSlice>> => {
    if (points.length === 0) {
        return [];
    }
    const ctx: TFrameContext = createFrameContext();
    fillFrameContext(store, ctx);

    // The screen's pass, which is the last one: pictures drawn inside the game go before it. With
    // masks, what it held before they were worked in: a soft mask's drawables are drawn in a pass of
    // their own, and still have to be touched where they are seen.
    const screenPass = ctx.passes[ctx.passes.length - 1];
    const masked = maskedPassOf(screenPass);
    const { cameras = [] } = screenPass;
    const drawables = (masked?.drawables ?? screenPass.drawables ?? []) as NonNullable<TFrameContext['passes'][number]['drawables']>;
    const cameraIndex = masked?.cameraIndex ?? screenPass.cameraIndex ?? [];
    return points.map((screen) => hitsAt(drawables, cameras, cameraIndex, screen, masked?.levels ?? null, masked?.shapes ?? null));
};

/**
 * Where a screen point falls inside a text's block, in pixels from its top-left corner, the numbers
 * its letters are laid out in: through the camera the text is drawn with, and undone the way it is
 * placed (its pivot, its turn, its size, everything it hangs under). `null` for a text with nothing
 * drawn this frame, nor a block to fall in.
 *
 * The point need not be inside the block: what is in it is for whoever asked to decide.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const textPointAt = (store: TRuntimeStore, text: TText, screen: { x: number; y: number }): { x: number; y: number } | null => {
    const ctx: TFrameContext = createFrameContext();
    fillFrameContext(store, ctx);
    const screenPass = ctx.passes[ctx.passes.length - 1];
    const masked = maskedPassOf(screenPass);
    const { cameras = [] } = screenPass;
    const drawables = (masked?.drawables ?? screenPass.drawables ?? []) as NonNullable<TFrameContext['passes'][number]['drawables']>;
    const cameraIndex = masked?.cameraIndex ?? screenPass.cameraIndex ?? [];

    // Its letters are seen through its scene's camera: the first one found says which.
    const first = drawables.findIndex((drawable) => textOfGlyph(drawable) === text);
    if (first === -1) {
        return null;
    }
    const camera = cameraIndex[first] >= 0 ? cameras[cameraIndex[first]] : null;
    const world = unapplyView2d(camera ?? null, screen);

    const { width, height } = textBlockSize(text);
    const anchor = text.anchor ?? TOP_LEFT;
    const place = pivotPlace(worldOf(text), text, anchor, width, height, pivoted);
    const held = text.pivot ?? anchor;
    if (place.scaleX === 0 || place.scaleY === 0) {
        return null;
    }
    // As `quadFraction`, without keeping it inside: turned back, unscaled, the pivot put back.
    const dx = world.x - place.x;
    const dy = world.y - place.y;
    const c = Math.cos(-place.rotation);
    const s = Math.sin(-place.rotation);
    return {
        x: (dx * c - dy * s) / place.scaleX + held.x * width,
        y: (dx * s + dy * c) / place.scaleY + held.y * height,
    };
};

/** How light a colour is, the way the masks' shaders read `'luminance'`. */
const luminance = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * Whether a shape's sprite is there at this fraction of it: at least half there in its mask's
 * channel, as the stencil cuts. Its whole rectangle until its picture's pixels have been read.
 */
const spriteCovers = (sprite: TSprite, fraction: { u: number; v: number }, channel: TMask['channel']): boolean => {
    const texture = sprite.texture;
    const read = texture === null ? null : shapePixelsOf(texture);
    const tint = sprite.tint;
    if (read === null) {
        return channel === 'alpha' ? tint.a >= 0.5 : luminance(tint.r, tint.g, tint.b) * tint.a >= 0.5;
    }
    const window = spriteUvWindow(sprite);
    const tu = window.offsetX + fraction.u * window.scaleX;
    const tv = window.offsetY + fraction.v * window.scaleY;
    const x = Math.min(read.width - 1, Math.max(0, Math.floor(tu * read.width)));
    const y = Math.min(read.height - 1, Math.max(0, Math.floor(tv * read.height)));
    const at = (y * read.width + x) * 4;
    const alpha = (read.data[at + 3]! / 255) * tint.a;
    if (channel === 'alpha') {
        return alpha >= 0.5;
    }
    return luminance(read.data[at]! / 255 * tint.r, read.data[at + 1]! / 255 * tint.g, read.data[at + 2]! / 255 * tint.b) * alpha >= 0.5;
};

/** Whether a world point is inside a shape's outline, its corners placed as the shape is. */
const polygonCovers = (polygon: TPolygon, x: number, y: number): boolean => {
    const place = worldOf(polygon);
    const dx = x - place.x;
    const dy = y - place.y;
    const c = Math.cos(-place.rotation);
    const s = Math.sin(-place.rotation);
    const lx = (dx * c - dy * s) / (place.scaleX || 1);
    const ly = (dx * s + dy * c) / (place.scaleY || 1);
    let inside = false;
    const points = polygon.points;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i]!;
        const b = points[j]!;
        if ((a.y > ly) !== (b.y > ly) && lx < ((b.x - a.x) * (ly - a.y)) / (b.y - a.y) + a.x) {
            inside = !inside;
        }
    }
    return inside;
};

/**
 * Whether one of a shape's drawables is at a screen point. A map counts wherever it is, since it
 * covers the level it is the map of.
 */
const shapeCovers = (drawable: TShapeList['drawables'][number], camera: TDrawCamera2d | null, screen: { x: number; y: number }, channel: TMask['channel']): boolean => {
    const world = unapplyView2d(camera, screen);
    switch (drawable.type) {
        case 'sprite': {
            const { width, height } = spriteSize(drawable);
            const anchor = drawable.anchor ?? CENTRE;
            const place = pivotPlace(worldOf(drawable), drawable, anchor, width, height, pivoted);
            const fraction = quadFraction(place, width, height, drawable.pivot ?? anchor, world.x, world.y);
            return fraction !== null && spriteCovers(drawable, fraction, channel);
        }
        case 'text': {
            const { width, height } = textBlockSize(drawable);
            return isOnPicture(drawable, width, height, TOP_LEFT, world.x, world.y);
        }
        case 'nine-slice':
            return isOnPicture(drawable, drawable.width, drawable.height, CENTRE, world.x, world.y);
        case 'polygon':
            return polygonCovers(drawable, world.x, world.y);
        case 'tilemap':
            return true;
        default:
            return false;
    }
};

/**
 * Whether a screen point is seen through every mask a drawable is inside: in each rectangle and
 * shape, or out of each inverted one. A soft mask is seen where it is at least half there.
 */
const seenThrough = (
    level: TMaskLevel | null,
    screen: { x: number; y: number },
    cameras: readonly TDrawCamera2d[],
    shapes: ReadonlyMap<TMask, TShapeList>,
): boolean => {
    for (let at = level; at !== null; at = at.parent) {
        const { mask } = at;
        let inside = false;
        if (mask.by === null) {
            const rect = mask.rect!;
            const world = unapplyView2d(at.camera >= 0 ? cameras[at.camera] ?? null : null, screen);
            const place = at.place;
            const dx = world.x - place.x;
            const dy = world.y - place.y;
            const c = Math.cos(-place.rotation);
            const s = Math.sin(-place.rotation);
            const lx = (dx * c - dy * s) / (place.scaleX || 1);
            const ly = (dx * s + dy * c) / (place.scaleY || 1);
            inside = lx >= rect.x && lx <= rect.x + rect.width && ly >= rect.y && ly <= rect.y + rect.height;
        } else {
            const shape = shapes.get(mask);
            if (shape !== undefined) {
                for (let k = 0; k < shape.drawables.length && !inside; k++) {
                    const camera = shape.cameraIndex[k] ?? -1;
                    inside = shapeCovers(shape.drawables[k]!, camera >= 0 ? cameras[camera] ?? null : null, screen, mask.channel);
                }
            }
        }
        if (inside === mask.invert) {
            return false;
        }
    }
    return true;
};

/**
 * What one screen point falls on, from a frame already laid out.
 */
const hitsAt = (
    drawables: NonNullable<TFrameContext['passes'][number]['drawables']>,
    cameras: NonNullable<TFrameContext['passes'][number]['cameras']>,
    cameraIndex: NonNullable<TFrameContext['passes'][number]['cameraIndex']>,
    screen: { x: number; y: number },
    levels: readonly (TMaskLevel | null)[] | null = null,
    shapes: ReadonlyMap<TMask, TShapeList> | null = null,
): Array<TSprite | TText | TNineSlice> => {
    const hits: Array<TSprite | TText | TNineSlice> = [];
    const tested = new Set<TText | TNineSlice>();

    // Back to front: what was painted last is on top.
    for (let i = drawables.length - 1; i >= 0; i--) {
        // What a mask keeps out is not drawn there, so it is not touched there either.
        const level = levels?.[i] ?? null;
        if (level !== null && !seenThrough(level, screen, cameras, shapes!)) {
            continue;
        }
        const camera = cameraIndex[i] >= 0 ? cameras[cameraIndex[i]] : null;
        const world = unapplyView2d(camera ?? null, screen);

        const text = textOfGlyph(drawables[i]);
        if (text !== undefined) {
            if (tested.has(text)) {
                continue;
            }
            tested.add(text);
            if (text.destroyed) {
                continue;
            }
            const { width, height } = textBlockSize(text);
            if (isOnPicture(text, width, height, TOP_LEFT, world.x, world.y)) {
                hits.push(text);
            }
            continue;
        }

        const panel = nineSliceOfPiece(drawables[i]);
        if (panel !== undefined) {
            if (tested.has(panel)) {
                continue;
            }
            tested.add(panel);
            if (panel.destroyed) {
                continue;
            }
            if (isOnPicture(panel, panel.width, panel.height, CENTRE, world.x, world.y)) {
                hits.push(panel);
            }
            continue;
        }

        // Only a sprite is touched. A map is not: it has no size of its own and covers the level,
        // so testing it would put something under the pointer everywhere. Anything else that
        // reaches the frame is not a sprite either, and was being measured as one.
        if (drawables[i].type !== 'sprite') {
            continue;
        }

        const sprite = drawables[i] as TSprite;
        // Not drawn, so not touchable: on its way out, or its image has not arrived or was released.
        if (sprite.destroyed || isAway(sprite.texture)) {
            continue;
        }
        const { width, height } = spriteSize(sprite);
        if (isOnPicture(sprite, width, height, CENTRE, world.x, world.y)) {
            hits.push(sprite);
        }
    }

    return hits;
};
