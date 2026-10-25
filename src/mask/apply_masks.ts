import { applyView2d } from '../render/shared/apply_view_2d';
import { composeTransform2d } from '../render/shared/compose_transform_2d';
import { takeSoftTarget } from './soft_targets';
import type { IRenderer, TDrawCamera2d, TDrawItem, TDrawSprite, TDrawTexture, TDrawView3d, TRenderPass } from '../render/interface';
import type { TDrawStencil } from '../render/interface/draw/t_draw_stencil';
import type { TDrawMaskLayer } from '../render/interface/draw/t_draw_mask_layer';
import type { TDrawable } from '../gameobjects/types';
import type { TMask } from './types/t_mask';
import type { TMaskLevel, TShapeList } from './mask_walk';

/**
 * Anything a pass's list can hold on its way to a backend.
 *
 * @internal
 */
export type TMaskedItem = TDrawable | TDrawSprite | TDrawMaskLayer;

/**
 * One pass's lists, as the frame has collected and sorted them, with the innermost mask of each
 * entry. What `applyMasks` reads.
 *
 * @internal
 */
export type TMaskedLists = {
    drawables: readonly TMaskedItem[];
    cameraIndex: readonly number[];
    viewIndex: readonly number[];
    levels: readonly (TMaskLevel | null)[];
    /** Each mask's shape, already turned into what a backend draws (a text into its letters). */
    shapes: ReadonlyMap<TMask, TShapeList>;
    cameras: readonly TDrawCamera2d[];
    views3d: readonly TDrawView3d[];
};

/**
 * What is being drawn on: its size in real pixels and how many of those each of its own is, which
 * is what a soft mask's pictures are made to match pixel for pixel.
 *
 * @internal
 */
export type TMaskTarget = { width: number; height: number; pixelRatio: number };

/**
 * A pass's lists with its masks worked in: what to put in the pass, and the passes that have to be
 * drawn before it, innermost first.
 *
 * @internal
 */
export type TMaskedPass = {
    drawables: TMaskedItem[];
    cameraIndex: number[];
    viewIndex: number[];
    stencil: TDrawStencil[];
    before: TRenderPass[];
};

type TEntry = { item: TMaskedItem; camera: number; view: number; chain: readonly TMaskLevel[] };

/** Big enough to cover any picture from the middle of the screen: what a whole-picture write is. */
const EVERYWHERE = 1 << 16;

/** A picture drawn over nothing: what a soft mask's two pictures start as. */
const CLEAR = { r: 0, g: 0, b: 0, a: 0 };

const WHITE_TINT = { r: 1, g: 1, b: 1, a: 1 };

/** How close to square to the screen a rectangle has to be to be kept to by the scissor instead. */
const SQUARE = 1e-3;

/**
 * Works a pass's masks in: what `fillFrameContext` hands every pass that has something masked in it.
 *
 * Masks reach a backend in three ways, cheapest first:
 *
 * - **A rectangle square to the screen** is a scissor on the entries it keeps in: no draw of its own.
 * - **Any other hard mask** is written into the stencil, right before the first entry it keeps in,
 *   and every entry is drawn where the stencil equals how many masks it is inside. The writes are
 *   the shape's own drawables with the colour off, so sprites by their pictures, shapes and letters
 *   all cut, and several of them add together. Masks inside masks keep to both, one count each. An
 *   inverted one is the whole picture raised first and the shape lowered back. Leaving masks is one
 *   write over everything, bringing the count back down.
 * - **A soft mask** draws what it keeps in into a picture of its own, and its shape into another, both
 *   in passes before this one, and leaves in its place one entry laying the first over what is there,
 *   as much as the second lets through.
 *
 * The sort is kept as it was. What is masked is drawn exactly where `zIndex` put it, and only where
 * the mask changes from one entry to the next does anything change: a run of sprites under one mask
 * stays one run. A soft mask's entries are drawn together where its first one was, which keeps their
 * order among themselves; something sorted in between them that it does not mask splits it in two.
 *
 * Returns `null`, and changes nothing, when nothing in the lists is masked.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const applyMasks = (lists: TMaskedLists, target: TMaskTarget, renderer: IRenderer, white: TDrawTexture): TMaskedPass | null => {
    if (!lists.levels.some((level) => level !== null)) {
        return null;
    }
    const chains = new Map<TMaskLevel, TMaskLevel[]>();
    const chainOf = (level: TMaskLevel | null): readonly TMaskLevel[] => {
        if (level === null) {
            return [];
        }
        let chain = chains.get(level);
        if (chain === undefined) {
            chain = [...chainOf(level.parent), level];
            chains.set(level, chain);
        }
        return chain;
    };
    const entries: TEntry[] = lists.drawables.map((item, i) => ({
        item,
        camera: lists.cameraIndex[i] ?? -1,
        view: lists.viewIndex[i] ?? -1,
        chain: chainOf(lists.levels[i] ?? null),
    }));
    const before: TRenderPass[] = [];
    const out = resolve(entries, { lists, target, renderer, white, before, states: new Map(), scissors: new Map() });
    return { ...out, before };
};

type TContext = {
    lists: TMaskedLists;
    target: TMaskTarget;
    renderer: IRenderer;
    white: TDrawTexture;
    before: TRenderPass[];
    states: Map<string, TDrawStencil>;
    scissors: Map<TMaskLevel, TDrawStencil['scissor'] | undefined>;
};

/**
 * The one state object for this state, so that two entries in the same state are told apart from
 * two in different ones by comparing them.
 */
