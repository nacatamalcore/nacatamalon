import type { TGamepadAxisName, TGamepadButtonName } from '../../gamepad';
import type { TStorePersistence } from '../../../game_store';

/**
 * What a game calls one of its actions: `'jump'`, `'move_left'`, `'pause'`. Just a string, so a
 * project can name them however it likes.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TActionName = string;

/**
 * One physical thing an action listens to.
 *
 * Three kinds, and the reason there is no fourth: a gamepad **button** covers the digital and the
 * analogue ones alike, because a trigger already reports how far it is pressed. A separate kind for
 * triggers would be a second name for one fact.
 *
 * `dir` on an axis is not a threshold and is not optional: it is part of **which** input this is. An
 * axis goes both ways and an action does not, so "the horizontal axis of the left stick" does not
 * name an input at all until it says which way.
 *
 * There is deliberately no kind for a whole stick. A stick is four axis bindings across four
 * actions: if one binding could be two-dimensional, every action would be either a
 * number or a direction, and that split spreads into the runtime, the saved file, the editor's
 * table and the controls screen. One direction per binding is what lets "WASD **or** stick **or**
 * d-pad" work through the same four names with no branching in the game.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TActionBinding =
    | { type: 'key'; key: string }
    | { type: 'button'; button: TGamepadButtonName }
    | { type: 'axis'; axis: TGamepadAxisName; dir: -1 | 1 };

/**
 * One named action and everything it listens to.
 *
 * `deadzone` and `press` are how the action **feels**, and they belong to the action rather than to
 * one of its bindings: they have to be shared by every source, or the same action would mean one
 * thing on a stick and another on a key.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TActionDef = {
    name: TActionName;
    bindings: TActionBinding[];
    /**
     * Below this, the action reads as exactly 0. Default `0.2`, the same as the stick's, so four
     * actions on one stick give the **same numbers** as reading the stick directly.
     */
    deadzone?: number;
    /**
     * How far an analogue source has to travel before it counts as pressed. Default `0.5`.
     *
     * A different number from the dead zone on purpose: a trigger at 30 % has a value and is not
     * "pressed", which is what lets the same trigger be an accelerator and a trigger for firing.
     */
    press?: number;
};

/**
 * A game's whole input map.
 *
 * A list and not an object keyed by name, for two reasons a controls table makes obvious: renaming
 * inside an object is a remove and an insert, which jumps the row out from under the cursor, and a
 * repeated name can be **seen and reported** instead of quietly swallowed.
 *
 * (The player's own changes are an object, because that one is sparse and nobody renames an action
 * from a controls screen.)
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TActionMap = TActionDef[];

/**
 * Which devices a reader listens to. Not a property of a binding: a property of **whoever is
 * reading**, which is what makes local multiplayer the same action names read twice.
 *
 * `'any'` (the default) is the keyboard and every pad. A number is that pad **and nothing else**: a
 * keyboard is not a port, so naming a port means pad only, which is exactly what player two wants.
 * `'keyboard'` is the other half of that split.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TActionDevice = number | 'any' | 'keyboard';

/**
 * The player's own bindings, on top of the game's. Sparse: an action they never touched is absent.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TActionOverrides = Record<TActionName, TActionBinding[]>;

/**
 * The actions of a game, as it reads them. Returned by `useActions`.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TActionsHandle = {
    /**
     * Which devices this handle is listening to.
     */
    readonly device: TActionDevice;
    /**
     * Whether the action is being held (past its `press` point).
     */
    isDown(name: TActionName): boolean;
    /**
     * Whether it started this frame.
     */
    justPressed(name: TActionName): boolean;
    /**
     * Whether it stopped this frame.
     */
    justReleased(name: TActionName): boolean;
    /**
     * How hard, 0 to 1, with the dead zone applied: a trigger gives a real number, a key gives 1.
     */
    value(name: TActionName): number;
    /**
     * The same without the dead zone, for a game that wants to do its own shaping.
     */
    rawValue(name: TActionName): number;
    /**
     * Two actions read as one axis, from -1 to 1: `strength('left', 'right')`.
     */
    strength(negative: TActionName, positive: TActionName, deadzone?: number): number;
    /**
     * Four actions read as a direction, with a **round** dead zone applied once at the end. This is
     * what makes it identical to reading the stick, and what keeps a keyboard diagonal from coming
     * out 41 % faster than a straight line.
     */
    vector(negX: TActionName, posX: TActionName, negY: TActionName, posY: TActionName, deadzone?: number): { x: number; y: number };
    /**
     * Whether the game has an action by that name.
     */
    has(name: TActionName): boolean;
    /**
     * Every action name, in the order the game declared them.
     */
    readonly names: readonly TActionName[];
};

