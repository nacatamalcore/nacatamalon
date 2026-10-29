import { afterEach, describe, expect, it } from 'bun:test';
import { spriteRepeat } from '../src/render/shared/sprite_repeat';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { runHookUpdates } from '../src/game/loop/runHookUpdates';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createText } from '../src/gameobjects/text/create_text';
import { createNineSlice } from '../src/gameobjects/nine_slice/create_nine_slice';
import { createBackdrop } from '../src/gameobjects/sprite/create_backdrop';
import { createTilemap } from '../src/gameobjects/tilemap/create_tilemap';
import { useCamera2d } from '../src/hooks/camera/use_camera_2d';
import { useParallax } from '../src/hooks/camera/use_parallax';
import { useScreenSpace } from '../src/hooks/camera/use_screen_space';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { pickTargets } from '../src/input/pick_targets';
import { whenLoaded } from '../src/loaders';
import { parseTilemapDoc } from '../src/loaders/tilemap/parse_tilemap_doc';
import { serializeTilemapDoc } from '../src/loaders/tilemap/serialize_tilemap_doc';
import { createTestGame, startTestScene } from './helpers/test_game';
import { serveTilemap, TEST_MAP } from './helpers/test_tilemap';
import { createTestFont } from './helpers/test_font';
import type { TDrawSprite } from '../src/render/interface';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';
import type { TText } from '../src/gameobjects/text/types/t_text';
import type { TNineSlice } from '../src/gameobjects/nine_slice/types/t_nine_slice';
import type { TTexture } from '../src/loaders';
import type { TTilemap } from '../src/gameobjects/tilemap/types/t_tilemap';
import type { TFrameContext } from '../src/render';
import type { TRuntimeStore } from '../src/store';

/**
 * Pictures that repeat instead of stretching, layers that move with the camera only so much, and the
 * backdrop that is both: the far layers of a 16-bit platformer.
 */

const tint = { r: 1, g: 1, b: 1, a: 1 };
const at = (x: number, y: number) => ({ x, y, rotation: 0, scaleX: 1, scaleY: 1 });

const frame = (store: TRuntimeStore) => {
    const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
    fillFrameContext(store, ctx);
};

/**
 * Where a drawable is drawn this frame: where the frame put it, or where it says.
 */
const drawnAt = (sprite: { transform: { x: number; y: number }; worldTransform?: { x: number; y: number } }) => {
    const place = sprite.worldTransform ?? sprite.transform;
    return [place.x, place.y];
};

describe('a sprite that repeats', () => {
    const picture = { width: 32, height: 16, status: 'ready' } as TDrawSprite['texture'];

    it('lays its picture as many times as fit, from where its pattern starts', () => {
        const repeated = { type: 'sprite', transform: at(0, 0), texture: picture, tint, width: 96, height: 48, repeat: true, repeatOffset: { x: 8, y: 4 } } as TDrawSprite;
        expect(spriteRepeat(repeated)).toEqual({ tilesX: 3, tilesY: 3, shiftX: 0.25, shiftY: 0.25 });
    });

    it('lays a frame of a sheet, not the whole sheet', () => {
        const framed = { type: 'sprite', transform: at(0, 0), texture: picture, tint, width: 64, height: 16, repeat: true, uvScale: { x: 0.5, y: 1 } } as TDrawSprite;
        expect(spriteRepeat(framed).tilesX).toBe(4);
    });

    it('is laid once, from the start, when it does not repeat or has no picture', () => {
        const once = { tilesX: 1, tilesY: 1, shiftX: 0, shiftY: 0 };
        expect(spriteRepeat({ type: 'sprite', transform: at(0, 0), texture: picture, tint, width: 96, height: 48 } as TDrawSprite)).toEqual(once);
        expect(spriteRepeat({ type: 'sprite', transform: at(0, 0), texture: null, tint, width: 96, height: 48, repeat: true } as TDrawSprite)).toEqual(once);
    });
});

