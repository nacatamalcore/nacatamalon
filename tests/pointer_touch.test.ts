import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { usePointer } from '../src/hooks/input/use_pointer';
import { useCamera2d } from '../src/hooks/camera/use_camera_2d';
import { createFakeCanvas, createTestGame, startTestScene } from './helpers/test_game';
import { createGameHandle } from '../src/game/handle/create_game_handle';
import type { TPointerHandle, TPointerInfo } from '../src/input';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';
import type { TGameObject } from '../src/hooks/spawn/use_spawn';

/**
 * Touch, one finger apart from another, and the pointer asked rather than listened to: what is
 * pressing, where, and whether a finger is on a button. What an on-screen pad is built from.
 */

const tint = { r: 1, g: 1, b: 1, a: 1 };

type TType = 'touch' | 'mouse' | 'pen';

/**
 * A real DOM pointer event at the canvas, from a given pointer.
 */
const fire = (canvas: HTMLCanvasElement, type: string, clientX: number, clientY: number, pointerId = 1, pointerType: TType = 'touch'): void => {
    canvas.dispatchEvent(Object.assign(new Event(type), { clientX, clientY, button: 0, pointerId, pointerType }));
};

/**
 * A 480x320 game with two 40x40 buttons (left at 40, right at 120, both at y 280), a scene that
 * listens, and the start of a frame.
 */
const pad = () => {
    const canvas = createFakeCanvas(480, 320);
    const { store } = createTestGame({}, canvas);
    let pointer!: TPointerHandle;
    let left!: TSprite;
    let right!: TSprite;
    let ship!: TGameObject;
    const downs: TPointerInfo[] = [];
    const ups: TPointerInfo[] = [];
    const clicks: string[] = [];
    startTestScene(store, 'Level', () => {
        pointer = usePointer();
        pointer.onDown((info) => downs.push(info));
        pointer.onUp((info) => ups.push(info));
        left = createSprite({ width: 40, height: 40, tint, transform: { x: 40, y: 280, rotation: 0, scaleX: 1, scaleY: 1 }, onClick: () => clicks.push('left') });
        right = createSprite({ width: 40, height: 40, tint, transform: { x: 120, y: 280, rotation: 0, scaleX: 1, scaleY: 1 }, onClick: () => clicks.push('right') });
        ship = useSpawn(function Ship() {
            createSprite({ width: 20, height: 20, tint, transform: { x: 300, y: 100, rotation: 0, scaleX: 1, scaleY: 1 } });
        })();
        return createScene();
    });
    const frame = () => store.get('input').pointer.dispatch(store);
    return { canvas, frame, pointer: () => pointer, left: () => left, right: () => right, ship: () => ship, downs, ups, clicks };
};

describe('each finger on its own', () => {
    it('tells listeners which pointer it is and what kind', () => {
        const { canvas, frame, downs } = pad();
        fire(canvas, 'pointerdown', 40, 280, 7, 'touch');
        fire(canvas, 'pointerdown', 10, 10, 1, 'mouse');
        frame();

        expect(downs.map((d) => [d.pointerId, d.pointerType])).toEqual([[7, 'touch'], [1, 'mouse']]);
    });

    it('keeps two fingers moving in one frame as two positions', () => {
        const { canvas, frame, pointer } = pad();
        fire(canvas, 'pointerdown', 40, 280, 1);
        fire(canvas, 'pointerdown', 120, 280, 2);
        frame();
        fire(canvas, 'pointermove', 50, 270, 1);
        fire(canvas, 'pointermove', 130, 290, 2);
        frame();

        expect(pointer().touches().map((t) => [t.pointerId, t.screenX, t.screenY])).toEqual([[1, 50, 270], [2, 130, 290]]);
    });

    it('lifting one finger leaves the other pressing', () => {
        const { canvas, frame, pointer, left, right } = pad();
        fire(canvas, 'pointerdown', 40, 280, 1);
        fire(canvas, 'pointerdown', 120, 280, 2);
        frame();
        fire(canvas, 'pointerup', 40, 280, 1);
        frame();

        expect(pointer().isDown()).toBe(true);
        expect(pointer().isPressing(left())).toBe(false);
        expect(pointer().isPressing(right())).toBe(true);
    });

    it('gives each finger its own click: a second finger landing does not take the first one\'s', () => {
        const { canvas, frame, clicks } = pad();
        fire(canvas, 'pointerdown', 40, 280, 1);
        fire(canvas, 'pointerdown', 120, 280, 2);
        frame();
        fire(canvas, 'pointerup', 40, 280, 1);
        fire(canvas, 'pointerup', 120, 280, 2);
        frame();

        expect(clicks).toEqual(['left', 'right']);
    });

    it('ends a press the system takes back like a release, with no click and nothing left held', () => {
        const { canvas, frame, pointer, ups, clicks } = pad();
        fire(canvas, 'pointerdown', 40, 280, 3);
        frame();
        fire(canvas, 'pointercancel', 40, 280, 3);
        frame();

        expect(pointer().isDown()).toBe(false);
        expect(ups).toHaveLength(1);
        expect(clicks).toEqual([]);
    });
});

