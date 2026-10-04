import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createNineSlice } from '../src/gameobjects/nine_slice/create_nine_slice';
import { sliceAxis } from '../src/gameobjects/nine_slice/expand_nine_slice';
import { createSpriteAtlas } from '../src/atlas';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { pickTargets } from '../src/input/pick_targets';
import { destroy, flushDestroyed } from '../src/destroy';
import { serializeScene } from '../src/scene/document/serialize_scene';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TFrameContext } from '../src/render';
import type { TDrawSprite } from '../src/render/interface';
import type { TNineSlice, TNineSliceOptions } from '../src/gameobjects/nine_slice';
import type { TSliceSpan } from '../src/gameobjects/nine_slice/expand_nine_slice';
import type { TTexture } from '../src/loaders';
import type { TRuntimeStore } from '../src/store';

const at = (x: number, y: number, rotation = 0, scale = 1) => ({ x, y, rotation, scaleX: scale, scaleY: scale });

/**
 * A loaded 24x24 picture: a panel with 8 px corners and 8 px of middle.
 */
const panelTexture = (width = 24, height = 24): TTexture => ({
    type: 'texture', key: 'panel', src: '/panel.png', width, height, status: 'ready', gpu: { resourceType: 'texture' },
} as unknown as TTexture);

const drawn = (store: TRuntimeStore): TDrawSprite[] => {
    const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
    fillFrameContext(store, ctx);
    return (ctx.passes[0].drawables ?? []) as TDrawSprite[];
};

/**
 * Spans as `[at, size, from, length]`, which reads better than objects in an expectation.
 */
const spans = (list: TSliceSpan[]): number[][] => list.map((span) => [span.at, span.size, span.from, span.length]);

const onePanel = (options: Partial<TNineSliceOptions> = {}) => {
    const { store } = createTestGame();
    const texture = panelTexture();
    let panel!: TNineSlice;
    startTestScene(store, 'Menu', () => {
        panel = createNineSlice({ texture, slice: 8, width: 100, height: 40, anchor: { x: 0, y: 0 }, transform: at(10, 20), ...options });
        return createScene();
    });
    return { store, texture, panel };
};

describe('sliceAxis', () => {
    it('keeps both borders as drawn and stretches what lies between', () => {
        expect(spans(sliceAxis(100, 24, 8, 8, 'stretch', []))).toEqual([[0, 8, 0, 8], [8, 84, 8, 8], [92, 8, 16, 8]]);
    });

    it('repeats the middle at its own size and cuts the last copy from the start', () => {
        // 30 px between the borders, 8 px of pattern: three whole copies and 6 px of a fourth.
        expect(spans(sliceAxis(46, 24, 8, 8, 'tile', []))).toEqual([
            [0, 8, 0, 8], [8, 8, 8, 8], [16, 8, 8, 8], [24, 8, 8, 8], [32, 6, 8, 6], [38, 8, 16, 8],
        ]);
    });

    it('repeats the middle a whole number of times, stretched to fit, when told to fit', () => {
        // 30 / 8 is closest to 4 copies, each 7.5 px wide and each the whole pattern.
        expect(spans(sliceAxis(46, 24, 8, 8, 'tile-fit', []))).toEqual([
            [0, 8, 0, 8], [8, 7.5, 8, 8], [15.5, 7.5, 8, 8], [23, 7.5, 8, 8], [30.5, 7.5, 8, 8], [38, 8, 16, 8],
        ]);
    });

    it('shrinks both borders in proportion when drawn smaller than they are, and leaves nothing between', () => {
        // 8 + 24 = 32 px of borders in 16 px: each is drawn at half.
        expect(spans(sliceAxis(16, 40, 8, 24, 'stretch', []))).toEqual([[0, 4, 0, 8], [4, 12, 16, 24]]);
    });

    it('narrows borders wider than the picture to fit it', () => {
        expect(spans(sliceAxis(100, 10, 10, 10, 'stretch', []))).toEqual([[0, 5, 0, 5], [5, 90, 5, 0], [95, 5, 5, 5]]);
    });

    it('stretches a middle with no texels to repeat, whatever the mode says', () => {
        expect(spans(sliceAxis(40, 16, 8, 8, 'tile', []))).toEqual([[0, 8, 0, 8], [8, 24, 8, 0], [32, 8, 8, 8]]);
    });

    it('leaves out a border of zero', () => {
        expect(spans(sliceAxis(50, 24, 0, 8, 'stretch', []))).toEqual([[0, 42, 0, 16], [42, 8, 16, 8]]);
    });
});

