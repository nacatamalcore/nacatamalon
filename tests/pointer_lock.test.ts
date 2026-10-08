import { afterEach, describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { usePointer } from '../src/hooks/input/use_pointer';
import { createPointer } from '../src/input/create_pointer';
import { createFakeCanvas, createTestGame, startTestScene } from './helpers/test_game';
import type { TPointerHandle, TPointerInfo } from '../src/input';

/**
 * Fires a real DOM pointer event at the canvas, with how far the mouse moved.
 */
const fire = (canvas: HTMLCanvasElement, type: 'pointerdown' | 'pointermove', clientX: number, clientY: number, movementX = 0, movementY = 0): void => {
    canvas.dispatchEvent(Object.assign(new Event(type), { clientX, clientY, movementX, movementY, button: 0, pointerId: 1 }));
};

/**
 * A page whose captured element the test moves by hand, as the browser would.
 */
type TPage = EventTarget & { pointerLockElement: object | null; exitPointerLock: () => void };

const page = (): TPage => {
    const doc = Object.assign(new EventTarget(), {
        pointerLockElement: null as object | null,
        exitPointerLock: () => {
            doc.pointerLockElement = null;
            doc.dispatchEvent(new Event('pointerlockchange'));
        },
    });
    (globalThis as Record<string, unknown>).document = doc;
    return doc;
};

afterEach(() => {
    delete (globalThis as Record<string, unknown>).document;
});

/**
 * A canvas whose `requestPointerLock` answers as told: grants, refuses, refuses only raw movement,
 * or grants the old way, returning nothing and announcing it with an event.
 */
const lockableCanvas = (doc: TPage, answer: 'grant' | 'refuse' | 'refuse-raw' | 'event') => {
    const canvas = createFakeCanvas();
    const asked: unknown[] = [];
    Object.assign(canvas, {
        requestPointerLock: (options?: { unadjustedMovement?: boolean }) => {
            asked.push(options);
            if (answer === 'event') {
                setTimeout(() => {
                    doc.pointerLockElement = canvas;
                    doc.dispatchEvent(new Event('pointerlockchange'));
                }, 0);
                return undefined;
            }
            if (answer === 'refuse' || (answer === 'refuse-raw' && options?.unadjustedMovement === true)) {
                return Promise.reject(new Error('refused'));
            }
            doc.pointerLockElement = canvas;
            return Promise.resolve();
        },
    });
    return { canvas, asked };
};

describe('movement', () => {
    const moving = () => {
        const canvas = createFakeCanvas(480, 320);
        const { store } = createTestGame({}, canvas);
        const moves: TPointerInfo[] = [];
        const downs: TPointerInfo[] = [];
        startTestScene(store, 'Room', () => {
            const pointer = usePointer();
            pointer.onMove((info) => { moves.push(info); });
            pointer.onDown((info) => { downs.push(info); });
            return createScene();
        });
        const frame = () => store.get('input').pointer.dispatch(store);
        return { canvas, moves, downs, frame };
    };

    it('tells a move how far the mouse went', () => {
        const { canvas, moves, frame } = moving();
        fire(canvas, 'pointermove', 100, 100, 7, -3);
        frame();

        expect(moves).toHaveLength(1);
        expect(moves[0]).toMatchObject({ movementX: 7, movementY: -3 });
    });

    it('adds up every move since the last frame, so a quick flick loses nothing', () => {
        const { canvas, moves, frame } = moving();
        fire(canvas, 'pointermove', 100, 100, 5, 1);
        fire(canvas, 'pointermove', 100, 100, 8, 2);
        fire(canvas, 'pointermove', 100, 100, -2, 4);
        frame();

        // One call, the latest position, every bit of the movement.
        expect(moves).toHaveLength(1);
        expect(moves[0]).toMatchObject({ movementX: 11, movementY: 7 });

        fire(canvas, 'pointermove', 100, 100, 1, 1);
        frame();
        expect(moves[1]).toMatchObject({ movementX: 1, movementY: 1 });
    });

    it('gives a press no movement', () => {
        const { canvas, downs, frame } = moving();
        fire(canvas, 'pointermove', 100, 100, 9, 9);
        fire(canvas, 'pointerdown', 100, 100);
        frame();

        expect(downs[0]).toMatchObject({ movementX: 0, movementY: 0 });
    });
});

describe('lock', () => {
    it('captures the mouse and lets it go', async () => {
        const doc = page();
        const { canvas, asked } = lockableCanvas(doc, 'grant');
        const pointer = createPointer(canvas);

        expect(pointer.isLocked()).toBe(false);
        expect(await pointer.lock()).toBe(true);
        expect(pointer.isLocked()).toBe(true);
        expect(asked).toEqual([undefined]);
        // Already captured: nothing more is asked.
        expect(await pointer.lock()).toBe(true);
        expect(asked).toHaveLength(1);

        pointer.unlock();
        expect(pointer.isLocked()).toBe(false);
    });

    it('turns false by itself when the player takes the mouse back', async () => {
        const doc = page();
        const { canvas } = lockableCanvas(doc, 'grant');
        const pointer = createPointer(canvas);
        await pointer.lock();

        // Esc: the browser lets go without the game asking.
        doc.pointerLockElement = null;
        expect(pointer.isLocked()).toBe(false);
    });

    it('answers false rather than throwing when it is refused', async () => {
        const doc = page();
        const { canvas } = lockableCanvas(doc, 'refuse');
        expect(await createPointer(canvas).lock()).toBe(false);
    });

    it('asks for raw movement, and without it when only that is refused', async () => {
        const doc = page();
        const { canvas, asked } = lockableCanvas(doc, 'refuse-raw');
        const pointer = createPointer(canvas);

        expect(await pointer.lock({ raw: true })).toBe(true);
        expect(asked).toEqual([{ unadjustedMovement: true }, undefined]);
    });

    it('waits for the event in a browser that answers with one instead of a promise', async () => {
        const doc = page();
        const { canvas } = lockableCanvas(doc, 'event');
        expect(await createPointer(canvas).lock()).toBe(true);
    });

    it('answers false with no page or no capture to ask for', async () => {
        expect(await createPointer(createFakeCanvas()).lock()).toBe(false);
        page();
        expect(await createPointer(createFakeCanvas()).lock()).toBe(false);
    });

    it('only lets go of a mouse it holds itself, and lets go when destroyed', async () => {
        const doc = page();
        const other = {};
        doc.pointerLockElement = other;
        const { canvas } = lockableCanvas(doc, 'grant');
        const pointer = createPointer(canvas);

        pointer.unlock();
        expect(doc.pointerLockElement).toBe(other);

        await pointer.lock();
        pointer.destroy();
        expect(doc.pointerLockElement).toBeNull();
    });

    it('is reached through usePointer', async () => {
        const doc = page();
        const { canvas } = lockableCanvas(doc, 'grant');
        const { store } = createTestGame({}, canvas);
        let pointer!: TPointerHandle;
        startTestScene(store, 'Room', () => {
            pointer = usePointer();
            return createScene();
        });

        expect(await pointer.lock()).toBe(true);
        expect(pointer.isLocked()).toBe(true);
        pointer.unlock();
        expect(pointer.isLocked()).toBe(false);
    });
});
