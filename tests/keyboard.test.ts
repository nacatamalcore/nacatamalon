import { describe, expect, it } from 'bun:test';
import { createKeyboard } from '../src/input/create_keyboard';

/**
 * A canvas whose window is a bare `EventTarget`, which is all the keyboard asks of it. Keys are
 * fed in by dispatching the same events a browser would.
 */
const fakeCanvas = () => {
    const view = new EventTarget();
    const canvas = { ownerDocument: { defaultView: view } } as unknown as HTMLCanvasElement;
    const send = (type: 'keydown' | 'keyup' | 'blur', key = '') => {
        view.dispatchEvent(Object.assign(new Event(type), { key }));
    };
    // As a browser sends them: the name the key gives now, and which physical key it is.
    const press = (type: 'keydown' | 'keyup', key: string, code: string) => {
        view.dispatchEvent(Object.assign(new Event(type), { key, code }));
    };
    return { canvas, send, press };
};

describe('the keyboard', () => {
    it('knows what is held, until it is let go', () => {
        const { canvas, send } = fakeCanvas();
        const keys = createKeyboard(canvas);

        expect(keys.isDown('a')).toBe(false);
        send('keydown', 'a');
        expect(keys.isDown('a')).toBe(true);

        send('keyup', 'a');
        expect(keys.isDown('a')).toBe(false);
    });

    it('reports a press for one frame, and only one', () => {
        const { canvas, send } = fakeCanvas();
        const keys = createKeyboard(canvas);

        send('keydown', ' ');
        expect(keys.justPressed(' ')).toBe(true);
        expect(keys.isDown(' ')).toBe(true);

        keys.endFrame();
        expect(keys.justPressed(' ')).toBe(false);
        expect(keys.isDown(' ')).toBe(true);
    });

    it('takes \'Space\' for the space bar, which the browser reports as \' \'', () => {
        const { canvas, send } = fakeCanvas();
        const keys = createKeyboard(canvas);

        send('keydown', ' ');
        expect(keys.isDown('Space')).toBe(true);
        expect(keys.justPressed('Space')).toBe(true);
        expect(keys.isDown('Spacebar')).toBe(true);
        expect(keys.isDown(' ')).toBe(true);
        // A name is still a name: only the space bar is folded.
        expect(keys.isDown('space')).toBe(false);
    });

    it('does not read a held key as a stream of presses', () => {
        const { canvas, send } = fakeCanvas();
        const keys = createKeyboard(canvas);

        send('keydown', ' ');
        keys.endFrame();

        // What the browser does several times a second while a key is held.
        send('keydown', ' ');
        send('keydown', ' ');
        expect(keys.justPressed(' ')).toBe(false);
    });

    it('reports a release for one frame', () => {
        const { canvas, send } = fakeCanvas();
        const keys = createKeyboard(canvas);

        send('keydown', 'f');
        keys.endFrame();
        send('keyup', 'f');

        expect(keys.justReleased('f')).toBe(true);
        keys.endFrame();
        expect(keys.justReleased('f')).toBe(false);
    });

    it('ignores a keyup for something that was never down', () => {
        const { canvas, send } = fakeCanvas();
        const keys = createKeyboard(canvas);

        send('keyup', 'f');
        expect(keys.justReleased('f')).toBe(false);
    });

    it('folds single characters and keeps names exact', () => {
        const { canvas, send } = fakeCanvas();
        const keys = createKeyboard(canvas);

        send('keydown', 'A');
        expect(keys.isDown('a')).toBe(true);
        expect(keys.isDown('A')).toBe(true);

        send('keydown', 'ArrowLeft');
        expect(keys.isDown('ArrowLeft')).toBe(true);
        expect(keys.isDown('arrowleft')).toBe(false);
    });

    it('lets go of a key by the name it went down with, whatever it says coming up', () => {
        const { canvas, press } = fakeCanvas();
        const keys = createKeyboard(canvas);

        // Shift+1 goes down as '!'; with Shift let go first, the 1 comes up as '1'.
        press('keydown', 'Shift', 'ShiftLeft');
        press('keydown', '!', 'Digit1');
        press('keyup', 'Shift', 'ShiftLeft');
        expect(keys.isDown('!')).toBe(true);
        press('keyup', '1', 'Digit1');

        expect(keys.isDown('!')).toBe(false);
        expect(keys.justReleased('!')).toBe(true);
        expect(keys.isDown('1')).toBe(false);
        expect(keys.justReleased('1')).toBe(false);
    });

    it('keeps the name a held key went down with through its repeats', () => {
        const { canvas, press } = fakeCanvas();
        const keys = createKeyboard(canvas);

        press('keydown', '1', 'Digit1');
        keys.endFrame();
        // Shift pressed while 1 is held: the repeats now say '!', and are still the same key.
        press('keydown', 'Shift', 'ShiftLeft');
        press('keydown', '!', 'Digit1');

        expect(keys.isDown('1')).toBe(true);
        expect(keys.isDown('!')).toBe(false);
        expect(keys.justPressed('!')).toBe(false);
    });

    it('holds a name two keys share until both are let go', () => {
        const { canvas, press } = fakeCanvas();
        const keys = createKeyboard(canvas);

        press('keydown', 'Shift', 'ShiftLeft');
        press('keydown', 'Shift', 'ShiftRight');
        keys.endFrame();
        press('keyup', 'Shift', 'ShiftLeft');
        expect(keys.isDown('Shift')).toBe(true);
        expect(keys.justReleased('Shift')).toBe(false);

        press('keyup', 'Shift', 'ShiftRight');
        expect(keys.isDown('Shift')).toBe(false);
        expect(keys.justReleased('Shift')).toBe(true);
    });

    it('lets go of everything when the window loses focus', () => {
        const { canvas, send } = fakeCanvas();
        const keys = createKeyboard(canvas);

        send('keydown', 'ArrowRight');
        keys.endFrame();
        send('blur');

        expect(keys.isDown('ArrowRight')).toBe(false);
        // Counted as a release, so a charge waiting for one is not left waiting for ever.
        expect(keys.justReleased('ArrowRight')).toBe(true);
    });

    it('stops listening once destroyed', () => {
        const { canvas, send } = fakeCanvas();
        const keys = createKeyboard(canvas);

        send('keydown', 'a');
        keys.destroy();
        expect(keys.isDown('a')).toBe(false);

        send('keydown', 'a');
        expect(keys.isDown('a')).toBe(false);
    });
});