const stateOf = (context: TContext, ref: number, write: TDrawStencil['write'], channel: TDrawStencil['channel'], scissor: TDrawStencil['scissor']): TDrawStencil => {
    const key = `${ref}|${write}|${channel}|${scissor === null ? '' : `${scissor.x},${scissor.y},${scissor.width},${scissor.height}`}`;
    let state = context.states.get(key);
    if (state === undefined) {
        state = { ref, write, channel, scissor };
        context.states.set(key, state);
    }
    return state;
};

/**
 * A white quad covering everything, in screen pixels: what raises an inverted mask's whole picture
 * and what brings the count back down when masks are left.
 */
const everywhere = (white: TDrawTexture): TDrawSprite => ({
    type: 'sprite',
    transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    width: EVERYWHERE,
    height: EVERYWHERE,
    texture: white,
    tint: WHITE_TINT,
});

/**
 * What a level's shape is drawn as: its object's drawables, or its rectangle as a white quad placed
 * where the masked object is.
 */
const shapeOf = (context: TContext, level: TMaskLevel): TShapeList => {
    const { mask } = level;
    if (mask.by !== null) {
        return context.lists.shapes.get(mask) ?? { drawables: [], cameraIndex: [] };
    }
    const rect = mask.rect!;
    const quad: TDrawSprite = {
        type: 'sprite',
        transform: { x: rect.x, y: rect.y, rotation: 0, scaleX: 1, scaleY: 1 },
        worldTransform: composeTransform2d(level.place, { x: rect.x, y: rect.y, rotation: 0, scaleX: 1, scaleY: 1 }, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }),
        width: rect.width,
        height: rect.height,
        anchor: { x: 0, y: 0 },
        texture: context.white,
        tint: WHITE_TINT,
    };
    return { drawables: [quad as unknown as TDrawable], cameraIndex: [level.camera] };
};

/**
 * The scissor a level is, in the pass's pixels, or `null` when it has to go into the stencil: when
 * it is a shape, is inverted, or is a rectangle turned on the screen.
 */
