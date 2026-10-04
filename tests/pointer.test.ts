import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { stopScene } from '../src/scene/stop_scene';
import { setScenePaused } from '../src/scene/pause_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { usePointer } from '../src/hooks/input/use_pointer';
import { useTransform } from '../src/hooks/transform/use_transform';
import { createTilemap } from '../src/gameobjects/tilemap/create_tilemap';
import { whenLoaded } from '../src/loaders';
import { serveTilemap } from './helpers/test_tilemap';
import { useCamera2d } from '../src/hooks/camera/use_camera_2d';
import { useScreenSpace } from '../src/hooks/camera/use_screen_space';
import { destroy, flushDestroyed } from '../src/destroy';
import { createFakeCanvas, createTestGame, startTestScene } from './helpers/test_game';
import type { TPointerHandle, TPointerInfo, TPointerWheelInfo } from '../src/input';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';
import type { TTilemap } from '../src/gameobjects/tilemap';
import type { TTexture } from '../src/loaders';
import type { TRuntimeStore } from '../src/store';

const tint = { r: 1, g: 1, b: 1, a: 1 };

type TSpriteBits = { x: number; y: number; width?: number; height?: number; rotation?: number; scaleX?: number; scaleY?: number; zIndex?: number; anchor?: { x: number; y: number }; texture?: TTexture };

/**
 * A sprite 20x20 by default, centred on its position unless an anchor says otherwise.
 */
const box = ({ x, y, width = 20, height = 20, rotation = 0, scaleX = 1, scaleY = 1, zIndex, anchor, texture }: TSpriteBits): TSprite =>
    createSprite({ width, height, tint, texture, zIndex, anchor, transform: { x, y, rotation, scaleX, scaleY } });

/**
 * Fires a real DOM pointer event at the canvas, the way a browser would.
 */
const fire = (canvas: HTMLCanvasElement, type: 'pointerdown' | 'pointerup' | 'pointermove', clientX: number, clientY: number, button = 0): void => {
    canvas.dispatchEvent(Object.assign(new Event(type), { clientX, clientY, button, pointerId: 1 }));
};

/**
 * A game on a 480x320 canvas shown at `scale`, plus a way to run the start of a frame.
 */
const pointerGame = (scale = 1) => {
    const canvas = createFakeCanvas(480, 320, scale);
    const { store } = createTestGame({}, canvas);
    const frame = () => store.get('input').pointer.dispatch(store);
    return { store, canvas, frame };
};

/**
 * Starts a scene that registers a pointer and records every `down` it is told about.
 */
const listening = (store: TRuntimeStore, name: string, body: () => void = () => {}) => {
    const seen: TPointerInfo[] = [];
    let pointer!: TPointerHandle;
    const root = startTestScene(store, name, () => {
        body();
        pointer = usePointer();
        pointer.onDown((info) => { seen.push(info); });
        return createScene();
    });
    return { seen, pointer, root };
};

