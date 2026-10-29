import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createText } from '../src/gameobjects/text/create_text';
import { createNineSlice } from '../src/gameobjects/nine_slice/create_nine_slice';
import { createMesh } from '../src/gameobjects/mesh/create_mesh';
import { createSpriteTexture } from '../src/gameobjects/sprite_texture/create_sprite_texture';
import { useCubeGeometry } from '../src/hooks/geometry/use_cube_geometry';
import { useCamera2d } from '../src/hooks/camera/use_camera_2d';
import { useScreenSpace } from '../src/hooks/camera/use_screen_space';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { inSight } from '../src/game/loop/helper/collect_drawables';
import { textBlockSize } from '../src/gameobjects/text/expand_text';
import { sightOf } from '../src/render/shared/sight_2d';
import { createTestFont } from './helpers/test_font';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TFrameContext, TRenderPass } from '../src/render';
import type { TRuntimeStore } from '../src/store';
import type { TTexture } from '../src/loaders';

/**
 * A flat drawable wholly outside what its camera shows is left out of the frame: not sorted, not laid
 * out, not written for the card. The test canvas is 320 by 224.
 */

const at = (x: number, y: number, rotation = 0) => ({ x, y, rotation, scaleX: 1, scaleY: 1 });

const frame = (store: TRuntimeStore): TFrameContext => {
    const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
    fillFrameContext(store, ctx);
    return ctx;
};
const screenOf = (ctx: TFrameContext): TRenderPass => ctx.passes[ctx.passes.length - 1]!;

/** The widths of the sprites the screen draws, which is how each one is named here. */
const drawnWidths = (store: TRuntimeStore): number[] =>
    (screenOf(frame(store)).drawables ?? []).map((d) => (d.type === 'sprite' ? d.width ?? -1 : -1));

const scene = (body: () => void): TRuntimeStore => {
    const { store } = createTestGame();
    startTestScene(store, 'Level', () => {
        body();
        return createScene();
    });
    return store;
};

describe('what a 2D camera shows', () => {
    it('is the screen with no camera, one pixel more all round', () => {
        expect(sightOf(null, 320, 224)).toEqual({ minX: -1, minY: -1, maxX: 321, maxY: 225 });
    });

    it('is the world under the screen through a camera that moved and zoomed', () => {
        const camera = { transform: { x: 100, y: 40, rotation: 0 }, zoom: 2 };
        expect(sightOf(camera, 320, 224)).toEqual({ minX: 99.5, minY: 39.5, maxX: 260.5, maxY: 152.5 });
    });

    it('is the rectangle around it for a turned camera', () => {
        const sight = sightOf({ transform: { x: 0, y: 0, rotation: Math.PI / 2 }, zoom: 1 }, 320, 224);
        // A quarter turn: what spread across now spreads down, to the left of where the camera is.
        expect(sight.minX).toBeCloseTo(-225);
        expect(sight.maxX).toBeCloseTo(1);
        expect(sight.minY).toBeCloseTo(-1);
        expect(sight.maxY).toBeCloseTo(321);
    });
});

