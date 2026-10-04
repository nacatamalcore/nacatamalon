import { openLayerState } from '../src/gameobjects/tilemap/layer_state';
import { afterEach, describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createText } from '../src/gameobjects/text/create_text';
import { createTilemap } from '../src/gameobjects/tilemap/create_tilemap';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useSelf } from '../src/hooks/spawn/use_self';
import { useUpdate } from '../src/hooks/loop';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { runHookUpdates } from '../src/game/loop/runHookUpdates';
import { whenLoaded } from '../src/loaders';
import { createTestGame, startTestScene } from './helpers/test_game';
import { createTestFont } from './helpers/test_font';
import { serveTilemap } from './helpers/test_tilemap';
import type { TFrameContext } from '../src/render';
import type { TRuntimeStore } from '../src/store';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';
import type { TTilemap } from '../src/gameobjects/tilemap';

/**
 * Hiding: the difference between a thing that is not drawn and a thing that is not there.
 *
 * What is checked here is only what reaches the renderer, because that is the whole of what
 * `visible` means. Everything else about a hidden object has to be **unchanged**, and the last two
 * tests are the ones that say so: it still runs, and it still owns what it owned.
 */

const tint = { r: 1, g: 1, b: 1, a: 1 };
const at = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };

/**
 * A sprite named by its width, so what is drawn reads as a list of numbers.
 */
const card = (width: number, visible?: boolean): TSprite =>
    createSprite({ width, height: 1, tint, transform: { ...at }, visible });

/**
 * What the renderer would be handed this frame.
 */
const drawn = (store: TRuntimeStore) => {
    const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
    fillFrameContext(store, ctx);
    return ctx.passes[0].drawables ?? [];
};

/**
 * The same, as the widths of the sprites in it.
 */
const widths = (store: TRuntimeStore): number[] =>
    drawn(store).map((drawable) => (drawable.type === 'sprite' ? drawable.width ?? -1 : -1));

let served: ReturnType<typeof serveTilemap> | null = null;

afterEach(() => {
    served?.restore();
    served = null;
});

describe('a drawable that is not drawn', () => {
    it('leaves out the hidden one and nothing else', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            card(1); card(2, false); card(3);
            return createScene();
        });

        expect(widths(store)).toEqual([1, 3]);
    });

    it('counts a sprite that says nothing as drawn', () => {
        const { store } = createTestGame();
        let plain!: TSprite;
        startTestScene(store, 'Level', () => {
            plain = card(1);
            return createScene();
        });

        // Nothing written on the record, and drawn all the same: the ordinary case says nothing.
        // The renderer is never told either, which is why `TDrawSprite` has no such field.
        expect(plain.visible).toBeUndefined();
        expect(widths(store)).toEqual([1]);
    });

    it('follows a change made between two frames, both ways', () => {
        const { store } = createTestGame();
        let hidden!: TSprite;
        startTestScene(store, 'Level', () => {
            card(1);
            hidden = card(2, false);
            return createScene();
        });

        expect(widths(store)).toEqual([1]);

        hidden.visible = true;
        expect(widths(store)).toEqual([1, 2]);

        hidden.visible = false;
        expect(widths(store)).toEqual([1]);
    });

    it('does not expand the characters of a hidden text', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            const font = createTestFont();
            createText({ text: 'ABC', font, transform: { ...at } });
            createText({ text: 'DE', font, transform: { ...at }, visible: false });
            return createScene();
        });

        // Three characters from the first text and not one from the second: a hidden text is not a
        // text drawn in nothing, it never becomes sprites at all.
        expect(drawn(store)).toHaveLength(3);
    });

    it('keeps a hidden layer out of the frame and keeps its corners', async () => {
        served = serveTilemap();
        const { store, renderer } = createTestGame();
        let map!: TTilemap;
        const scene = startTestScene(store, 'Level', () => {
            map = createTilemap({ src: '/maps/level.tilemap' });
            return createScene();
        });
        await whenLoaded(map);
        runHookUpdates(scene, 1 / 60);

        expect(drawn(store)).toHaveLength(2);
        const alive = renderer.buffers.filter((buffer) => buffer.alive).length;

        map.layers[1].visible = false;

        expect(drawn(store)).toHaveLength(1);
        // What reaches a backend is the layer's stand-in, not the layer: its corners live beside
        // the record so the record itself stays writable to a file.
        expect(drawn(store)[0]).toBe(openLayerState(map.layers[0]).drawn);
        // Hiding is not destroying: showing it again has to cost nothing, so what it put on the
        // graphics card is still there. Letting go of it is what destroying the map does.
        expect(renderer.buffers.filter((buffer) => buffer.alive)).toHaveLength(alive);
    });
});

describe('a box that is not drawn', () => {
    it('takes everything under it', () => {
        const { store } = createTestGame();
        const Turret = () => {
            const self = useSelf();
            self.visible = false;
            card(2);
            useSpawn(() => { card(3); })();
        };
        startTestScene(store, 'Level', () => {
            card(1);
            useSpawn(Turret)();
            card(4);
            return createScene();
        });

        expect(widths(store)).toEqual([1, 4]);
    });

    it('can be hidden from outside, by whoever made it', () => {
        const { store } = createTestGame();
        const Coin = () => { card(9); };
        let coin!: ReturnType<ReturnType<typeof useSpawn>>;
        startTestScene(store, 'Level', () => {
            card(1);
            coin = useSpawn(Coin)();
            return createScene();
        });

        expect(widths(store)).toEqual([1, 9]);

        coin.visible = false;
        expect(widths(store)).toEqual([1]);
    });

    it('hides a whole scene when its root is hidden', () => {
        const { store } = createTestGame();
        const level = startTestScene(store, 'Level', () => { card(1); return createScene(); });
        startTestScene(store, 'Hud', () => { card(2); return createScene(); });

        expect(widths(store)).toEqual([1, 2]);

        level.visible = false;
        expect(widths(store)).toEqual([2]);
    });

    it('goes on running while it cannot be seen', () => {
        const { store } = createTestGame();
        let frames = 0;
        const Ghost = () => {
            useSelf().visible = false;
            card(2);
            useUpdate(() => { frames += 1; });
        };
        const scene = startTestScene(store, 'Level', () => {
            useSpawn(Ghost)();
            return createScene();
        });

        runHookUpdates(scene, 1 / 60);
        runHookUpdates(scene, 1 / 60);

        // Hiding is not disabling. Something that has to stop as well as disappear has to be told
        // to stop, and this is the line that says so.
        expect(frames).toBe(2);
        expect(widths(store)).toEqual([]);
    });
});