describe('createNineSlice', () => {
    it('refuses to be called outside a scene body', () => {
        expect(() => createNineSlice({ texture: panelTexture(), slice: 8, width: 32, height: 32 })).toThrow('[NacatamalOn] createNineSlice');
    });

    it('refuses to be made without a picture', () => {
        const { store } = createTestGame();
        expect(() => startTestScene(store, 'Menu', () => {
            createNineSlice({ slice: 8, width: 32, height: 32 });
            return createScene();
        })).toThrow('it needs a picture to cut');
    });

    it('is plain data, with the borders spelled out and stretching by default', () => {
        const { panel } = onePanel();

        expect(panel.type).toBe('nine-slice');
        expect(panel.slice).toEqual({ left: 8, top: 8, right: 8, bottom: 8 });
        expect(panel.mode).toBe('stretch');
        expect(Object.values(panel).some((value) => typeof value === 'function')).toBe(false);
    });

    it('reaches the renderer as nine sprites of one picture, the corners at the size they were drawn', () => {
        const { store, texture } = onePanel();
        const parts = drawn(store);

        expect(parts).toHaveLength(9);
        expect(parts.every((part) => part.type === 'sprite' && part.texture === texture)).toBe(true);
        expect(parts.map((part) => [part.transform.x, part.transform.y, part.width, part.height])).toEqual([
            [10, 20, 8, 8], [18, 20, 84, 8], [102, 20, 8, 8],
            [10, 28, 8, 24], [18, 28, 84, 24], [102, 28, 8, 24],
            [10, 52, 8, 8], [18, 52, 84, 8], [102, 52, 8, 8],
        ]);
        // The bottom-right corner reads the last 8 texels of the 24 both ways.
        expect(parts[8].uvOffset).toEqual({ x: 16 / 24, y: 16 / 24 });
        expect(parts[8].uvScale).toEqual({ x: 8 / 24, y: 8 / 24 });
    });

    it('shows a new size on the next frame, with the corners unchanged', () => {
        const { store, panel } = onePanel();

        panel.width = 200;
        const parts = drawn(store);
        expect(parts[1].width).toBe(184);
        expect(parts[2].transform.x).toBe(202);
        expect(parts[2].width).toBe(8);
    });

    it('is placed by its middle unless told otherwise, and turned and scaled as one', () => {
        const { store } = onePanel({ anchor: undefined, transform: at(100, 100, Math.PI / 2, 2) });
        const first = drawn(store)[0];

        // The top-left corner is 50 left and 20 up of the middle, doubled and turned a quarter.
        expect(first.transform.x).toBeCloseTo(140, 10);
        expect(first.transform.y).toBeCloseTo(0, 10);
        expect(first.transform.rotation).toBeCloseTo(Math.PI / 2, 10);
        expect(first.transform.scaleX).toBe(2);
    });

    it('repeats one way and stretches the other when told so', () => {
        const { store } = onePanel({ width: 40, mode: { x: 'tile', y: 'stretch' } });

        // 24 px between the side borders: three copies across, one stretched middle down.
        expect(drawn(store)).toHaveLength(5 * 3);
    });

    it('cuts from the frame of a sheet it was given', () => {
        const { store } = createTestGame();
        const atlas = createSpriteAtlas({ texture: panelTexture(48, 24), columns: 2, rows: 1 });
        startTestScene(store, 'Menu', () => {
            createNineSlice({ atlas, frame: 1, slice: 8, width: 100, height: 40 });
            return createScene();
        });

        const parts = drawn(store);
        expect(parts[0].uvOffset).toEqual({ x: 0.5, y: 0 });
        expect(parts[0].uvScale).toEqual({ x: 8 / 48, y: 8 / 24 });
        expect(parts[8].uvOffset).toEqual({ x: 0.5 + 16 / 48, y: 16 / 24 });
    });

    it('draws nothing until its picture has loaded', () => {
        const { store, texture } = onePanel();
        (texture as { status: string }).status = 'loading';

        expect(drawn(store)).toHaveLength(0);
    });

    it('is touched anywhere inside its rectangle, once, as itself', () => {
        const { store, panel } = onePanel();

        expect(pickTargets(store, 60, 40)).toEqual([panel]);
        expect(pickTargets(store, 11, 21)).toEqual([panel]);
        expect(pickTargets(store, 111, 40)).toEqual([]);
    });

    it('moves with a box above it', () => {
        const { store } = createTestGame();
        const texture = panelTexture();
        startTestScene(store, 'Menu', () => {
            useSpawn(() => {
                useTransform({ x: 50, y: 60 });
                createNineSlice({ texture, slice: 8, width: 24, height: 24, anchor: { x: 0, y: 0 } });
            })();
            return createScene();
        });

        expect(drawn(store)[0].transform).toMatchObject({ x: 50, y: 60 });
    });

    it('goes away when destroyed, and is left out of a saved scene', () => {
        const { store, panel } = onePanel();
        const scene = store.get('world').scenes[0];

        expect(serializeScene(scene).root.components ?? []).toEqual([]);

        destroy(panel);
        flushDestroyed(store);
        expect(drawn(store)).toHaveLength(0);
    });
});
