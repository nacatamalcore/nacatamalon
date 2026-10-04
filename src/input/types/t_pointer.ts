import type { TBox } from '../../box';
import type { TSprite } from '../../gameobjects/sprite/types/t_sprite';
import type { TText } from '../../gameobjects/text/types/t_text';
import type { TNineSlice } from '../../gameobjects/nine_slice/types/t_nine_slice';
import type { TRuntimeStore } from '../../store';
import type { TSpriteEvents } from './t_sprite_events';

/**
 * What a pointer listener is told: where the mouse or finger is, which button, and what is under it.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPointerInfo = {
    /**
     * Where on the screen, in the game's pixels from the top-left corner. Ignores any camera.
     */
    readonly screenX: number;
    readonly screenY: number;
    /**
     * The same point as a place in the world, through the camera of the scene that asked for the
     * pointer. With no camera it equals `screenX`/`screenY`.
     */
    readonly worldX: number;
    readonly worldY: number;
    /**
     * Which button: `0` the main one (left, or a finger), `1` the wheel, `2` the secondary one.
     */
    readonly button: number;
    /**
     * The sprite, text or nine-slice on top under the pointer, or `null` over empty space.
     */
    readonly target: TSprite | TText | TNineSlice | null;
    /**
     * Every sprite, text and nine-slice under the pointer, the one on top first.
     */
    readonly hits: ReadonlyArray<TSprite | TText | TNineSlice>;
};

/**
 * A function that is told about a pointer event.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPointerListener = (info: TPointerInfo) => void;

/**
 * What a wheel listener is told: everything a pointer listener is, and how far the wheel turned.
 *
 * In pixels whichever way the browser counted them (some mice count lines, some pages), so one
 * notch of an ordinary mouse wheel is around a hundred. Every turn since the last frame is added
 * together: a quick spin is one call with a large number, not several small ones a frame apart.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPointerWheelInfo = TPointerInfo & {
    /**
     * How far the wheel turned. Positive is turning it towards you, which scrolls a page down and
     * which most games read as zooming out; a trackpad scrolls this way when two fingers go up.
     */
    readonly deltaY: number;
    /**
     * Sideways, from a tilting wheel or a trackpad. Positive is to the right.
     */
    readonly deltaX: number;
};

/**
 * A function that is told the wheel turned.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPointerWheelListener = (info: TPointerWheelInfo) => void;

/**
 * The mouse and touch input a scene reads, returned by `usePointer`.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPointerHandle = {
    /**
     * Called when a button is pressed or a finger touches. Returns a function that stops it.
     */
    onDown(listener: TPointerListener): () => void;
    /**
     * Called when a button is released or a finger lifts. Returns a function that stops it.
     */
    onUp(listener: TPointerListener): () => void;
    /**
     * Called when the pointer moves, at most once per frame. Returns a function that stops it.
     */
    onMove(listener: TPointerListener): () => void;
    /**
     * Called when the mouse wheel turns (or two fingers scroll a trackpad) over the game, at most
     * once per frame, with every turn since the last one added up. While anything listens, turning
     * the wheel over the game no longer scrolls the page it is on; while nothing does, it still
     * does. Returns a function that stops it.
     */
    onWheel(listener: TPointerWheelListener): () => void;
    /**
     * Every sprite and text under a point of the screen, the one on top first.
     */
    pick(screenX: number, screenY: number): Array<TSprite | TText | TNineSlice>;
};

/**
 * The kinds of pointer event the engine hands on.
 *
 * @internal
 */
export type TPointerKind = 'down' | 'up' | 'move' | 'wheel';

/**
 * The pointer as the engine holds it: listeners registered per object, events queued by the DOM and
 * handed on by the loop.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPointerSource = {
    /**
     * Registers `listener` for `kind` on behalf of `box`: it stops when the box goes away and is
     * skipped while its scene is paused. Returns the function that removes it earlier.
     */
    on(kind: TPointerKind, box: TBox, listener: TPointerListener | TPointerWheelListener): () => void;
    /**
     * Makes `sprite` react to the pointer by itself, on behalf of `box`: forgotten when the box goes
     * away. A whole object can listen too (`sprite` is then the box itself), and then answers for a
     * pointer over any of its pieces. Returns the function that forgets it earlier.
     */
    listenSprite(sprite: TSprite | TText | TNineSlice | TBox, box: TBox, events: TSpriteEvents): () => void;
    /**
     * Hands every event queued since the last call to its listeners. Called by the loop at the start
     * of a frame, which is what keeps a click from landing half way through the updates.
     */
    dispatch(store: TRuntimeStore): void;
    /**
     * Detaches the DOM listeners and forgets every registration.
     */
    destroy(): void;
};