describe('parallax', () => {
    const scene = (body: () => void) => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            const camera = useCamera2d();
            camera.transform.x = 100;
            camera.transform.y = 40;
            body();
            return createScene();
        });
        frame(store);
        return store;
    };

    it('moves a sprite with the camera only so much: half across, not at all down', () => {
        let far!: TSprite;
        let near!: TSprite;
        scene(() => {
            far = createSprite({ width: 8, height: 8, tint, transform: at(200, 100), parallax: { x: 0.5, y: 0 } });
            near = createSprite({ width: 8, height: 8, tint, transform: at(200, 100) });
        });
        // Half the camera's 100 across stays behind; all of its 40 down does.
        expect(drawnAt(far)).toEqual([250, 140]);
        expect(drawnAt(near)).toEqual([200, 100]);
        // Its own placement is untouched.
        expect([far.transform.x, far.transform.y]).toEqual([200, 100]);
    });

    it('draws a layer loose in the scene from the same place every frame, rather than a new one each', () => {
        let far!: TSprite;
        const store = scene(() => {
            far = createSprite({ width: 8, height: 8, tint, transform: at(200, 100), parallax: { x: 0.5, y: 0 } });
        });
        const first = far.worldTransform;
        frame(store);
        frame(store);
        expect(far.worldTransform).toBe(first!);
        expect(drawnAt(far)).toEqual([250, 140]);
    });

    it('is given to everything an object draws and holds, unless a drawable has its own', () => {
        let held!: TSprite;
        let own!: TSprite;
        scene(() => {
            useSpawn(function Hills() {
                useParallax({ x: 0.5, y: 1 });
                own = createSprite({ width: 8, height: 8, tint, transform: at(10, 10), parallax: { x: 0, y: 1 } });
                useSpawn(function Tree() { held = createSprite({ width: 8, height: 8, tint, transform: at(20, 20) }); })();
            })();
        });
        expect(drawnAt(held)).toEqual([70, 20]);
        expect(drawnAt(own)).toEqual([110, 10]);
    });

    it('is nothing to what is pinned to the screen', () => {
        let hud!: TSprite;
        scene(() => {
            useSpawn(function Hud() {
                useScreenSpace();
                hud = createSprite({ width: 8, height: 8, tint, transform: at(10, 10), parallax: { x: 0.5, y: 0.5 } });
            })();
        });
        expect(drawnAt(hud)).toEqual([10, 10]);
    });

    it('moves in whole pixels under pixelSnap', () => {
        let far!: TSprite;
        const { store } = createTestGame({ pixelSnap: 'game' });
        startTestScene(store, 'Level', () => {
            const camera = useCamera2d();
            camera.transform.x = 101;
            far = createSprite({ width: 8, height: 8, tint, transform: at(0, 0), parallax: { x: 0.5, y: 1 } });
            return createScene();
        });
        frame(store);
        expect(drawnAt(far)[0]).toBe(51);
    });

    it('moves between pixels when pixelSnap is off, as smooth as the camera', () => {
        let far!: TSprite;
        const { store } = createTestGame({ pixelSnap: 'off' });
        startTestScene(store, 'Level', () => {
            const camera = useCamera2d();
            camera.transform.x = 101;
            far = createSprite({ width: 8, height: 8, tint, transform: at(0, 0), parallax: { x: 0.5, y: 1 } });
            return createScene();
        });
        frame(store);
        expect(drawnAt(far)[0]).toBe(50.5);
    });

    it('only ever steps one way on screen while a camera moved by hand goes on, under pixelSnap', () => {
        let far!: TSprite;
        let camera!: ReturnType<typeof useCamera2d>;
        const { store } = createTestGame({ pixelSnap: 'game' });
        startTestScene(store, 'Level', () => {
            camera = useCamera2d();
            far = createSprite({ width: 8, height: 8, tint, transform: at(100, 0), parallax: { x: 0.1, y: 1 } });
            return createScene();
        });
        // Where it is on the screen: where it is drawn, less where the camera is drawn from.
        const onScreen: number[] = [];
        for (let i = 0; i < 200; i++) {
            camera.transform.x += 0.25;
            const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
            fillFrameContext(store, ctx);
            onScreen.push(drawnAt(far)[0]! - ctx.passes[0]!.cameras![0]!.transform.x);
        }
        // A tenth of the camera's 50 pixels, on whole pixels, and never a pixel back: rounding the
        // layer and the camera each on their own took turns and stepped it back and forth.
        for (let i = 1; i < onScreen.length; i++) expect(onScreen[i]!).toBeLessThanOrEqual(onScreen[i - 1]!);
        expect(onScreen.every(Number.isInteger)).toBe(true);
        expect(onScreen.at(-1)).toBe(95);
    });

    it('steps a screen pixel at a time on the screen\'s pixels, one way, with the camera zoomed in', () => {
        let far!: TSprite;
        let camera!: ReturnType<typeof useCamera2d>;
        const { store } = createTestGame({ pixelSnap: 'screen' });
        startTestScene(store, 'Level', () => {
            camera = useCamera2d({ zoom: 3 });
            far = createSprite({ width: 8, height: 8, tint, transform: at(100, 0), parallax: { x: 0.1, y: 1 } });
            return createScene();
        });
        // In screen pixels this time: where it is drawn less where the camera is drawn from, times 3.
        const onScreen: number[] = [];
        for (let i = 0; i < 200; i++) {
            camera.transform.x += 0.25;
            const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
            fillFrameContext(store, ctx);
            onScreen.push((drawnAt(far)[0]! - ctx.passes[0]!.cameras![0]!.transform.x) * 3);
        }
        // A tenth of the camera's 50 pixels, 15 screen pixels, one at a time and never one back: on the
        // game's pixels the same layer went three at once, five times.
        for (let i = 1; i < onScreen.length; i++) {
            const step = onScreen[i - 1]! - onScreen[i]!;
            expect(Math.abs(step) < 1e-6 || Math.abs(step - 1) < 1e-6).toBe(true);
        }
        expect(onScreen.at(-1)).toBeCloseTo(285, 6);
    });

    it('is measured against the scene\'s camera, not a tool\'s looking at it from elsewhere', () => {
        let far!: TSprite;
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            const camera = useCamera2d();
            camera.transform.x = 100;
            far = createSprite({ width: 8, height: 8, tint, transform: at(0, 0), parallax: { x: 0.5, y: 1 } });
            return createScene();
        });
        // An editor panned far away and zoomed out: the far layer is where the game draws it.
        store.setState('viewport', { camera2d: { type: 'camera-2d', id: 'tool', transform: { x: -2000, y: -1400, rotation: 0 }, zoom: 0.25 } });
        frame(store);
        expect(drawnAt(far)[0]).toBe(50);
    });

    it('is where the pointer touches it', () => {
        let far!: TSprite;
        const store = scene(() => {
            far = createSprite({ width: 20, height: 20, tint, transform: at(200, 100), parallax: { x: 0.5, y: 1 } });
        });
        // Drawn at 250 in the world, which with the camera at 100 is 150 on the screen.
        expect(pickTargets(store, 150, 60)).toContain(far);
        expect(pickTargets(store, 100, 60)).not.toContain(far);
    });
});