describe('usePointer', () => {
    it('refuses to be called outside a scene body', () => {
        expect(() => usePointer()).toThrow('[NacatamalOn] usePointer');
    });

    it('waits for the frame: a press reaches no listener until the loop hands it on', () => {
        const { store, canvas, frame } = pointerGame();
        const { seen } = listening(store, 'Level');

        fire(canvas, 'pointerdown', 10, 10);
        expect(seen).toHaveLength(0);

        frame();
        expect(seen).toHaveLength(1);

        // Handed on once, not again on the next frame.
        frame();
        expect(seen).toHaveLength(1);
    });

    it('turns page pixels into game pixels when the canvas is shown bigger', () => {
        const { store, canvas, frame } = pointerGame(2);
        const { seen } = listening(store, 'Level');

        fire(canvas, 'pointerdown', 200, 100, 2);
        frame();

        expect(seen[0].screenX).toBe(100);
        expect(seen[0].screenY).toBe(50);
        expect(seen[0].button).toBe(2);
    });

    it('gives the world position through the scene camera', () => {
        const { store, canvas, frame } = pointerGame();
        const { seen } = listening(store, 'Level', () => {
            useCamera2d({ x: 1000, y: 500, zoom: 2 });
        });

        fire(canvas, 'pointerdown', 100, 60);
        frame();

        // Twice as big on screen, so 100 screen pixels are 50 world pixels from the corner.
        expect(seen[0].worldX).toBeCloseTo(1050, 10);
        expect(seen[0].worldY).toBeCloseTo(530, 10);
        expect(seen[0].screenX).toBe(100);
    });

    it('turns a turned camera back when working out the world position', () => {
        const { store, canvas, frame } = pointerGame();
        const { seen } = listening(store, 'Level', () => {
            useCamera2d({ x: 0, y: 0, rotation: Math.PI / 2 });
        });

        fire(canvas, 'pointerdown', 0, -10);
        frame();

        // The inverse of the view: through a camera turned a quarter, (0, -10) on screen is (10, 0).
        expect(seen[0].worldX).toBeCloseTo(10, 10);
        expect(seen[0].worldY).toBeCloseTo(0, 10);
    });

    it('merges the moves of one frame into one, and keeps every press and release', () => {
        const { store, canvas, frame } = pointerGame();
        const order: string[] = [];

        startTestScene(store, 'Level', () => {
            const pointer = usePointer();
            pointer.onMove((info) => { order.push(`move ${info.screenX}`); });
            pointer.onDown(() => { order.push('down'); });
            pointer.onUp(() => { order.push('up'); });
            return createScene();
        });

        fire(canvas, 'pointermove', 1, 0);
        fire(canvas, 'pointermove', 2, 0);
        fire(canvas, 'pointermove', 3, 0);
        fire(canvas, 'pointerdown', 3, 0);
        fire(canvas, 'pointerup', 3, 0);
        fire(canvas, 'pointerdown', 3, 0);
        fire(canvas, 'pointerup', 3, 0);
        fire(canvas, 'pointermove', 9, 0);
        frame();

        expect(order).toEqual(['move 3', 'down', 'up', 'down', 'up', 'move 9']);
    });

    it('stops early with the function it returns', () => {
        const { store, canvas, frame } = pointerGame();
        let calls = 0;

        startTestScene(store, 'Level', () => {
            const off = usePointer().onDown(() => { calls += 1; });
            off();
            return createScene();
        });

        fire(canvas, 'pointerdown', 0, 0);
        frame();
        expect(calls).toBe(0);
    });

    it('goes away with its scene', () => {
        const { store, canvas, frame } = pointerGame();
        const { seen } = listening(store, 'Level');

        stopScene(store, 'Level');
        fire(canvas, 'pointerdown', 0, 0);
        frame();

        expect(seen).toHaveLength(0);
    });

    it('goes away with the object that registered it', () => {
        const { store, canvas, frame } = pointerGame();
        let calls = 0;
        const Button = () => { usePointer().onDown(() => { calls += 1; }); };
        let button!: ReturnType<ReturnType<typeof useSpawn>>;

        startTestScene(store, 'Level', () => {
            button = useSpawn(Button)();
            return createScene();
        });

        destroy(button);
        flushDestroyed(store);
        fire(canvas, 'pointerdown', 0, 0);
        frame();

        expect(calls).toBe(0);
    });

    it('is not called while its scene is paused, while another scene still is', () => {
        const { store, canvas, frame } = pointerGame();
        const level = listening(store, 'Level');
        const menu = listening(store, 'PauseMenu');

        setScenePaused(store, 'Level', true);
        fire(canvas, 'pointerdown', 0, 0);
        frame();

        expect(level.seen).toHaveLength(0);
        expect(menu.seen).toHaveLength(1);
    });
});

