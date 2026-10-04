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
    const held = new Set<string>();
    const pressed = new Set<string>();
    const released = new Set<string>();

    /**
     * Told about every key as it arrives, for whoever needs the event and not the frame.
     */
    let rawListeners: Array<(key: string) => void> = [];

    const onKeyDown = (event: Event): void => {
        const key = normalizeKey((event as KeyboardEvent).key);
        // A copy: one that stops listening while being told must not make the next one skip.
        for (const listener of [...rawListeners]) {
            listener(key);
        }
        // A held key repeats `keydown` several times a second, and a repeat is not a press. Without
        // this guard, leaning on the fire button would read as one shot per repeat.
        if (!held.has(key)) {
            pressed.add(key);
        }
        held.add(key);
    };

    const onKeyUp = (event: Event): void => {
        const key = normalizeKey((event as KeyboardEvent).key);
        if (held.delete(key)) {
            released.add(key);
        }
    };

    // A key let go of while the tab is not focused never fires `keyup`, so it would stay held for
    // ever. They count as released rather than simply cleared: a game waiting for the end of a
    // charged shot would otherwise wait for a release that can never arrive.
    const onBlur = (): void => {
        for (const key of held) {
            released.add(key);
        }
        held.clear();
    };

    const view = canvas.ownerDocument?.defaultView ?? (globalThis as unknown as Window);
    view.addEventListener('keydown', onKeyDown);
    view.addEventListener('keyup', onKeyUp);
    view.addEventListener('blur', onBlur);

    return {
        isDown: (key) => held.has(normalizeKey(key)),
        justPressed: (key) => pressed.has(normalizeKey(key)),
        justReleased: (key) => released.has(normalizeKey(key)),
        onKey: (listener) => {
            rawListeners.push(listener);
            return () => {
                rawListeners = rawListeners.filter((existing) => existing !== listener);
            };
        },
        endFrame: () => {
            pressed.clear();
            released.clear();
        },
        destroy: () => {
            view.removeEventListener('keydown', onKeyDown);
            view.removeEventListener('keyup', onKeyUp);
            view.removeEventListener('blur', onBlur);
            rawListeners = [];
            held.clear();
            pressed.clear();
            released.clear();
        },
    };
};
