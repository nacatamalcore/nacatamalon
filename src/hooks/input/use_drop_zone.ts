import { getActiveBox, getActiveGame } from '../../store';
import type { TBox } from '../../box';
import type { TSprite } from '../../gameobjects/sprite/types/t_sprite';
import type { TText } from '../../gameobjects/text/types/t_text';
import type { TNineSlice } from '../../gameobjects/nine_slice/types/t_nine_slice';
import type { TDropZoneListener, TDropZoneState } from '../../input';

/**
 * What a drop zone accepts, and what it is told.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TUseDropZoneOptions = {
    /**
     * The tags of what it accepts, one or several: what is dragged carries one of them, or an
     * object it sits in does. A slot for cards, `'card'`; a bin for anything thrown away,
     * `['card', 'coin']`. Everything that can be dragged, when left out.
     */
    accepts?: string | readonly string[];
    /**
     * Whether it takes things from the start. `enable()` lets it later.
     *
     * @default true
     */
    enabled?: boolean;
    /**
     * Something it accepts is dragged over it.
     */
    onEnter?: TDropZoneListener;
    /**
     * It is dragged off it again, let go, or the drag was taken back.
     */
    onLeave?: TDropZoneListener;
    /**
     * It was let go over it. Called after what was dragged hears `onDragEnd`, so what is done here
     * (putting it in the middle of the slot) has the last word. `onLeave` follows.
     */
    onDrop?: TDropZoneListener;
};

/**
 * What `useDropZone` returns: its state, read every frame, and a way to turn it on and off.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDropZoneHandle = {
    /**
     * Whether something it accepts is being dragged over it right now: let go now, it lands here.
     */
    isOver(): boolean;
    /**
     * Whether something it accepts is being dragged anywhere: what lights every place it could go.
     */
    canDrop(): boolean;
    /**
     * Lets it take things. Twice is once.
     */
    enable(): void;
    /**
     * Stops it taking things: a slot already full.
     */
    disable(): void;
    /**
     * Whether it takes things now.
     */
    isEnabled(): boolean;
};

/**
 * Makes a sprite, a text, a nine-slice or a whole object a place things can be dragged into: a slot
 * of an inventory, the square of a board, a bin.
 *
 * The zone says what it accepts, by tag, and its state is asked like the keyboard's, every frame:
 * `canDrop()` while something it accepts is dragged anywhere, `isOver()` while it is over this very
 * zone. That is all a highlight needs, and it turns itself off when the drag ends however it ends,
 * so nothing stays lit. `onEnter`, `onLeave` and `onDrop` say the same as events, at the start of
 * the frame.
 *
 * What is dragged comes from `useDraggable`, or from anything with drag events (`onDrag` in its
 * options or with `listen`): `useDraggable` hands the zone it was dropped into in `dropped`, and the
 * events in `zone`. When zones overlap, the one on top takes it.
 *
 * It belongs to what calls it, like every hook: it goes when that goes, and does nothing while its
 * scene is paused. To open a zone later, start it with `enabled: false` and call `enable()` then.
 *
 * @param target The place: a sprite, a text, a nine-slice, or a whole object, which counts the
 * pointer over any of its pieces.
 * @param options What it accepts, and what to do when something comes over it, leaves or is
 * dropped.
 * @returns Its state, `isOver` and `canDrop`, and `enable` and `disable`.
 *
 * @example
 * ```ts
 * export const Table: TSceneFn = () => {
 *     const card = createSprite({ key: 'card', transform: { x: 80, y: 120 } });
 *     useTag('card').add(card);
 *     useDraggable(card, { snapBack: true });
 *
 *     const slot = createSprite({ key: 'slot', transform: { x: 240, y: 120 } });
 *     const zone = useDropZone(slot, {
 *         accepts: 'card',
 *         onDrop: (dragged) => {
 *             if (dragged.transform === null) return;
 *             dragged.transform.x = slot.transform.x;
 *             dragged.transform.y = slot.transform.y;
 *         },
 *     });
 *
 *     // Dim while a card could go in, bright while one is over it.
 *     const idle = getColor('#1e2533');
 *     const can = getColor('#3a4560');
 *     const over = getColor('#ffcc33');
 *     useUpdate(() => {
 *         slot.tint = zone.isOver() ? over : zone.canDrop() ? can : idle;
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
export const useDropZone = (target: TSprite | TText | TNineSlice | TBox, options: TUseDropZoneOptions = {}): TDropZoneHandle => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw new Error('[NacatamalOn] useDropZone: call it inside a scene body or a behaviour, not from a timer or a callback. To open it later, pass enabled: false and call enable().');
    }
    const pointer = store.get('input').pointer;
    let state: TDropZoneState | null = null;

    const enable = (): void => {
        if (state !== null || box.destroyed || target.destroyed) return;
        state = pointer.dropZone(target, box, {
            accepts: options.accepts,
            onEnter: options.onEnter,
            onLeave: options.onLeave,
            onDrop: options.onDrop,
        });
    };

    const disable = (): void => {
        state?.remove();
        state = null;
    };

    if (options.enabled !== false) enable();

    return {
        isOver: () => state?.isOver() ?? false,
        canDrop: () => state?.canDrop() ?? false,
        enable,
        disable,
        isEnabled: () => state !== null,
    };
};