describe('what is under the pointer', () => {
    it('is never a map, whatever it covers', async () => {
        const served = serveTilemap();
        const { store, canvas, frame } = pointerGame();
        let map!: TTilemap;
        const { seen } = listening(store, 'Level', () => {
            map = createTilemap({ src: '/maps/level.tilemap' });
            box({ x: 100, y: 100 });
        });
        await whenLoaded(map);
        frame();

        // Away from the sprite, over the map: a map has no size of its own and covers the level, so
        // testing it would put something under the pointer everywhere. It was being measured as a
        // sprite, which is what this stops.
        fire(canvas, 'pointerdown', 10, 10);
        frame();
        served.restore();

        expect(seen[0].target).toBeNull();
        expect(seen[0].hits).toEqual([]);
    });

    it('moves with the box that moved the sprite', () => {
        const { store, canvas, frame } = pointerGame();
        let moved!: TSprite;
        const { seen } = listening(store, 'Level', () => {
            useSpawn(() => {
                useTransform({ x: 100, y: 100 });
                moved = box({ x: 0, y: 0 });
            })();
        });

        // Where it says it is, which is not where it is any more.
        fire(canvas, 'pointerdown', 0, 0);
        frame();
        expect(seen[0].target).toBeNull();

        fire(canvas, 'pointerdown', 100, 100);
        frame();
        expect(seen[1].target).toBe(moved);
    });

    it('is the sprite on top first, by zIndex', () => {
        const { store, canvas, frame } = pointerGame();
        let low!: TSprite;
        let high!: TSprite;
        const { seen } = listening(store, 'Level', () => {
            high = box({ x: 100, y: 100, zIndex: 5 });
            low = box({ x: 100, y: 100 });
        });

        fire(canvas, 'pointerdown', 100, 100);
        frame();

        expect(seen[0].target).toBe(high);
        expect(seen[0].hits).toEqual([high, low]);
    });

    it('is the later scene first, whatever the zIndex', () => {
        const { store, canvas, frame } = pointerGame();
        let world!: TSprite;
        let hud!: TSprite;

        startTestScene(store, 'Level', () => {
            world = box({ x: 100, y: 100, zIndex: 1000 });
            return createScene();
        });
        const { seen } = listening(store, 'Hud', () => {
            hud = box({ x: 100, y: 100 });
        });

        fire(canvas, 'pointerdown', 100, 100);
        frame();

        expect(seen[0].hits).toEqual([hud, world]);
    });

    it('is empty over empty space', () => {
        const { store, canvas, frame } = pointerGame();
        const { seen } = listening(store, 'Level', () => { box({ x: 100, y: 100 }); });

        fire(canvas, 'pointerdown', 300, 300);
        frame();

        expect(seen[0].target).toBeNull();
        expect(seen[0].hits).toEqual([]);
    });

    it('follows the turn of a sprite, not the box it would have without it', () => {
        const { store } = pointerGame();
        const { pointer } = listening(store, 'Level', () => {
            // A long thin bar, 100 by 10, turned a quarter: it now stands upright.
            box({ x: 200, y: 200, width: 100, height: 10, rotation: Math.PI / 2 });
        });

        // Where the bar reaches standing up, and where it would have reached lying down.
        expect(pointer.pick(200, 240)).toHaveLength(1);
        expect(pointer.pick(240, 200)).toHaveLength(0);
    });

    it('respects the anchor, a mirrored scale and a zero scale', () => {
        const { store } = pointerGame();
        const { pointer } = listening(store, 'Level', () => {
            // Anchored top-left: covers 0..20, not -10..10.
            box({ x: 0, y: 0, anchor: { x: 0, y: 0 } });
            // Mirrored: still covers 90..110.
            box({ x: 100, y: 0, scaleX: -1, anchor: { x: 0.5, y: 0 } });
            // Flattened to nothing.
            box({ x: 300, y: 10, scaleX: 0 });
        });

        expect(pointer.pick(15, 15)).toHaveLength(1);
        expect(pointer.pick(-5, 5)).toHaveLength(0);
        expect(pointer.pick(95, 10)).toHaveLength(1);
        expect(pointer.pick(105, 10)).toHaveLength(1);
        expect(pointer.pick(300, 10)).toHaveLength(0);
    });

    it('finds a sprite through the camera, and a screen-space one where it is shown', () => {
        const { store } = pointerGame();
        let inWorld!: TSprite;
        let onScreen!: TSprite;
        const Hud = () => { useScreenSpace(); onScreen = box({ x: 50, y: 50 }); };

        const { pointer } = listening(store, 'Level', () => {
            useCamera2d({ x: 1000, y: 1000, zoom: 2 });
            inWorld = box({ x: 1100, y: 1050 });
            useSpawn(Hud)();
        });

        // The world sprite sits 100, 50 from the camera corner, doubled on screen.
        expect(pointer.pick(200, 100)).toEqual([inWorld]);
        // The HUD one is where its numbers say, camera or not.
        expect(pointer.pick(50, 50)).toEqual([onScreen]);
    });

    it('skips what is not drawn: a texture still loading, or something destroyed', () => {
        const { store } = pointerGame();
        const loading: TTexture = { type: 'texture', key: 'k', src: 'k.png', width: 0, height: 0, status: 'loading', gpu: null };
        let doomed!: TSprite;

        const { pointer } = listening(store, 'Level', () => {
            box({ x: 100, y: 100, texture: loading });
            doomed = box({ x: 200, y: 100 });
        });

        destroy(doomed);
        expect(pointer.pick(100, 100)).toHaveLength(0);
        expect(pointer.pick(200, 100)).toHaveLength(0);
    });
});