describe('a flat drawable outside what its camera shows', () => {
    it('is left out, and kept the moment a single pixel of it is in', () => {
        const store = scene(() => {
            createSprite({ width: 1, height: 10, transform: at(100, 100) });
            createSprite({ width: 2, height: 10, transform: at(-30, 100) });
            // 20 wide held by its middle at -9: its right edge is at 1, inside the pixel of margin.
            createSprite({ width: 20, height: 10, transform: at(-9, 100) });
            createSprite({ width: 4, height: 10, transform: at(400, 100) });
        });
        expect(drawnWidths(store)).toEqual([1, 20]);
    });

    it('is judged through its camera, as it moves', () => {
        let camera!: ReturnType<typeof useCamera2d>;
        const store = scene(() => {
            camera = useCamera2d();
            createSprite({ width: 1, height: 10, transform: at(100, 100) });
            createSprite({ width: 2, height: 10, transform: at(1000, 100) });
        });
        expect(drawnWidths(store)).toEqual([1]);
        camera.transform.x = 900;
        expect(drawnWidths(store)).toEqual([2]);
        // Zoomed out, it sees both.
        camera.transform.x = 0;
        camera.zoom = 0.25;
        expect(drawnWidths(store)).toEqual([1, 2]);
    });

    it('is placed as it is drawn: by its anchor, about its pivot, turned and grown', () => {
        const store = scene(() => {
            // A bar 200 long held by its left end, off the left edge: it reaches 50 into the screen.
            // The same bar turned half round reaches the other way, further out.
            createSprite({ width: 200, height: 4, anchor: { x: 0, y: 0.5 }, transform: at(-150, 100) });
            createSprite({ width: 201, height: 4, anchor: { x: 0, y: 0.5 }, transform: at(-150, 100, Math.PI) });
            // Grown five times, a small one off the edge reaches in.
            createSprite({ width: 10, height: 4, transform: { ...at(-20, 100), scaleX: 5, scaleY: 1 } });
            // Held by its middle, turned about its left end: a quarter turn swings it down off the bottom.
            createSprite({ width: 60, height: 4, pivot: { x: 0, y: 0.5 }, transform: at(100, 250, Math.PI / 2) });
        });
        expect(drawnWidths(store)).toEqual([200, 10]);
    });

    it('pinned to the screen, is judged by the screen however far the camera went', () => {
        const store = scene(() => {
            const camera = useCamera2d();
            camera.transform.x = 5000;
            useSpawn(function Hud() {
                useScreenSpace();
                createSprite({ width: 3, height: 3, transform: at(10, 10) });
                createSprite({ width: 5, height: 5, transform: at(-50, 10) });
            })();
        });
        expect(drawnWidths(store)).toEqual([3]);
    });

    it('far behind, is judged where its parallax draws it, not where it says it is', () => {
        const store = scene(() => {
            const camera = useCamera2d();
            camera.transform.x = 1000;
            // A far layer at a tenth of the camera: drawn 900 to the right of where it is.
            createSprite({ width: 7, height: 10, transform: at(200, 100), parallax: { x: 0.1, y: 0.1 } });
            createSprite({ width: 8, height: 10, transform: at(200, 100) });
        });
        expect(drawnWidths(store)).toEqual([7]);
    });

    it('as a text, is measured as it is laid out this frame, and as a panel by its size', () => {
        const font = createTestFont();
        const panel = { type: 'texture', key: 'panel', src: '/panel.png', width: 24, height: 24, status: 'ready', gpu: { resourceType: 'texture' } } as unknown as TTexture;
        let label!: ReturnType<typeof createText>;
        const store = scene(() => {
            label = createText({ text: 'A', font, transform: at(-40, 100) });
            createNineSlice({ texture: panel, slice: 8, width: 40, height: 20, transform: at(-30, 100) });
            createNineSlice({ texture: panel, slice: 8, width: 40, height: 20, transform: at(-15, 100) });
        });
        const kinds = () => (screenOf(frame(store)).drawables ?? []).length;
        // The far panel is out, the near one reaches in (nine pieces), the short text is out.
        expect(kinds()).toBe(9);
        // Longer this frame, it reaches in: its letters are drawn.
        label.text = 'AAAAAAAAAAAAAAAAAAAA';
        expect(kinds()).toBeGreaterThan(9);
    });

    it('as a text left out, still knows how big it is, for its hitbox and the pointer', () => {
        const font = createTestFont();
        let far!: ReturnType<typeof createText>;
        let near!: ReturnType<typeof createText>;
        const store = scene(() => {
            near = createText({ text: 'ABC', font, transform: at(10, 10) });
            far = createText({ text: 'ABC', font, transform: at(2000, 10) });
        });
        frame(store);
        expect(textBlockSize(far)).toEqual(textBlockSize(near));
        expect(textBlockSize(far).width).toBeGreaterThan(0);
        // Changed while out of sight: its size follows.
        far.text = 'ABCABC';
        frame(store);
        expect(textBlockSize(far).width).toBeGreaterThan(textBlockSize(near).width);
    });

    it('in a picture, is judged by the picture\'s own size', () => {
        let picture!: TTexture;
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            picture = createSpriteTexture({ width: 32, height: 32 }, () => {
                createSprite({ width: 1, height: 1, transform: at(16, 16) });
                createSprite({ width: 2, height: 2, transform: at(100, 16) });
            });
            return createScene();
        });
        const pass = frame(store).passes.find((p) => p.renderTarget === picture.gpu)!;
        expect((pass.drawables ?? []).map((d) => (d.type === 'sprite' ? d.width : -1))).toEqual([1]);
    });

    it('leaves alone what is not a sprite, a text or a panel', () => {
        const store = scene(() => {
            createMesh({ geometry: useCubeGeometry(), transform: { x: 5000 } });
        });
        expect((screenOf(frame(store)).drawables ?? []).map((d) => d.type)).toEqual(['mesh']);
    });

    it('is the same answer the frame gives, for a drawable asked on its own', () => {
        const sight = sightOf(null, 320, 224);
        const sprite = { type: 'sprite', width: 10, height: 10, transform: at(-20, 50), visible: true } as unknown as Parameters<typeof inSight>[0];
        expect(inSight(sprite, sight)).toBe(false);
        (sprite as { transform: { x: number } }).transform.x = 0;
        expect(inSight(sprite, sight)).toBe(true);
    });
});
