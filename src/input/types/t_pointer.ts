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
     * How far the mouse moved since the last event, in pixels of the page rather than of the game,
     * so the same move of the hand turns a camera the same amount however big the game is shown.
     * Every move since the last frame is added together. `0` for a press, a release or the wheel.
     *
     * The number a mouse-look camera wants, and the only one that changes while the pointer is
     * captured (`lock`): then the cursor is hidden and `screenX`/`screenY` stay where it was.
     */
    readonly movementX: number;
    readonly movementY: number;
    /**
     * Which button: `0` the main one (left, or a finger), `1` the wheel, `2` the secondary one.
     */
    readonly button: number;
    /**
     * Which pointer this is: each finger on a touch screen has its own, the same from the moment it
     * touches until it lifts, so two thumbs (one on the throttle, one steering) are told apart. The
     * mouse keeps one for good.
     */
    readonly pointerId: number;
    /**
     * What it is: `'mouse'`, `'touch'` (a finger) or `'pen'`. A game can show its on-screen buttons
     * only once the player has touched.
     */
    readonly pointerType: TPointerType;
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
 * What a pointer is: a mouse, a finger on a touch screen, or a pen.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPointerType = 'mouse' | 'touch' | 'pen';

/**
 * A pointer that is pressing right now, a finger on the screen or a mouse button held, as
 * `usePointer().touches()` lists them.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPointerTouch = {
    readonly pointerId: number;
    readonly pointerType: TPointerType;
    /**
     * Where it is now, in the game's pixels from the top-left corner, ignoring any camera.
     */
    readonly screenX: number;
    readonly screenY: number;
    /**
     * The same point through the camera of the scene that asked.
     */
    readonly worldX: number;
    readonly worldY: number;
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
    /**
     * Whether anything is pressing right now: a finger on the screen, or a mouse button held. The
     * pointer's answer to the keyboard's `isDown`, for what continues while it is held (charging,
     * dragging, a thumb on the throttle).
     *
     * Read in an update, like the keyboard: it changes when the frame starts, not while it runs.
     */
    isDown(): boolean;
    /**
     * Where the pointer was last seen over the game, or `null` once it left (or before it came).
     * For the mouse that is where it hovers, pressed or not; for touch, the last finger that moved.
     */
    position(): { screenX: number; screenY: number; worldX: number; worldY: number } | null;
    /**
     * Every pointer pressing right now, in the order they started: each finger on the screen, and the
     * mouse while a button is held. Two thumbs are two entries, each with its own `pointerId`.
     */
    touches(): readonly TPointerTouch[];
    /**
     * Whether a finger (or a held mouse button) is on `target` right now: a sprite, a text, a
     * nine-slice, or a whole object, which counts a finger on any of its pieces.
     *
     * What an on-screen button needs. It follows the finger, not the press: a thumb that slides from
     * one button to the next without lifting moves from pressing one to pressing the other, the way
     * the pads of touch-screen games work. Something drawn over the button does not stop it.
     */
    isPressing(target: TSprite | TText | TNineSlice | TBox): boolean;
    /**
     * Captures the mouse for the game: the cursor disappears and the mouse moves nothing but
     * `movementX`/`movementY`, however far it goes, which is what a first-person camera needs. The
     * player gets it back with Esc, or the game with `unlock`.
     *
     * **Call it from a click or a key press.** The browser only captures the mouse in answer to
     * something the player did, so a call from a timer or at start-up is refused; `onDown` or a
     * `justPressed` check works. It answers `false` instead of throwing when it is refused or not to
     * be had: no gesture, the moment right after the player pressed Esc (the browser waits about a
     * second before allowing it again), a touch screen, or a frame that does not allow it.
     *
     * `raw` asks for the mouse's own movement, without the system's acceleration, where the browser
     * offers it; where it does not, the capture happens anyway without it.
     *
     * @returns Whether the mouse is now captured.
     */
    lock(options?: TPointerLockOptions): Promise<boolean>;
    /**
     * Gives the mouse back to the player, if this game had it.
     */
    unlock(): void;
    /**
     * Whether the game has the mouse right now. It turns `false` by itself when the player presses
     * Esc or leaves the tab, so reading it every frame (to pause, or to show "click to play") is
     * never out of date.
     */
    isLocked(): boolean;
};

/**
 * How the mouse is captured, for `usePointer().lock`.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPointerLockOptions = {
    /**
     * The mouse's own movement, without the system's acceleration, where the browser offers it.
     * Default `false`.
     */
    raw?: boolean;
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
     * Every pointer pressing, as of the last `dispatch`, in screen pixels: the state a frame reads.
     */
    touches(): ReadonlyArray<{ pointerId: number; pointerType: TPointerType; screenX: number; screenY: number }>;
    /**
     * Where the pointer was last seen over the canvas, as of the last `dispatch`, or `null`.
     */
    position(): { x: number; y: number } | null;
    /**
     * Whether a pressing pointer is on `target`. See `TPointerHandle.isPressing`.
     */
    isPressing(store: TRuntimeStore, target: TSprite | TText | TNineSlice | TBox): boolean;
    /**
     * The name of every object a pressing pointer is on, its own and those of everything it sits in:
     * what an action bound to a touch (`{ type: 'touch', box }`) asks.
     */
    pressedNames(store: TRuntimeStore): ReadonlySet<string>;
    /**
     * Captures the mouse on this canvas. See `TPointerHandle.lock`.
     */
    lock(options?: TPointerLockOptions): Promise<boolean>;
    unlock(): void;
    isLocked(): boolean;
    /**
     * Detaches the DOM listeners, gives the mouse back if it was captured, and forgets every
     * registration.
     */
    destroy(): void;
};
