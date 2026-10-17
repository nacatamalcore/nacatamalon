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

type TQuadTransform = { x: number; y: number; rotation: number; scaleX: number; scaleY: number };

/**
 * Whether a world point falls inside a quad placed the way the shader places one: the transform
 * undone (position, then rotation, then scale), and the anchor put back. The one definition of
 * "inside" for anything the pointer can touch, a sprite or the block of a text.
 */
const isInsideQuad = (transform: TQuadTransform, width: number, height: number, anchor: { x: number; y: number }, x: number, y: number): boolean => {
    const sizeX = width * transform.scaleX;
    const sizeY = height * transform.scaleY;
    // Something with no area covers nothing, and dividing by it below would say otherwise.
    if (sizeX === 0 || sizeY === 0) {
        return false;
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
    return u >= 0 && u <= 1 && v >= 0 && v <= 1;
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

    // The screen's pass, which is the last one: pictures drawn inside the game go before it.
    const { drawables = [], cameras = [], cameraIndex = [] } = ctx.passes[ctx.passes.length - 1];
    return points.map((screen) => hitsAt(drawables, cameras, cameraIndex, screen));
};

/**
 * What one screen point falls on, from a frame already laid out.
 */
const hitsAt = (
    drawables: NonNullable<TFrameContext['passes'][number]['drawables']>,
    cameras: NonNullable<TFrameContext['passes'][number]['cameras']>,
    cameraIndex: NonNullable<TFrameContext['passes'][number]['cameraIndex']>,
    screen: { x: number; y: number },
): Array<TSprite | TText | TNineSlice> => {
    const hits: Array<TSprite | TText | TNineSlice> = [];
    const tested = new Set<TText | TNineSlice>();

    // Back to front: what was painted last is on top.
    for (let i = drawables.length - 1; i >= 0; i--) {
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
        // Not drawn, so not touchable: on its way out, or its image has not arrived.
        if (sprite.destroyed || sprite.texture?.status === 'loading') {
            continue;
        }
        const { width, height } = spriteSize(sprite);
        if (isOnPicture(sprite, width, height, CENTRE, world.x, world.y)) {
            hits.push(sprite);
        }
    }

    return hits;
};