describe('a map layer\'s parallax', () => {
    let served: ReturnType<typeof serveTilemap> | null = null;
    afterEach(() => { served?.restore(); served = null; });

    it('is read from the file, moves the layer, and is written back', async () => {
        const doc = { ...TEST_MAP, layers: [{ name: 'hills', order: 'under', parallax: { x: 0.5, y: 1 }, data: [1, 2, 0, 3] }] };
        served = serveTilemap(doc);
        const { store } = createTestGame();
        let map!: TTilemap;
        const root = startTestScene(store, 'Level', () => {
            const camera = useCamera2d();
            camera.transform.x = 100;
            map = createTilemap({ src: '/maps/level.tilemap' });
            return createScene();
        });
        await whenLoaded(map);
        // The frame that finds the map ready is the one that starts drawing its layers.
        runHookUpdates(root, 1 / 60);
        frame(store);

        expect(map.layers[0].parallax).toEqual({ x: 0.5, y: 1 });
        expect(drawnAt(map.layers[0])).toEqual([50, 0]);
        const again = parseTilemapDoc(JSON.parse(serializeTilemapDoc(parseTilemapDoc(doc, 'a.tilemap'))), 'a.tilemap');
        expect(again.layers[0].parallax).toEqual({ x: 0.5, y: 1 });
    });

    it('is refused when it is not numbers', () => {
        const doc = { ...TEST_MAP, layers: [{ name: 'hills', order: 'under', parallax: { x: 'far' }, data: [1, 2, 0, 3] }] };
        expect(() => parseTilemapDoc(doc, 'a.tilemap')).toThrow(/layer 'hills' has to give its parallax/);
    });
});