/**
 * One action, for the reading that most game code does. Returned by `useAction`.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TAction = {
    readonly name: TActionName;
    isDown(): boolean;
    justPressed(): boolean;
    justReleased(): boolean;
    value(): number;
};

/**
 * What "press anything" listens to while it waits.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TActionCaptureOptions = {
    /**
     * Which kinds of input can be bound. All three by default.
     */
    sources?: Array<'key' | 'button' | 'axis'>;
    /**
     * Which pad to listen to. `'any'` by default.
     */
    device?: TActionDevice;
    /**
     * The key that reports nothing instead of binding itself. `'Escape'` by default; `null` turns
     * it off, which makes a rebind the player cannot back out of, so think first.
     */
    cancelKey?: string | null;
    /**
     * How far a stick has to be pushed to count, 0 to 1. `0.7` by default: well past any dead zone,
     * so a resting stick with a bit of drift can never bind itself.
     */
    axisThreshold?: number;
};

/**
 * Remapping: what a game's controls screen is built on. Returned by `useInputMap`.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TInputMapHandle = {
    /**
     * Every action name, in the game's order.
     */
    list(): readonly TActionName[];
    /**
     * What an action listens to right now: the player's choice if they changed it, the game's if not.
     */
    bindings(action: TActionName): readonly TActionBinding[];
    /**
     * What the game itself says, ignoring the player. What a "reset" button shows.
     */
    defaults(action: TActionName): readonly TActionBinding[];
    /**
     * Adds a binding, or replaces the one in that position.
     */
    bind(action: TActionName, binding: TActionBinding, slot?: number): void;
    /**
     * Removes a binding, by what it is or by position. Says how many went.
     */
    unbind(action: TActionName, binding: TActionBinding | number): number;
    /**
     * Leaves the action with nothing bound. It still exists and can be bound again.
     */
    clear(action: TActionName): void;
    /**
     * Back to what the game says: one action, or all of them.
     */
    reset(action?: TActionName): void;
    /**
     * Which other actions already use this binding. A controls screen owes the player this: two
     * actions on one button is allowed and is almost always a mistake.
     */
    conflicts(binding: TActionBinding, exclude?: TActionName): readonly TActionName[];
    /**
     * "Press anything." Reports the first thing the player does, or nothing if they cancelled.
     * Returns the function that stops listening.
     *
     * The reason this is in the engine and not left to each game is not the loop it saves, it is the
     * **arming rule**: the button that opened the rebind box is still held when the wait starts, so
     * the obvious version binds it instantly. Here a button only counts once it goes down having
     * been up since the wait began, and a stick has to come back to the middle first.
     */
    capture(done: (binding: TActionBinding | null) => void, options?: TActionCaptureOptions): () => void;
    /**
     * The player's own bindings, as plain data. Untouched actions are not in it.
     */
    overrides(): TActionOverrides;
    /**
     * Puts a saved set back. Can arrive before or after the game's map, in any order.
     */
    load(overrides: TActionOverrides): void;
    /**
     * Writes the player's bindings now. Does nothing when nothing was set up to save them.
     */
    save(): Promise<void>;
};

/**
 * Where the player's own bindings are kept.
 *
 * The adapter is the store's (`localStorageAdapter`, `indexedDbAdapter` or one of your own). What is
 * deliberately **not** reused is the store itself: a remap is a preference, not part of a saved
 * game, and starting a new game must not reset the controls.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TActionPersist = {
    adapter: TStorePersistence<TActionOverrides>;
    /**
     * What to save it under. Has a prefix by default, because browser storage belongs to the whole
     * site: a page that hosts several games would have them overwriting each other's controls.
     */
    key?: string;
};