const scissorOf = (context: TContext, level: TMaskLevel): TDrawStencil['scissor'] => {
    if (context.scissors.has(level)) {
        return context.scissors.get(level) ?? null;
    }
    let scissor: TDrawStencil['scissor'] = null;
    const { mask } = level;
    if (mask.by === null && mask.rect !== null && !mask.invert) {
        const camera = level.camera >= 0 ? context.lists.cameras[level.camera] ?? null : null;
        const { x, y, width, height } = mask.rect;
        const place = level.place;
        const cos = Math.cos(place.rotation);
        const sin = Math.sin(place.rotation);
        const corner = (cx: number, cy: number): { x: number; y: number } => {
            const lx = cx * place.scaleX;
            const ly = cy * place.scaleY;
            return applyView2d(camera, { x: place.x + lx * cos - ly * sin, y: place.y + lx * sin + ly * cos });
        };
        const a = corner(x, y);
        const b = corner(x + width, y);
        const d = corner(x, y + height);
        const along = Math.abs(a.y - b.y) < SQUARE && Math.abs(a.x - d.x) < SQUARE;
        const across = Math.abs(a.x - b.x) < SQUARE && Math.abs(a.y - d.y) < SQUARE;
        if (along || across) {
            const c = corner(x + width, y + height);
            const left = Math.round(Math.min(a.x, c.x));
            const top = Math.round(Math.min(a.y, c.y));
            const right = Math.round(Math.max(a.x, c.x));
            const bottom = Math.round(Math.max(a.y, c.y));
            scissor = { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
        }
    }
    context.scissors.set(level, scissor);
    return scissor;
};

const intersect = (a: TDrawStencil['scissor'], b: NonNullable<TDrawStencil['scissor']>): NonNullable<TDrawStencil['scissor']> => {
    if (a === null) {
        return b;
    }
    const left = Math.max(a.x, b.x);
    const top = Math.max(a.y, b.y);
    const right = Math.min(a.x + a.width, b.x + b.width);
    const bottom = Math.min(a.y + a.height, b.y + b.height);
    return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
};

/**
 * Draws a soft mask's entries into a picture, and its shape into another, in passes of their own,
 * and gives back the one entry that lays the first over the pass as the second lets it through.
 */
const softLayer = (context: TContext, level: TMaskLevel, group: TEntry[], depth: number): TEntry => {
    const { target, renderer, lists } = context;
    const inner = resolve(group.map((entry) => ({ ...entry, chain: entry.chain.slice(depth + 1) })), context);
    const content = takeSoftTarget(renderer, target.width, target.height);
    const shape = takeSoftTarget(renderer, target.width, target.height);
    const drawn = shapeOf(context, level);
    context.before.push({
        clearColor: CLEAR,
        renderTarget: content,
        postProcess: false,
        pixelRatio: target.pixelRatio,
        drawables: inner.drawables as unknown as TDrawItem[],
        cameras: lists.cameras,
        cameraIndex: inner.cameraIndex,
        views3d: lists.views3d,
        viewIndex: inner.viewIndex,
        ...(inner.stencil.some((state) => state.ref !== 0 || state.write !== 'none' || state.scissor !== null) ? { stencil: inner.stencil } : {}),
    }, {
        clearColor: CLEAR,
        renderTarget: shape,
        postProcess: false,
        pixelRatio: target.pixelRatio,
        drawables: drawn.drawables as unknown as TDrawItem[],
        cameras: lists.cameras,
        cameraIndex: drawn.cameraIndex,
        views3d: lists.views3d,
        viewIndex: drawn.drawables.map(() => -1),
    });
    const layer: TDrawMaskLayer = { type: 'mask-layer', content, shape, channel: level.mask.channel, invert: level.mask.invert };
    return { item: layer, camera: -1, view: -1, chain: group[0]!.chain.slice(0, depth) };
};

/**
 * Turns entries, each with the masks it is inside, into a list a backend draws as it is: soft masks
 * taken out into passes of their own first, then the stencil written wherever the hard masks change.
 */
const resolve = (entries: readonly TEntry[], context: TContext): Omit<TMaskedPass, 'before'> => {
    // Soft masks first: each run of entries inside the same soft one becomes one layer.
    const flat: TEntry[] = [];
    for (let i = 0; i < entries.length;) {
        const entry = entries[i]!;
        const depth = entry.chain.findIndex((level) => level.mask.soft);
        if (depth < 0) {
            flat.push(entry);
            i++;
            continue;
        }
        const level = entry.chain[depth]!;
        const group: TEntry[] = [];
        while (i < entries.length && entries[i]!.chain[depth] === level) {
            group.push(entries[i]!);
            i++;
        }
        flat.push(softLayer(context, level, group, depth));
    }

    const drawables: TMaskedItem[] = [];
    const cameraIndex: number[] = [];
    const viewIndex: number[] = [];
    const stencil: TDrawStencil[] = [];
    const emit = (item: TMaskedItem, camera: number, view: number, state: TDrawStencil): void => {
        drawables.push(item);
        cameraIndex.push(camera);
        viewIndex.push(view);
        stencil.push(state);
    };
    const writeShape = (list: TShapeList, ref: number, write: 'add' | 'sub', channel: TDrawStencil['channel']): void => {
        const state = stateOf(context, ref, write, channel, null);
        for (let k = 0; k < list.drawables.length; k++) {
            emit(list.drawables[k]!, list.cameraIndex[k] ?? -1, -1, state);
        }
    };

    // What is in the stencil now: the masks it counts, outermost first.
    let written: TMaskLevel[] = [];
    for (const entry of flat) {
        let scissor: TDrawStencil['scissor'] = null;
        const needed: TMaskLevel[] = [];
        for (const level of entry.chain) {
            const box = scissorOf(context, level);
            if (box === null) {
                needed.push(level);
            } else {
                scissor = intersect(scissor, box);
            }
        }

        let same = 0;
        while (same < written.length && same < needed.length && written[same] === needed[same]) {
            same++;
        }
        if (same < written.length) {
            // Back down to what the two have in common, everywhere at once.
            emit(everywhere(context.white), -1, -1, stateOf(context, same, 'reset', 'alpha', null));
        }
        for (let j = same; j < needed.length; j++) {
            const level = needed[j]!;
            const shape = shapeOf(context, level);
            const channel = level.mask.by !== null ? level.mask.channel : 'alpha';
            if (level.mask.invert) {
                emit(everywhere(context.white), -1, -1, stateOf(context, j, 'add', 'alpha', null));
                writeShape(shape, j + 1, 'sub', channel);
            } else {
                writeShape(shape, j, 'add', channel);
            }
        }
        written = needed;

        emit(entry.item, entry.camera, entry.view, stateOf(context, needed.length, 'none', 'alpha', scissor));
    }
    return { drawables, cameraIndex, viewIndex, stencil };
};
