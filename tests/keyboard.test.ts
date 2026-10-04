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
    return { canvas, send };
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
