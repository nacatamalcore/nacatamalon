import { momentOf } from './moment';
import { windowOf } from '../DOM/window_of';
import { normalizeKey } from './normalize_key';
import type { TKeyboardSource } from './types/t_keyboard';

/**
 * Listens to one window's keys and answers questions about them per frame.
 *
 * Push in, poll out. The DOM delivers events whenever it likes, which is the wrong shape for a
 * game: the loop runs at its own pace, and two objects asking the same question in one frame have
 * to get the same answer. So events only update sets, and the game reads those sets.
 *
 * Bound to the window the canvas actually lives in rather than the one this module was loaded
 * from: a host can put the canvas in another document (an editor popping its play window out),
 * and there the key events fire on that window. Getting this wrong leaves a game that renders
 * perfectly and cannot be typed at, with nothing in the console to say why.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createKeyboard = (canvas: HTMLCanvasElement): TKeyboardSource => {
    /**
     * How many physical keys hold each name down: the two Shifts are one `'Shift'`, held until both
     * are let go.
     */
    const held = new Map<string, number>();
    /**
     * The name each physical key went down with, by `KeyboardEvent.code`. Its release lets go of
     * that name, whatever the key says when it comes up: Shift+1 goes down as `'!'`, and with Shift
     * let go first it comes up as `'1'`, which released by its own name left `'!'` held for ever.
     */
    const down = new Map<string, string>();
    const pressed = new Set<string>();
    const released = new Set<string>();
    /**
     * When each key of `pressed` went down, by the event: the first press if there were two.
     */
    const pressedAt = new Map<string, number>();

    /**
     * Told about every key as it arrives, for whoever needs the event and not the frame.
     */
    let rawListeners: Array<(key: string) => void> = [];

    /**
     * The physical key an event is about. An event with no `code` (made by hand, or by a host that
     * only knows names) stands for the key of its name.
     */
    const physical = (event: KeyboardEvent, key: string): string =>
        typeof event.code === 'string' && event.code.length > 0 ? event.code : `key:${key}`;

    const letGo = (key: string): void => {
        const count = (held.get(key) ?? 0) - 1;
        if (count > 0) {
            held.set(key, count);
            return;
        }
        held.delete(key);
        released.add(key);
    };

    const onKeyDown = (event: Event): void => {
        const keyEvent = event as KeyboardEvent;
        const key = normalizeKey(keyEvent.key);
        // A copy: one that stops listening while being told must not make the next one skip.
        for (const listener of [...rawListeners]) {
            listener(key);
        }
        // A held key repeats `keydown` several times a second, and a repeat is not a press. Without
        // this guard, leaning on the fire button would read as one shot per repeat. It keeps the name
        // it went down with: a repeat after Shift is pressed says `'!'` for a `'1'` still held.
        const code = physical(keyEvent, key);
        if (down.has(code)) {
            return;
        }
        down.set(code, key);
        const count = held.get(key) ?? 0;
        if (count === 0 && !pressed.has(key)) {
            pressed.add(key);
            pressedAt.set(key, momentOf(keyEvent));
        }
        held.set(key, count + 1);
    };

    const onKeyUp = (event: Event): void => {
        const keyEvent = event as KeyboardEvent;
        const code = physical(keyEvent, normalizeKey(keyEvent.key));
        const key = down.get(code);
        if (key === undefined) {
            return;
        }
        down.delete(code);
        letGo(key);
    };

    // A key let go of while the tab is not focused never fires `keyup`, so it would stay held for
    // ever. They count as released rather than simply cleared: a game waiting for the end of a
    // charged shot would otherwise wait for a release that can never arrive.
    const onBlur = (): void => {
        for (const key of held.keys()) {
            released.add(key);
        }
        held.clear();
        down.clear();
    };

    const view = windowOf(canvas);
    view.addEventListener('keydown', onKeyDown);
    view.addEventListener('keyup', onKeyUp);
    view.addEventListener('blur', onBlur);

    return {
        isDown: (key) => held.has(normalizeKey(key)),
        justPressed: (key) => pressed.has(normalizeKey(key)),
        justReleased: (key) => released.has(normalizeKey(key)),
        pressedAt: (key) => pressedAt.get(normalizeKey(key)) ?? null,
        onKey: (listener) => {
            rawListeners.push(listener);
            return () => {
                rawListeners = rawListeners.filter((existing) => existing !== listener);
            };
        },
        endFrame: () => {
            pressed.clear();
            pressedAt.clear();
            released.clear();
        },
        destroy: () => {
            view.removeEventListener('keydown', onKeyDown);
            view.removeEventListener('keyup', onKeyUp);
            view.removeEventListener('blur', onBlur);
            rawListeners = [];
            held.clear();
            down.clear();
            pressed.clear();
            pressedAt.clear();
            released.clear();
        },
    };
};
