import { atlasFrame } from '../../atlas';
import { worldOf } from '../../render/shared/world_of';
import type { TDrawSprite } from '../../render/interface';
import type { TNineSlice, TNineSliceMode } from './types/t_nine_slice';

/**
 * One stretch of a nine-slice along one direction: where it is drawn and how long, in pixels of the
 * nine-slice before its scale, and which texels of the picture it shows.
 *
 * @internal
 */
export type TSliceSpan = { at: number; size: number; from: number; length: number };

/**
 * A part of a nine-slice, shaped like a sprite so the renderer draws it like one. Never a record.
 */
type TPieceSprite = {
    type: 'sprite';
    transform: { x: number; y: number; rotation: number; scaleX: number; scaleY: number };
    width: number;
    height: number;
    texture: TNineSlice['texture'];
    tint: TNineSlice['tint'];
    anchor: { x: number; y: number };
    uvOffset: { x: number; y: number };
    uvScale: { x: number; y: number };
    smooth?: boolean;
    material?: TNineSlice['material'];
    uniforms?: TNineSlice['uniforms'];
};

/**
 * Each nine-slice's parts, reused from one frame to the next so a still panel allocates nothing.
 */
const pools = new WeakMap<TNineSlice, TPieceSprite[]>();

/**
 * Which nine-slice each part belongs to, so pointer picking can turn a part into the whole.
 */
const pieceOwners = new WeakMap<object, TNineSlice>();

/**
 * The spans of each direction, kept between calls: they only live while one nine-slice is cut.
 */
const columns: TSliceSpan[] = [];
const rows: TSliceSpan[] = [];

const TOP_LEFT = { x: 0, y: 0 };
const WHOLE = { uvOffset: { x: 0, y: 0 }, uvScale: { x: 1, y: 1 } };

/**
 * Cuts one direction of a nine-slice into spans: the first border, what lies between, and the last
 * border. `out` is emptied first.
 *
 * - Borders wider than the picture are narrowed to fit it, in proportion.
 * - Drawn smaller than its two borders together, both borders shrink in proportion and nothing is
 *   left between them: the corners meet instead of overlapping.
 * - What lies between is filled by `mode`: one stretched span, whole copies with the last one cut
 *   (`'tile'`), or whole copies stretched to fit exactly (`'tile-fit'`). With no texels between the
 *   borders there is nothing to repeat, so it is stretched whatever `mode` says.
 *
 * Spans with no size are left out: they would draw nothing and still cost a sprite.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const sliceAxis = (size: number, source: number, first: number, last: number, mode: TNineSliceMode, out: TSliceSpan[]): TSliceSpan[] => {
    out.length = 0;
    const length = Math.max(0, size);
    let start = Math.max(0, first);
    let end = Math.max(0, last);
    if (start + end > source) {
        const fit = source / (start + end);
        start *= fit;
        end *= fit;
    }

    const shrink = start + end > length ? length / (start + end) : 1;
    const a = start * shrink;
    const b = end * shrink;
    const between = length - a - b;
    const inner = source - start - end;

    if (a > 0) {
        out.push({ at: 0, size: a, from: 0, length: start });
    }
    if (between > 0) {
        if (mode === 'stretch' || inner <= 0) {
            out.push({ at: a, size: between, from: start, length: inner });
        } else if (mode === 'tile') {
            const whole = Math.floor(between / inner);
            for (let i = 0; i < whole; i++) {
                out.push({ at: a + i * inner, size: inner, from: start, length: inner });
            }
            const rest = between - whole * inner;
            if (rest > 0) {
                // Cut from the start of the tile, so the pattern runs on unbroken from the corner.
                out.push({ at: a + whole * inner, size: rest, from: start, length: rest });
            }
        } else {
            const copies = Math.max(1, Math.round(between / inner));
            const each = between / copies;
            for (let i = 0; i < copies; i++) {
                out.push({ at: a + i * each, size: each, from: start, length: inner });
            }
        }
    }
    if (b > 0) {
        out.push({ at: length - b, size: b, from: source - end, length: end });
    }
    return out;
};

/**
 * The window into the texture the picture is, whichever way it was asked for.
 */