describe('the pointer, asked', () => {
    it('is down while a finger is on the screen, and not before or after', () => {
        const { canvas, frame, pointer } = pad();
        expect(pointer().isDown()).toBe(false);
        fire(canvas, 'pointerdown', 200, 200);
        // Not yet: the frame has not started.
        expect(pointer().isDown()).toBe(false);
        frame();
        expect(pointer().isDown()).toBe(true);
        fire(canvas, 'pointerup', 200, 200);
        frame();
        expect(pointer().isDown()).toBe(false);
    });

    it('says where it is, through the scene\'s camera, and null once it leaves', () => {
        const canvas = createFakeCanvas(480, 320);
        const { store } = createTestGame({}, canvas);
        let pointer!: TPointerHandle;
        startTestScene(store, 'Level', () => {
            useCamera2d({ x: 100, y: 50 });
            pointer = usePointer();
            return createScene();
        });
        const frame = () => store.get('input').pointer.dispatch(store);
        expect(pointer.position()).toBeNull();

        fire(canvas, 'pointermove', 30, 40, 1, 'mouse');
        frame();
        expect(pointer.position()).toEqual({ screenX: 30, screenY: 40, worldX: 130, worldY: 90 });

        fire(canvas, 'pointerleave', 30, 40, 1, 'mouse');
        frame();
        expect(pointer.position()).toBeNull();
    });

    it('lists only what is pressing: a mouse that hovers is not a touch', () => {
        const { canvas, frame, pointer } = pad();
        fire(canvas, 'pointermove', 30, 40, 1, 'mouse');
        frame();
        expect(pointer().touches()).toEqual([]);
        expect(pointer().position()).not.toBeNull();
    });
});

describe('a finger on a button', () => {
    it('follows the finger: sliding from one button to the next presses the next', () => {
        const { canvas, frame, pointer, left, right } = pad();
        fire(canvas, 'pointerdown', 40, 280);
        frame();
        expect(pointer().isPressing(left())).toBe(true);
        expect(pointer().isPressing(right())).toBe(false);

        fire(canvas, 'pointermove', 120, 280);
        frame();
        expect(pointer().isPressing(left())).toBe(false);
        expect(pointer().isPressing(right())).toBe(true);
    });

    it('counts a finger on any piece of a whole object', () => {
        const { canvas, frame, pointer, ship } = pad();
        fire(canvas, 'pointerdown', 300, 100);
        frame();

        expect(pointer().isPressing(ship())).toBe(true);
    });

    it('is not pressing a button the mouse only hovers', () => {
        const { canvas, frame, pointer, left } = pad();
        fire(canvas, 'pointermove', 40, 280, 1, 'mouse');
        frame();

        expect(pointer().isPressing(left())).toBe(false);
    });
});

describe('the pointer asked like the keyboard', () => {
    it('reads as just pressed for one frame, then held, then just released for one', () => {
        const { canvas, frame, pointer } = pad();
        const read = () => [pointer().justPressed(), pointer().isDown(), pointer().justReleased()];
        fire(canvas, 'pointerdown', 40, 280, 1);
        frame();
        expect(read()).toEqual([true, true, false]);
        frame();
        expect(read()).toEqual([false, true, false]);
        fire(canvas, 'pointerup', 40, 280, 1);
        frame();
        expect(read()).toEqual([false, false, true]);
        frame();
        expect(read()).toEqual([false, false, false]);
    });

    it('tells one button from another, and a tap within one frame is both', () => {
        const { canvas, frame, pointer } = pad();
        canvas.dispatchEvent(Object.assign(new Event('pointerdown'), { clientX: 10, clientY: 10, button: 2, pointerId: 1, pointerType: 'mouse' }));
        frame();
        expect([pointer().justPressed('right'), pointer().justPressed('main')]).toEqual([true, false]);

        fire(canvas, 'pointerdown', 40, 280, 5);
        fire(canvas, 'pointerup', 40, 280, 5);
        frame();
        expect([pointer().justPressed('main'), pointer().justReleased('main')]).toEqual([true, true]);
    });

    it('counts a touch the system takes back as lifted', () => {
        const { canvas, frame, pointer } = pad();
        fire(canvas, 'pointerdown', 40, 280, 1);
        frame();
        fire(canvas, 'pointercancel', 40, 280, 1);
        frame();
        expect([pointer().isDown(), pointer().justReleased()]).toEqual([false, true]);
    });
});

describe("the browser's menu on a right click", () => {
    const rightClick = (canvas: HTMLCanvasElement): boolean => {
        const event = new Event('contextmenu', { cancelable: true });
        canvas.dispatchEvent(event);
        return event.defaultPrevented;
    };

    it('does not open over the game, which keeps the right button for itself', () => {
        const canvas = createFakeCanvas();
        createTestGame({}, canvas);
        expect(rightClick(canvas)).toBe(true);
    });

    it('opens when the game says contextMenu: true', () => {
        const canvas = createFakeCanvas();
        createTestGame({ contextMenu: true }, canvas);
        expect(rightClick(canvas)).toBe(false);
    });

    it('is changed while the game runs, from the game handle', () => {
        const canvas = createFakeCanvas();
        const { store } = createTestGame({}, canvas);
        const game = createGameHandle(store);
        game.setContextMenu(true);
        expect([game.hasContextMenu(), rightClick(canvas)]).toEqual([true, false]);
        game.setContextMenu(false);
        expect([game.hasContextMenu(), rightClick(canvas)]).toEqual([false, true]);
    });
});
