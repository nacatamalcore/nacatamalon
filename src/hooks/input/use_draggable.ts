import { getActiveBox, getActiveGame } from '../../store';
import { ownerOfDrawable } from '../../box/drawable_owner';
import { worldToLocal } from '../../box/world_to_local';
import { carries } from '../../tags/tags';
import type { TBox } from '../../box';
import type { TTaggable } from '../../tags';
import type { TSprite } from '../../gameobjects/sprite/types/t_sprite';
import type { TText } from '../../gameobjects/text/types/t_text';
import type { TNineSlice } from '../../gameobjects/nine_slice/types/t_nine_slice';
import type { TPointerDragInfo } from '../../input';

/**
 * What `useDraggable`'s `onDragEnd` is told: the drag's info, and what it was dropped on.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDraggableDropInfo = TPointerDragInfo & {
    /**
     * Where it was dropped. With `dropOn`, what it was let go over that carries one of those tags:
     * the sprite, text or object itself, or the nearest object above it that carries one. Without,
     * the drop zone (`useDropZone`) it was let go over that accepts it. `null` when there was none.
     */
    readonly dropped: TSprite | TText | TNineSlice | TBox | null;
};

/**
 * How `useDraggable` moves what it is given.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TUseDraggableOptions = {
    /**
     * Which way it can go: `'both'`, or only along `'x'` (a slider) or `'y'`.
     *
     * @default 'both'
     */
    axis?: 'both' | 'x' | 'y';
    /**
     * Steps it keeps to, in pixels: it lands on multiples of this. `0` moves freely.
     *
     * @default 0
     */
    grid?: number;
    /**
     * A rectangle it does not leave, measured where its position is: in its parent's space for an
     * object, in its object's for a sprite. Its position stays inside, not its whole picture.
     */
    bounds?: { x: number; y: number; width: number; height: number };
    /**
     * The tags of what it may be dropped on, one or several (`useTag`, or the tags of a box in a
     * scene). Let go over one, `onDragEnd` says which in `dropped`. Left out, the drop zones
     * (`useDropZone`) decide, by what they accept.
     */
    dropOn?: string | readonly string[];
    /**
     * Goes back to where the drag began when it is let go anywhere it may not be dropped: off every
     * thing tagged `dropOn`, or, without `dropOn`, off every drop zone that accepts it.
     *
     * @default false
     */
    snapBack?: boolean;
    /**
     * Whether it can be dragged from the start. `enable()` lets it later.
     *
     * @default true
     */
    enabled?: boolean;
    /**
     * It began to move.
     */
    onDragStart?: (info: TPointerDragInfo) => void;
    /**
     * It moved, already where the pointer took it.
     */
    onDrag?: (info: TPointerDragInfo) => void;
    /**
     * It was let go, already where it stays (or back, with `snapBack`).
     */
    onDragEnd?: (info: TDraggableDropInfo) => void;
};

/**
 * What `useDraggable` returns, to turn the dragging on and off and to ask about it.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDraggableHandle = {
    /**
     * Lets it be dragged. Twice is once.
     */
    enable(): void;
    /**
     * Stops it being dragged; a drag going on stops where it is.
     */
    disable(): void;
    /**
     * Whether it can be dragged now.
     */
    isEnabled(): boolean;
    /**
     * Whether it is being dragged right now.
     */
    isDragging(): boolean;
};

/**
 * Whether what was handed over is a whole object rather than one drawable.
 */
const isObject = (target: TSprite | TText | TNineSlice | TBox): target is TBox =>
    'children' in target && 'drawables' in target;

/**
 * What it was let go over that carries one of `tags`, the topmost first: each hit, or the nearest
 * object above it that carries one.
 */
const droppedOn = (hits: ReadonlyArray<TSprite | TText | TNineSlice>, tags: readonly string[]): TSprite | TText | TNineSlice | TBox | null => {
    const tagged = (thing: TTaggable | TBox): boolean => tags.some((tag) => carries(thing, tag));
    for (const hit of hits) {
        if (tagged(hit)) return hit;
        for (let box = ownerOfDrawable(hit)?.box ?? null; box !== null; box = box.parent) {
            if (tagged(box)) return box;
        }
    }
    return null;
};