describe('createBackdrop', () => {
    it('is one sprite, repeated far wider than any level, behind everything, with its parallax', () => {
        let backdrop!: TSprite;
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            backdrop = createBackdrop({ parallax: { x: 0.2, y: 0 }, y: 40, height: 32, tint });
            return createScene();
        });
        expect(backdrop.repeat).toBe(true);
        expect(backdrop.width).toBeGreaterThan(10000);
        expect(backdrop.height).toBe(32);
        expect(backdrop.parallax).toEqual({ x: 0.2, y: 0 });
        expect(backdrop.anchor).toEqual({ x: 0.5, y: 0 });
        expect(backdrop.transform.y).toBe(40);
        expect(backdrop.zIndex).toBeLessThan(0);
        void store;
    });

    it('fills everything when it repeats down too', () => {
        let sky!: TSprite;
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            sky = createBackdrop({ parallax: { x: 0, y: 0 }, repeatY: true, tint });
            return createScene();
        });
        expect(sky.height).toBeGreaterThan(10000);
        expect(sky.anchor).toEqual({ x: 0.5, y: 0.5 });
        void store;
    });
});

describe('parallax and blend on a text and a panel, as on a sprite', () => {
    // A font already loaded: the engine's own needs a browser to be read.
    const font = createTestFont();
    const panelPicture = { type: 'texture', key: 'panel', src: '/panel.png', width: 24, height: 24, status: 'ready', gpu: { resourceType: 'texture' } } as unknown as TTexture;

    /** A scene whose camera has moved 100 across and 40 down, drawn once; what reached the card. */
    const drawnWithCamera = (body: () => void): { store: TRuntimeStore; drawn: TDrawSprite[] } => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            const camera = useCamera2d();
            camera.transform.x = 100;
            camera.transform.y = 40;
            body();
            return createScene();
        });
        const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
        fillFrameContext(store, ctx);
        return { store, drawn: (ctx.passes[0].drawables ?? []) as TDrawSprite[] };
    };

    it('moves a text in the world half as much as the camera, its letters with it', () => {
        let far!: TText;
        let near!: TText;
        const { drawn } = drawnWithCamera(() => {
            far = createText({ text: 'A', font, transform: at(200, 100), parallax: { x: 0.5, y: 0.5 } });
            near = createText({ text: 'B', font, transform: at(200, 100) });
        });
        expect(drawnAt(far)).toEqual([250, 120]);
        // And so do its letters, which is what is seen: 50 across and 20 down from the other's.
        const [farLetter, nearLetter] = drawn;
        expect([farLetter!.transform.x - nearLetter!.transform.x, farLetter!.transform.y - nearLetter!.transform.y]).toEqual([50, 20]);
        // One that does not ask moves with the camera as before, and its placement is its own.
        expect(drawnAt(near)).toEqual([200, 100]);
        expect([far.transform.x, far.transform.y]).toEqual([200, 100]);
    });

    it('keeps a HUD text where it is on the screen, whatever its parallax says', () => {
        let score!: TText;
        let panel!: TNineSlice;
        drawnWithCamera(() => {
            useSpawn(function Hud() {
                useScreenSpace();
                score = createText({ text: 'ACE', font, transform: at(8, 8), parallax: { x: 0.5, y: 0.5 } });
                panel = createNineSlice({ texture: panelPicture, slice: 8, width: 40, height: 20, transform: at(8, 30), parallax: { x: 0, y: 0 } });
            })();
        });
        expect(drawnAt(score)).toEqual([8, 8]);
        expect(drawnAt(panel)).toEqual([8, 30]);
    });

    it('adds a glowing text and panel to what is behind, every letter and every piece', () => {
        const { drawn } = drawnWithCamera(() => {
            createText({ text: 'AB', font, blend: 'additive' });
            createNineSlice({ texture: panelPicture, slice: 8, width: 40, height: 20, blend: 'additive' });
            createText({ text: 'ABCDE', font });
        });
        const glowing = drawn.filter((piece) => piece.blend === 'additive');
        // Two letters and nine pieces; the plain text's five letters cover as before.
        expect(glowing).toHaveLength(2 + 9);
        expect(drawn.filter((piece) => piece.blend === undefined)).toHaveLength(5);
    });
});
