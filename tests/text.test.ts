import { describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createText } from '../src/gameobjects/text/create_text';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useCamera2d } from '../src/hooks/camera/use_camera_2d';
import { useScreenSpace } from '../src/hooks/camera/use_screen_space';
import { useLoadFont } from '../src/hooks/loaders/use_load_font';
import { useLoader } from '../src/hooks/loaders/use_loader';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { pickTargets } from '../src/input/pick_targets';
import { destroy, flushDestroyed } from '../src/destroy';
import { createTestGame, startTestScene } from './helpers/test_game';
import { createTestFont } from './helpers/test_font';
import type { TFrameContext, TRenderPass } from '../src/render';
import type { TDrawSprite } from '../src/render/interface';
import type { TText, TTextOptions } from '../src/gameobjects/text';
import type { TRuntimeStore } from '../src/store';

const at = (x: number, y: number, rotation = 0) => ({ x, y, rotation, scaleX: 1, scaleY: 1 });

const frame = (store: TRuntimeStore): TRenderPass => {
    const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
    fillFrameContext(store, ctx);
    return ctx.passes[0];
};

// A text becomes sprites, so everything drawn in these scenes is one.
const drawn = (store: TRuntimeStore): TDrawSprite[] =>
    (frame(store).drawables ?? []).filter((drawable): drawable is TDrawSprite => drawable.type === 'sprite');

/**
 * A scene with one text in it, and the text.
 */
const oneText = (options: Partial<TTextOptions> = {}) => {
    const { store } = createTestGame();
    const font = createTestFont();
    let text!: TText;
    startTestScene(store, 'Level', () => {
        text = createText({ text: 'ABC', font, transform: at(100, 50), ...options });
        return createScene();
    });
    return { store, font, text };
};

describe('createText', () => {
    it('refuses to be called outside a scene body', () => {
        expect(() => createText({ text: 'A', font: createTestFont() })).toThrow('[NacatamalOn] createText');
    });

    it('is plain data', () => {
        const { text } = oneText();

        expect(Object.values(text).some((value) => typeof value === 'function')).toBe(false);
        expect(() => JSON.stringify(text)).not.toThrow();
    });

    it('reaches the renderer as one sprite per character, cut from the font image', () => {
        const { store, font } = oneText();
        const sprites = drawn(store);

        expect(sprites).toHaveLength(3);
        expect(sprites.every((sprite) => sprite.texture === font.texture)).toBe(true);
        expect(sprites.map((sprite) => sprite.transform.x)).toEqual([100, 109, 118]);
        // C sits at x 16 of a 64 px image, 8 px wide and the full 8 of its 16 px height.
        expect(sprites[2].uvOffset).toEqual({ x: 16 / 64, y: 0 });
        expect(sprites[2].uvScale).toEqual({ x: 8 / 64, y: 8 / 16 });
    });

    it('shows a change of text or size on the next frame', () => {
        const { store, text } = oneText();

        text.text = 'ABCDE';
        expect(drawn(store)).toHaveLength(5);

        text.style.fontSize = 16;
        expect(drawn(store)[1].transform.x).toBe(118);
        expect(drawn(store)[1].width).toBe(16);
    });

    it('places the block by its anchor', () => {
        // 'ABC' is 26 wide and 8 tall: centred on x 100, it starts 13 to the left.
        const { store } = oneText({ anchor: { x: 0.5, y: 1 } });
        const first = drawn(store)[0];

        expect(first.transform.x).toBe(87);
        expect(first.transform.y).toBe(42);
    });

    it('turns the whole block around its anchor', () => {
        const { store } = oneText({ transform: at(100, 50, Math.PI / 2) });
        const sprites = drawn(store);

        // A quarter turn stands the line up: each character is 9 px below the one before.
        expect(sprites.map((sprite) => Math.round(sprite.transform.x))).toEqual([100, 100, 100]);
        expect(sprites.map((sprite) => Math.round(sprite.transform.y))).toEqual([50, 59, 68]);
        expect(sprites[1].transform.rotation).toBeCloseTo(Math.PI / 2, 10);
    });

    it('sorts by zIndex as one block among sprites', () => {
        const { store } = createTestGame();
        const font = createTestFont();
        const tint = { r: 1, g: 1, b: 1, a: 1 };
        startTestScene(store, 'Level', () => {
            createText({ text: 'AB', font, zIndex: 5 });
            createSprite({ width: 1, height: 1, tint, transform: at(0, 0) });
            return createScene();
        });

        const sprites = drawn(store);
        expect(sprites[0].texture).toBeNull();
        expect(sprites.slice(1).every((sprite) => sprite.texture !== null)).toBe(true);
    });

    it('hands every character the camera of its text, screen space included', () => {
        const { store } = createTestGame();
        const font = createTestFont();
        const Hud = () => { useScreenSpace(); createText({ text: 'AB', font }); };
        startTestScene(store, 'Level', () => {
            useCamera2d();
            createText({ text: 'ABC', font });
            useSpawn(Hud)();
            return createScene();
        });

        expect(frame(store).cameraIndex).toEqual([0, 0, 0, -1, -1]);
    });

    it('shares a style by reference: changing it changes every text that uses it', () => {
        const { store } = createTestGame();
        const font = createTestFont();
        const heading = { fontSize: 8 };
        startTestScene(store, 'Level', () => {
            createText({ text: 'A', font, style: heading });
            createText({ text: 'A', font, style: heading });
            return createScene();
        });

        heading.fontSize = 16;
        expect(drawn(store).map((sprite) => sprite.width)).toEqual([16, 16]);
    });

    it('warns once when the size is not a multiple of the font height', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        warn.mockClear();
        const { store } = oneText({ style: { fontSize: 20 } });

        drawn(store);
        drawn(store);

        const mentions = warn.mock.calls.filter((call) => String(call[0]).includes('fontSize 20'));
        expect(mentions).toHaveLength(1);
        expect(String(mentions[0][0])).toContain('16 or 24');
        warn.mockRestore();
    });

    it('is removed by destroy', () => {
        const { store, text } = oneText();

        destroy(text);
        flushDestroyed(store);

        expect(drawn(store)).toHaveLength(0);
    });

    it('is picked as the text, never as its characters', () => {
        const { store, text } = oneText();

        expect(pickTargets(store, 102, 52)).toEqual([text]);
    });

    it('counts its font as something to load', () => {
        const { store } = createTestGame();
        const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((() => new Promise(() => {})) as unknown as typeof fetch);
        let fontsCounted = 0;

        startTestScene(store, 'Level', () => {
            const font = useLoadFont({ json: '/f.json', atlas: '/f.png' });
            // The same font asked twice is loaded once and listed once.
            useLoadFont({ json: '/f.json', atlas: '/f.png' });
            fontsCounted = useLoader([font]).total;
            return createScene();
        });

        expect(fontsCounted).toBe(1);
        expect(store.get('assets').fonts.size).toBe(1);
        fetchSpy.mockRestore();
    });
});