/**
 * Makes a sprite, a text, a nine-slice or a whole object follow the pointer that drags it: pressed
 * with the main button or a finger, it moves with it, held where it was taken, until it is let go.
 *
 * Built on the drag events every sprite has (`onDragStart`, `onDrag`, `onDragEnd`), and adding the
 * moving: what a card, a piece of a puzzle or an item of an inventory wants. For a drag that does
 * not move what was pressed (a slingshot pulled back, a dial turned), use those events with `listen`.
 *
 * - **It moves its position**: an object's `transform`, in its parent's space, or a sprite's, in its
 *   object's. The parents may be moved, turned and scaled, and the camera may be anywhere: it stays
 *   under the pointer.
 * - **A click is still a click**: it only starts once the pointer has moved a few pixels, and a
 *   drag never ends in `onClick`.
 * - **Dropping** is said by the places: a slot made with `useDropZone` says what it accepts, and
 *   `onDragEnd` says in `dropped` which one it was let go into. Or by the thing dragged, with
 *   `dropOn`, the tags of what it may land on. With `snapBack` it goes back when it was none.
 * - Two fingers drag two things, each its own.
 *
 * It belongs to what calls it, like every hook: it stops when that goes away, and does nothing while
 * its scene is paused. Call it while the scene or the object is built; to let something be dragged
 * later, start it with `enabled: false` and call `enable()` then.
 *
 * Only for 2D: a 3D object has nothing the pointer can pick.
 *
 * @param target What is dragged: a sprite, a text, a nine-slice, or a whole object (`self` in a
 * behaviour), which is dragged by any of its pieces.
 * @param options Which way, in what steps, inside what, onto what, and what to do on the way.
 * @returns A handle to turn the dragging on and off, and to ask whether it is going on.
 *
 * @example
 * ```ts
 * export const Table: TSceneFn = () => {
 *     const slot = createSprite({ key: 'slot', transform: { x: 240, y: 120 } });
 *     useTag('slot').add(slot);
 *
 *     const card = createSprite({ key: 'card', transform: { x: 80, y: 120 } });
 *     useDraggable(card, {
 *         dropOn: 'slot',
 *         snapBack: true,
 *         onDragStart: () => { card.zIndex = 10; },
 *         onDragEnd: ({ dropped }) => {
 *             card.zIndex = 0;
 *             // Into the slot, right in the middle.
 *             if (dropped !== null) {
 *                 card.transform.x = slot.transform.x;
 *                 card.transform.y = slot.transform.y;
 *             }
 *         },
 *     });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useDraggable = (target: TSprite | TText | TNineSlice | TBox, options: TUseDraggableOptions = {}): TDraggableHandle => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw new Error('[NacatamalOn] useDraggable: call it inside a scene body or a behaviour, not from a timer or a callback. To let it be dragged later, pass enabled: false and call enable().');
    }
    const pointer = store.get('input').pointer;
    const axis = options.axis ?? 'both';
    const grid = options.grid ?? 0;

    /**
     * The space its position is measured in: its parent for an object, its object for a picture.
     */
    const space = (): TBox | null => (isObject(target) ? target.parent : ownerOfDrawable(target)?.box ?? null);
    const local = (worldX: number, worldY: number): { x: number; y: number } => {
        const of = space();
        return of === null ? { x: worldX, y: worldY } : worldToLocal(of, { x: worldX, y: worldY });
    };

    let stop: (() => void) | null = null;
    /**
     * Where it was when the drag began, and how far from the pointer it was held.
     */
    let home: { x: number; y: number } | null = null;
    let held = { x: 0, y: 0 };

    /**
     * Where the pointer takes it: held where it was taken, on the grid, inside the bounds, along
     * its axis only.
     */
    const follow = (info: TPointerDragInfo): void => {
        const place = target.transform;
        if (place === null || home === null) return;
        const at = local(info.worldX, info.worldY);
        let x = at.x + held.x;
        let y = at.y + held.y;
        if (grid > 0) {
            x = Math.round(x / grid) * grid;
            y = Math.round(y / grid) * grid;
        }
        const bounds = options.bounds;
        if (bounds !== undefined) {
            x = Math.min(bounds.x + bounds.width, Math.max(bounds.x, x));
            y = Math.min(bounds.y + bounds.height, Math.max(bounds.y, y));
        }
        if (axis !== 'y') place.x = x;
        if (axis !== 'x') place.y = y;
    };

    const enable = (): void => {
        if (stop !== null || box.destroyed || target.destroyed) return;
        stop = pointer.listenSprite(target, box, {
            onDragStart: (info) => {
                const place = target.transform;
                if (place === null) return;
                // Held by the point that was pressed, not where the pointer is once it has gone far
                // enough to be a drag: it does not jump those few pixels.
                const at = local(info.startX, info.startY);
                home = { x: place.x, y: place.y };
                held = { x: place.x - at.x, y: place.y - at.y };
                options.onDragStart?.(info);
            },
            onDrag: (info) => {
                follow(info);
                options.onDrag?.(info);
            },
            onDragEnd: (info) => {
                const dropOn = options.dropOn;
                const dropped = dropOn === undefined ? info.zone : droppedOn(info.hits, typeof dropOn === 'string' ? [dropOn] : dropOn);
                const place = target.transform;
                if (options.snapBack === true && dropped === null && place !== null && home !== null) {
                    place.x = home.x;
                    place.y = home.y;
                }
                home = null;
                options.onDragEnd?.({ ...info, dropped });
            },
        });
    };

    const disable = (): void => {
        stop?.();
        stop = null;
        home = null;
    };

    if (options.enabled !== false) enable();

    return {
        enable,
        disable,
        isEnabled: () => stop !== null,
        isDragging: () => home !== null,
    };
};
