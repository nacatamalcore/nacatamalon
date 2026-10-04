import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { useEvent } from '../src/hooks/events/use_event';
import { onEvent } from '../src/events/on_event';
import { listen } from '../src/events/listen';
import { destroy, flushDestroyed } from '../src/destroy';
import { createFakeCanvas, createTestGame, startTestScene } from './helpers/test_game';
import type { TBox } from '../src/box';
import type { TRuntimeStore } from '../src/store';

const tint = { r: 1, g: 1, b: 1, a: 1 };

describe('useEvent and onEvent', () => {
    it('refuses to declare an event outside a body', () => {
        expect(() => useEvent('pressed')).toThrow('[NacatamalOn] useEvent');
    });

    it('travels up to the first object that listens, and stops there', () => {
        const { store } = createTestGame();
        let send!: (payload: { n: number }) => boolean;
        let copy!: TBox;
        let inner!: TBox;
        const root = startTestScene(store, 'Level', () => {
            // A copy holding a box holding the one that sends: three levels, like a pack's button.
            copy = useSpawn(() => {
                inner = useSpawn(() => {
                    useSpawn(() => { send = useEvent<{ n: number }>('pressed'); })();
                })();
            })();
            return createScene();
        });

        const heard: string[] = [];
        onEvent(root, 'pressed', () => heard.push('root'));
        onEvent<{ n: number }>(copy, 'pressed', ({ n }, from) => heard.push(`copy ${n} from ${from.parent === inner ? 'inside' : '?'}`));

        expect(send({ n: 1 })).toBe(true);
        // The copy heard it; the scene above it did not: the first listener is the boundary.
        expect(heard).toEqual(['copy 1 from inside']);
    });

    it('answers false when nobody listens, and stops hearing once disconnected', () => {
        const { store } = createTestGame();
        let send!: () => boolean;
        let holder!: TBox;
        startTestScene(store, 'Level', () => {
            holder = useSpawn(() => { send = useEvent('done'); })();
            return createScene();
        });

        expect(send()).toBe(false);
        const off = onEvent(holder, 'done', () => {});
        expect(send()).toBe(true);
        off();
        expect(send()).toBe(false);
    });

    it('is not heard by an object that has been destroyed', () => {
        const { store } = createTestGame();
        let send!: () => boolean;
        let holder!: TBox;
        const heard: string[] = [];
        const root = startTestScene(store, 'Level', () => {
            holder = useSpawn(() => { useSpawn(() => { send = useEvent('ping'); })(); })();
            return createScene();
        });
        onEvent(holder, 'ping', () => heard.push('holder'));
        onEvent(root, 'ping', () => heard.push('root'));

        destroy(holder);
        // Marked first and taken out at the end of the frame: in between it is already deaf.
        send();
        expect(heard).toEqual(['root']);
        flushDestroyed(store);
    });
});

/**
 * Fires a real DOM pointer event at the canvas, the way a browser would.
 */
const fire = (canvas: HTMLCanvasElement, type: 'pointerdown' | 'pointerup' | 'pointermove', clientX: number, clientY: number): void => {
    canvas.dispatchEvent(Object.assign(new Event(type), { clientX, clientY, button: 0, pointerId: 1 }));
};

describe('listen on a whole object', () => {
    /**
     * A button at (100, 100): a 60x20 border, a fill over it and a label box as a child.
     */
    const button = (): { store: TRuntimeStore; canvas: HTMLCanvasElement; frame: () => void; box: TBox; label: TBox } => {
        const canvas = createFakeCanvas(320, 224);
        const { store } = createTestGame({}, canvas);
        let box!: TBox;
        let label!: TBox;
        startTestScene(store, 'Menu', () => {
            box = useSpawn(() => {
                useTransform({ x: 100, y: 100 });
                createSprite({ width: 60, height: 20, tint });
                createSprite({ width: 56, height: 16, tint, zIndex: 1 });
                label = useSpawn(() => {
                    useTransform({ x: 20, y: 0 });
                    createSprite({ width: 10, height: 10, tint, zIndex: 2 });
                })();
            })();
            return createScene();
        });
        return { store, canvas, frame: () => store.get('input').pointer.dispatch(store), box, label };
    };

    it('reacts to a click on any of its pieces, its children\'s included', () => {
        const { canvas, frame, box } = button();
        let clicks = 0;
        listen(box, { onClick: () => { clicks++; } });

        // On the fill.
        fire(canvas, 'pointerdown', 90, 100);
        fire(canvas, 'pointerup', 90, 100);
        frame();
        // On the label, which is a child box.
        fire(canvas, 'pointerdown', 120, 100);
        fire(canvas, 'pointerup', 120, 100);
        frame();
        // Outside it.
        fire(canvas, 'pointerdown', 10, 10);
        fire(canvas, 'pointerup', 10, 10);
        frame();

        expect(clicks).toBe(2);
    });

    it('is one thing to hover: moving between its pieces is not leaving it', () => {
        const { canvas, frame, box } = button();
        const seen: string[] = [];
        listen(box, { onPointerOver: () => seen.push('over'), onPointerOut: () => seen.push('out') });

        fire(canvas, 'pointermove', 90, 100);
        frame();
        fire(canvas, 'pointermove', 120, 100);
        frame();
        fire(canvas, 'pointermove', 10, 10);
        frame();

        expect(seen).toEqual(['over', 'out']);
    });

    it('lets a piece that listens by itself answer for itself', () => {
        const { canvas, frame, box, label } = button();
        const seen: string[] = [];
        listen(box, { onClick: () => seen.push('button') });
        listen(label.drawables[0] as Parameters<typeof listen>[0], { onClick: () => seen.push('label') });

        fire(canvas, 'pointerdown', 120, 100);
        fire(canvas, 'pointerup', 120, 100);
        frame();

        expect(seen).toEqual(['label']);
    });
});