const windowOf = (slice: TNineSlice): { uvOffset: { x: number; y: number }; uvScale: { x: number; y: number } } => {
    // A sheet read from a file only knows its frames once its image has landed.
    const frame = slice.atlas !== undefined && slice.atlas.frames > 0 ? atlasFrame(slice.atlas, slice.frame ?? 0) : WHOLE;
    return { uvOffset: slice.uvOffset ?? frame.uvOffset, uvScale: slice.uvScale ?? frame.uvScale };
};


/**
 * The nine-slice a part handed to the renderer belongs to, or `undefined` for anything else.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const nineSliceOfPiece = (drawable: object): TNineSlice | undefined => pieceOwners.get(drawable);

const newPiece = (slice: TNineSlice): TPieceSprite => {
    const piece: TPieceSprite = {
        type: 'sprite',
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
        width: 0,
        height: 0,
        texture: slice.texture,
        tint: slice.tint,
        anchor: TOP_LEFT,
        uvOffset: { x: 0, y: 0 },
        uvScale: { x: 1, y: 1 },
    };
    pieceOwners.set(piece, slice);
    return piece;
};

/**
 * Turns a nine-slice into the sprites that draw it: its four corners at the size they were drawn,
 * its edges and middle stretched or repeated between them.
 *
 * Placed the way a text places its characters: each part's point inside the rectangle is moved off
 * the anchor, scaled, turned and added to the position, and the part keeps the whole's turn and
 * scale, so it is drawn turned and scaled around its own top-left corner, which is exactly where that
 * point landed. Every part shares the picture and the material, so a panel is one draw call.
 *
 * Nothing until the picture has loaded: where the borders fall is measured in its pixels.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const expandNineSlice = (slice: TNineSlice): readonly TDrawSprite[] => {
    let pool = pools.get(slice);
    if (pool === undefined) {
        pool = [];
        pools.set(slice, pool);
    }

    const { texture } = slice;
    if (texture.status !== 'ready' || texture.width === 0 || texture.height === 0) {
        pool.length = 0;
        return pool;
    }

    const window = windowOf(slice);
    const sourceWidth = texture.width * window.uvScale.x;
    const sourceHeight = texture.height * window.uvScale.y;
    const { width, height } = slice;
    const modeX = typeof slice.mode === 'string' ? slice.mode : slice.mode.x;
    const modeY = typeof slice.mode === 'string' ? slice.mode : slice.mode.y;
    sliceAxis(width, sourceWidth, slice.slice.left, slice.slice.right, modeX, columns);
    sliceAxis(height, sourceHeight, slice.slice.top, slice.slice.bottom, modeY, rows);

    const count = columns.length * rows.length;
    while (pool.length < count) {
        pool.push(newPiece(slice));
    }
    pool.length = count;

    // Where it ends up, so a panel inside a box that moved takes its parts with it.
    const transform = worldOf(slice);
    const anchorX = (slice.anchor?.x ?? 0.5) * width;
    const anchorY = (slice.anchor?.y ?? 0.5) * height;
    const cos = Math.cos(transform.rotation);
    const sin = Math.sin(transform.rotation);

    let i = 0;
    for (const row of rows) {
        for (const column of columns) {
            const piece = pool[i++];
            const localX = (column.at - anchorX) * transform.scaleX;
            const localY = (row.at - anchorY) * transform.scaleY;
            piece.transform.x = transform.x + localX * cos - localY * sin;
            piece.transform.y = transform.y + localX * sin + localY * cos;
            piece.transform.rotation = transform.rotation;
            piece.transform.scaleX = transform.scaleX;
            piece.transform.scaleY = transform.scaleY;

            piece.width = column.size;
            piece.height = row.size;
            // Copied every frame rather than once: all of them are the record's to change.
            piece.texture = texture;
            piece.tint = slice.tint;
            piece.smooth = slice.smooth;
            piece.material = slice.material;
            piece.uniforms = slice.uniforms;
            piece.uvOffset.x = window.uvOffset.x + column.from / texture.width;
            piece.uvOffset.y = window.uvOffset.y + row.from / texture.height;
            piece.uvScale.x = column.length / texture.width;
            piece.uvScale.y = row.length / texture.height;
        }
    }

    return pool;
};