/**
 * Turns the wheel over the canvas, the way a browser reports it. Returns the event, to see if it was kept from the page.
 */
const turn = (canvas: HTMLCanvasElement, deltaY: number, { deltaX = 0, deltaMode = 0, clientX = 10, clientY = 10 } = {}): Event => {
    const event = Object.assign(new Event('wheel', { cancelable: true }), { deltaX, deltaY, deltaMode, clientX, clientY });
    canvas.dispatchEvent(event);
    return event;
};

/**
 * Starts a scene that listens to the wheel and records what it is told.
 */
const wheeling = (store: TRuntimeStore, name: string, body: () => void = () => {}) => {
    const seen: TPointerWheelInfo[] = [];
    let off!: () => void;
    startTestScene(store, name, () => {
        body();
        off = usePointer().onWheel((info) => { seen.push(info); });
        return createScene();
    });
    return { seen, off: () => off() };
};

describe('the wheel', () => {
    it('waits for the frame, like every other pointer event', () => {
        const { store, canvas, frame } = pointerGame();
        const { seen } = wheeling(store, 'Level');

        turn(canvas, 100);
        expect(seen).toHaveLength(0);
        frame();
        expect(seen.map((info) => info.deltaY)).toEqual([100]);
    });

    it('adds up every turn since the last frame, so a quick spin loses nothing', () => {
        const { store, canvas, frame } = pointerGame();
        const { seen } = wheeling(store, 'Level');

        turn(canvas, 100);
        turn(canvas, 100, { deltaX: 5 });
        turn(canvas, -40);
        frame();

        expect(seen).toHaveLength(1);
        expect(seen[0].deltaY).toBe(160);
        expect(seen[0].deltaX).toBe(5);
    });

    it('counts in pixels, whatever unit the browser used', () => {
        const { store, canvas, frame } = pointerGame();
        const { seen } = wheeling(store, 'Level');

        // Three lines, as Firefox reports an ordinary notch, and then half a page.
        turn(canvas, 3, { deltaMode: 1 });
        frame();
        turn(canvas, 0.5, { deltaMode: 2 });
        frame();

        expect(seen.map((info) => info.deltaY)).toEqual([48, 400]);
    });

    it('says where it turned and what was under it, like a press', () => {
        const { store, canvas, frame } = pointerGame(2);
        let crate!: TSprite;
        const { seen } = wheeling(store, 'Level', () => { crate = box({ x: 100, y: 50 }); });

        turn(canvas, 100, { clientX: 200, clientY: 100 });
        frame();

        expect(seen[0]).toMatchObject({ screenX: 100, screenY: 50, target: crate });
    });

    it('keeps the page from scrolling only while something listens', () => {
        const { store, canvas } = pointerGame();

        expect(turn(canvas, 100).defaultPrevented).toBe(false);
        const { off } = wheeling(store, 'Level');
        expect(turn(canvas, 100).defaultPrevented).toBe(true);
        off();
        expect(turn(canvas, 100).defaultPrevented).toBe(false);
    });

    it('is not heard by a paused scene, nor by one that has stopped', () => {
        const { store, canvas, frame } = pointerGame();
        const { seen } = wheeling(store, 'Level');

        setScenePaused(store, 'Level', true);
        turn(canvas, 100);
        frame();
        expect(seen).toHaveLength(0);

        setScenePaused(store, 'Level', false);
        stopScene(store, 'Level');
        expect(turn(canvas, 100).defaultPrevented).toBe(false);
    });
});
