import { beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createMesh } from '../src/gameobjects/mesh/create_mesh';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useSelf } from '../src/hooks/spawn/use_self';
import { useTransform } from '../src/hooks/transform/use_transform';
import { useMask } from '../src/hooks/mask/use_mask';
import { useFilter } from '../src/hooks/filter/use_filter';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { pickTargets } from '../src/input/pick_targets';
import { destroy } from '../src/destroy/destroy';
import { flushDestroyed } from '../src/destroy/flush_destroyed';
import { anyFilters } from '../src/filter/create_filter';
import { emptySpan, regionOf } from '../src/filter/filter_region';
import { applyMasks } from '../src/mask/apply_masks';
import { blur, crt, dither, dropShadow, glow, outline } from '../src/post';
import { createTestGame, startTestScene, takeDownTestGames } from './helpers/test_game';
import { parseSceneDoc, sceneFromDoc, serializeScene } from '../src/scene/document';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { buildPostShader } from '../src/render/webgpu/post/post_shader';
import { buildPostShaderGlsl } from '../src/render/webgl2/post/post_shader';
import type { TFrameContext, TRenderPass } from '../src/render';
import type { TDrawItem } from '../src/render/interface';
import type { TGameObject } from '../src/hooks/spawn/use_spawn';
import type { TFilter } from '../src/filter';
import type { TRuntimeStore } from '../src/store';

/**
 * Filters: effects run over what one object, and everything under it, draws. What reaches a backend
 * is checked here: a pass before the screen's drawing what is filtered, with its part and its chain,
 * and one entry in the screen's pass laying the result where the object was sorted.
 */

// How many objects are filtered is counted for every game at once: each test sees its own game alone.
beforeEach(takeDownTestGames);

const frame = (store: TRuntimeStore): TFrameContext => {
    const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
    fillFrameContext(store, ctx);
    return ctx;
};
const screenOf = (ctx: TFrameContext): TRenderPass => ctx.passes[ctx.passes.length - 1]!;
const kinds = (pass: TRenderPass): string[] => (pass.drawables ?? []).map((item) => item.type);
const layersOf = (pass: TRenderPass) => (pass.drawables ?? []).filter((item): item is Extract<TDrawItem, { type: 'filter-layer' }> => item.type === 'filter-layer');

const block = (x: number, y: number) => ({ x, y, rotation: 0, scaleX: 1, scaleY: 1 });

/** A box at a place, drawing one 10 × 10 square in its middle, with the box itself given back. */
const square = (x: number, y: number, zIndex?: number) => useSpawn(() => {
    useTransform(block(x, y));
    createSprite({ width: 10, height: 10, ...(zIndex !== undefined ? { zIndex } : {}) });
})();

describe('a filter', () => {
    it('filters nothing until it is added, and a game without one keeps no list for it', () => {
        const { store } = createTestGame();
        let filter!: TFilter;
        let box!: TGameObject;
        startTestScene(store, 'Level', () => {
            box = square(50, 50);
            filter = useFilter({ effects: [outline()] });
            return createScene();
        });
        expect(anyFilters()).toBe(false);
        const before = frame(store);
        expect(before.passes).toHaveLength(1);
        expect(screenOf(before).stencil).toBeUndefined();

        filter.add(box);
        expect(box.filter).toBe(filter);
        expect(filter.has(box)).toBe(true);
        expect(frame(store).passes).toHaveLength(2);

        filter.remove(box);
        expect(box.filter).toBeNull();
        expect(anyFilters()).toBe(false);
        expect(frame(store).passes).toHaveLength(1);
    });

    it('draws what it filters in a pass of its own and lays the result where the object was sorted', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            createSprite({ width: 4, height: 4 });
            useFilter({ effects: [outline({ thickness: 1 })] }).add(square(50, 50));
            createSprite({ width: 4, height: 4, transform: block(5, 5) });
            return createScene();
        });
        const ctx = frame(store);
        expect(ctx.passes).toHaveLength(2);
        const [content, screen] = ctx.passes as [TRenderPass, TRenderPass];
        expect(content.renderTarget).toBeDefined();
        expect(content.clearColor).toEqual({ r: 0, g: 0, b: 0, a: 0 });
        expect(content.postProcess).toBe(false);
        expect(kinds(content)).toEqual(['sprite']);
        expect(content.filter!.chain.map((effect) => effect.name)).toEqual(['outline']);
        expect(kinds(screen)).toEqual(['sprite', 'sprite', 'filter-layer']);
        const [layer] = layersOf(screen);
        expect(layer!.picture).toBe(content.filter!.into);
        // The square covers 45 to 55, with a pixel of room for the line: 44 to 56, grown to a step of
        // 16 about its middle.
        expect({ x: layer!.x, y: layer!.y, width: layer!.width, height: layer!.height }).toEqual({ x: 42, y: 42, width: 16, height: 16 });
        expect(content.filter!.region).toEqual({ x: 42, y: 42, width: 16, height: 16 });
    });

    it('keeps to its own part, with no room around it, when given a rect', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            useFilter({ effects: [crt()], rect: { x: -20, y: -10, width: 40, height: 30 } }).add(square(100, 60));
            return createScene();
        });
        expect(layersOf(screenOf(frame(store)))[0]).toMatchObject({ x: 80, y: 50, width: 40, height: 30 });
    });

    it('takes the room its effects ask for, or what it was told', () => {
        const { store } = createTestGame();
        let filter!: TFilter;
        startTestScene(store, 'Level', () => {
            filter = useFilter({ effects: [glow({ radius: 20 }), dropShadow({ offset: { x: 3, y: 0 }, radius: 1 })] });
            filter.add(square(100, 100));
            return createScene();
        });
        // A glow of 20 is the most of the two: 10 of square and 20 of room on each side, 50 in all,
        // grown to 64.
        expect(layersOf(screenOf(frame(store)))[0]!.width).toBe(64);
        filter.padding = 0;
        expect(layersOf(screenOf(frame(store)))[0]!.width).toBe(16);
    });

    it('keeps its size across the edge of what is drawn on, and draws nothing when none of it is there', () => {
        const { store } = createTestGame();
        let box!: TGameObject;
        startTestScene(store, 'Level', () => {
            box = square(2, 2);
            useFilter({ effects: [outline()] }).add(box);
            return createScene();
        });
        // -3 to 7 with a pixel of room, -4 to 8, grown to 16 about its middle, and cut where the room
        // past the edge ends, still 16: the same size it is anywhere else, so its pictures are not
        // made again as it crosses.
        expect(layersOf(screenOf(frame(store)))[0]).toMatchObject({ x: -1, y: -1, width: 16, height: 16 });
        box.transform!.x = -500;
        const ctx = frame(store);
        expect(layersOf(screenOf(ctx))).toHaveLength(0);
        // And it sets out no pass for what it would have drawn.
        expect(ctx.passes).toHaveLength(1);
    });

    it('takes back what it set out to draw inside it when it turns out to be off the screen', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            // What it filters is on the screen, with a soft mask inside, and the part it works on is
            // not: nothing of it would be seen.
            const tv = useSpawn(() => {
                useTransform(block(100, 100));
                const inner = square(0, 0);
                useMask({ by: square(0, 0), soft: true }).add(inner);
            })();
            useFilter({ effects: [crt()], rect: { x: -1000, y: 0, width: 10, height: 10 } }).add(tv);
            return createScene();
        });
        const ctx = frame(store);
        expect(ctx.passes).toHaveLength(1);
        expect(kinds(screenOf(ctx))).toEqual([]);
    });

    it('asks for no picture larger than what is drawn on and the room around it, however large the object', () => {
        const target = { width: 320, height: 240, pixelRatio: 2 };
        const span = emptySpan();
        span.left = -5000;
        span.right = 5000;
        span.top = 100;
        span.bottom = 110;
        const region = regionOf(span, 4, false, target)!;
        expect(region.x).toBe(-8);
        expect(region.width).toBe(320 + 16);
        // Hanging off one side only, its size grows by steps from the edge it is cut at.
        span.left = -5000;
        span.right = 50;
        const left = regionOf(span, 4, false, target)!;
        expect(left.x).toBe(-8);
        expect(left.width % 16).toBe(0);
        expect(left.x + left.width).toBeGreaterThanOrEqual(108);
        // A rect larger than a picture can be is cut to what is drawn on.
        const huge = emptySpan();
        huge.left = -4000;
        huge.right = 4000;
        huge.top = 0;
        huge.bottom = 10;
        expect(regionOf(huge, 0, true, target)).toEqual({ x: 0, y: 0, width: 320, height: 20 });
    });

    it('is nothing when it is off what is drawn on, room and all, and something when only its room is on', () => {
        const target = { width: 320, height: 240, pixelRatio: 1 };
        const at = (left: number, right: number) => {
            const span = emptySpan();
            span.left = left;
            span.right = right;
            span.top = 100;
            span.bottom = 110;
            return span;
        };
        expect(regionOf(at(-100, -50), 0, false, target)).toBeNull();
        expect(regionOf(at(-100, -30), 5, false, target)).toBeNull();
        expect(regionOf(at(-20, -1), 0, false, target)).toBeNull();
        expect(regionOf(at(400, 450), 0, false, target)).toBeNull();
        expect(regionOf(at(-503, -497), 1, false, target)).toBeNull();
        // Just off the left, with a glow reaching onto the screen: its glow is seen.
        expect(regionOf(at(-20, -2), 6, false, target)).not.toBeNull();
    });

    it('stays a number for an object as large as a number can be, and for room that is none', () => {
        const target = { width: 320, height: 240, pixelRatio: 2 };
        const span = emptySpan();
        span.left = -1e308;
        span.right = 1e308;
        span.top = 0;
        span.bottom = 10;
        const region = regionOf(span, 4, false, target)!;
        expect([region.x, region.y, region.width, region.height].every(Number.isFinite)).toBe(true);
        const { store } = createTestGame();
        let filter!: TFilter;
        startTestScene(store, 'Level', () => {
            filter = useFilter({ effects: [outline()], padding: Number.NaN });
            filter.add(square(50, 50));
            return createScene();
        });
        const layer = layersOf(screenOf(frame(store)))[0]!;
        expect([layer.x, layer.y, layer.width, layer.height].every(Number.isFinite)).toBe(true);
    });

    it('takes in every pixel it touches, however it falls between them', () => {
        const target = { width: 320, height: 240, pixelRatio: 1 };
        const span = emptySpan();
        span.left = 84.7;
        span.right = 116.7;
        span.top = 10.7;
        span.bottom = 42.7;
        const region = regionOf(span, 0, false, target)!;
        expect(region.x).toBeLessThanOrEqual(84);
        expect(region.x + region.width).toBeGreaterThanOrEqual(117);
        expect(region.y).toBeLessThanOrEqual(10);
        expect(region.y + region.height).toBeGreaterThanOrEqual(43);
        expect(region.width % 16).toBe(0);
    });

    it('works on all of what is drawn on when something in it has no outline of its own', () => {
        const target = { width: 320, height: 240, pixelRatio: 1 };
        const span = emptySpan();
        span.everything = true;
        expect(regionOf(span, 4, false, target)).toEqual({ x: 0, y: 0, width: 320, height: 240 });
        expect(regionOf(emptySpan(), 4, false, target)).toBeNull();
    });

    it('a model inside one makes it work on all of the screen', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            useSpawn(() => {
                useTransform(block(10, 10));
                createMesh({ geometry: { vertices: new Float32Array(9), count: 3 } as never });
                useFilter({ effects: [outline()] }).add(useSelf());
            })();
            return createScene();
        });
        const layer = layersOf(screenOf(frame(store)))[0]!;
        expect(layer).toMatchObject({ x: 0, y: 0 });
    });

    it('keeps the depth of a model inside it, for its layer, with how far its effects reach', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            useSpawn(() => {
                useTransform(block(10, 10));
                createMesh({ geometry: { vertices: new Float32Array(9), count: 3 } as never });
                useFilter({ effects: [glow()], padding: 6.5 }).add(useSelf());
            })();
            return createScene();
        });
        const ctx = frame(store);
        const [content, screen] = ctx.passes as [TRenderPass, TRenderPass];
        expect(content.filter!.depth).toEqual({ reach: 7 });
        expect(layersOf(screen)[0]!.depth).toBe(true);
    });

    it('keeps no depth for a see-through model, which leaves none to keep', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            useSpawn(() => {
                useTransform(block(10, 10));
                createMesh({ geometry: { vertices: new Float32Array(9), count: 3 } as never, alpha: 0.5 });
                useFilter({ effects: [glow()] }).add(useSelf());
            })();
            return createScene();
        });
        const [content, screen] = frame(store).passes as [TRenderPass, TRenderPass];
        expect(content.filter!.depth).toBeUndefined();
        expect(layersOf(screen)[0]!.depth).toBeUndefined();
    });

    it('keeps no depth for 2D things alone, which are laid as they always were', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            useFilter({ effects: [glow()] }).add(square(50, 50));
            return createScene();
        });
        const [content, screen] = frame(store).passes as [TRenderPass, TRenderPass];
        expect(content.filter!.depth).toBeUndefined();
        expect(layersOf(screen)[0]!.depth).toBeUndefined();
    });

    it('keeps the depth of a filter holding one that holds a model', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            const outer = useSpawn(() => {
                useTransform(block(0, 0));
                const inner = useSpawn(() => {
                    useTransform(block(10, 10));
                    createMesh({ geometry: { vertices: new Float32Array(9), count: 3 } as never });
                })();
                useFilter({ effects: [glow()] }).add(inner);
            })();
            useFilter({ effects: [outline()] }).add(outer);
            return createScene();
        });
        const [inner, outer, screen] = frame(store).passes as [TRenderPass, TRenderPass, TRenderPass];
        expect(inner.filter!.depth).toBeDefined();
        expect(layersOf(outer)[0]!.depth).toBe(true);
        expect(outer.filter!.depth).toBeDefined();
        expect(layersOf(screen)[0]!.depth).toBe(true);
    });

    it('is split in two by something it does not filter sorted between its own', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            const group = useSpawn(() => {
                useTransform(block(0, 0));
                createSprite({ width: 4, height: 4, zIndex: 1, transform: block(20, 20) });
                createSprite({ width: 4, height: 4, zIndex: 3, transform: block(40, 40) });
            })();
            useFilter({ effects: [outline()] }).add(group);
            createSprite({ width: 4, height: 4, zIndex: 2, transform: block(30, 30) });
            return createScene();
        });
        expect(kinds(screenOf(frame(store)))).toEqual(['filter-layer', 'sprite', 'filter-layer']);
    });

    it('runs inside its own object\'s mask, which keeps the result to it', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            useSpawn(() => {
                useTransform(block(50, 50));
                createSprite({ width: 10, height: 10 });
                useMask({ rect: { x: -5, y: -5, width: 10, height: 10 } }).add(useSelf());
                useFilter({ effects: [glow()] }).add(useSelf());
            })();
            return createScene();
        });
        const screen = screenOf(frame(store));
        expect(kinds(screen)).toEqual(['filter-layer']);
        // The rectangle is square to the screen, so it is a scissor on the layer.
        expect(screen.stencil![0]!.scissor).toEqual({ x: 45, y: 45, width: 10, height: 10 });
    });

    it('one inside another runs on its own part first, and the outer one measures its layer', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            const outer = useSpawn(() => {
                useTransform(block(0, 0));
                const inner = useSpawn(() => {
                    useTransform(block(60, 60));
                    createSprite({ width: 10, height: 10 });
                })();
                useFilter({ effects: [glow({ radius: 8 })] }).add(inner);
            })();
            useFilter({ effects: [outline()] }).add(outer);
            return createScene();
        });
        const ctx = frame(store);
        expect(ctx.passes).toHaveLength(3);
        const [inner, outer, screen] = ctx.passes as [TRenderPass, TRenderPass, TRenderPass];
        expect(inner.filter!.chain[0]!.name).toBe('glow');
        expect(kinds(outer)).toEqual(['filter-layer']);
        expect(outer.filter!.chain[0]!.name).toBe('outline');
        expect(kinds(screen)).toEqual(['filter-layer']);
        const innerLayer = layersOf(outer)[0]!;
        const outerLayer = layersOf(screen)[0]!;
        expect(outerLayer.x).toBeLessThanOrEqual(innerLayer.x);
        expect(outerLayer.x + outerLayer.width).toBeGreaterThanOrEqual(innerLayer.x + innerLayer.width);
    });

    it('switched off, or with every effect off, draws its objects as they are', () => {
        const { store } = createTestGame();
        let filter!: TFilter;
        startTestScene(store, 'Level', () => {
            filter = useFilter({ effects: [outline(), glow()] });
            filter.add(square(50, 50));
            return createScene();
        });
        filter.enabled = false;
        expect(kinds(screenOf(frame(store)))).toEqual(['sprite']);
        filter.enabled = true;
        filter.effects.forEach((effect) => { effect.enabled = false; });
        expect(kinds(screenOf(frame(store)))).toEqual(['sprite']);
        filter.effects[1]!.enabled = true;
        expect(screenOf(frame(store)).drawables!.length).toBe(1);
        expect(frame(store).passes[0]!.filter!.chain.map((effect) => effect.name)).toEqual(['glow']);
    });

    it('is touched where its objects are, not where its effects draw', () => {
        const { store } = createTestGame();
        let box!: TGameObject;
        startTestScene(store, 'Level', () => {
            box = square(50, 50);
            useFilter({ effects: [glow({ radius: 20 })] }).add(box);
            return createScene();
        });
        expect(pickTargets(store, 50, 50)).toHaveLength(1);
        expect(pickTargets(store, 62, 50)).toHaveLength(0);
    });

    it('goes with the object that asked for it, and what it filtered is drawn as it is again', () => {
        const { store } = createTestGame();
        let maker!: TGameObject;
        let box!: TGameObject;
        startTestScene(store, 'Level', () => {
            box = square(50, 50);
            maker = useSpawn(() => {
                useFilter({ effects: [outline()] }).add(box);
            })();
            return createScene();
        });
        expect(box.filter).not.toBeNull();
        destroy(maker);
        flushDestroyed(store);
        expect(box.filter).toBeNull();
        expect(frame(store).passes).toHaveLength(1);
    });

    it('takes the place of another one on the same object, and says so', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => undefined);
        try {
            const { store } = createTestGame();
            startTestScene(store, 'Level', () => {
                const box = square(50, 50);
                const first = useFilter({ effects: [outline()] });
                first.add(box);
                const second = useFilter({ effects: [glow()] });
                second.add(box);
                expect(box.filter).toBe(second);
                expect(first.boxes).toHaveLength(0);
                return createScene();
            });
            expect(warn.mock.calls.some(([said]) => String(said).includes('already had a filter'))).toBe(true);
        } finally {
            warn.mockRestore();
        }
    });

    it('asks for at least one effect', () => {
        const { store } = createTestGame();
        expect(() => startTestScene(store, 'Level', () => {
            useFilter({ effects: [] });
            return createScene();
        })).toThrow('[NacatamalOn] useFilter: it needs at least one effect');
    });

    it('leaves a pass with nothing masked or filtered as it is', () => {
        expect(applyMasks({ drawables: [], cameraIndex: [], viewIndex: [], levels: [], shapes: new Map(), cameras: [], views3d: [] }, { width: 10, height: 10, pixelRatio: 1 }, null as never, null as never)).toBeNull();
    });
});

describe('the effects made for a filter', () => {
    it('say how much room they need around what they are handed', () => {
        expect(outline({ thickness: 3 }).reach!({ color: [1, 1, 1], thickness: 3 })).toBe(3);
        expect(outline().reach!({ color: [1, 1, 1], thickness: 40 })).toBe(8);
        expect(glow({ radius: 7 }).reach!({ color: [1, 1, 1], radius: 7, intensity: 1 })).toBe(7);
        expect(dropShadow().reach!({ offset: [-4, 2], radius: 3, color: [0, 0, 0], amount: 1 })).toBe(7);
    });

    it('carry their room when spread into a filter', () => {
        const { store } = createTestGame();
        let filter!: TFilter;
        startTestScene(store, 'Level', () => {
            filter = useFilter({ effects: [glow({ radius: 5 }), blur()] });
            return createScene();
        });
        expect(filter.effects[0]!.reach!(filter.effects[0]!.uniforms)).toBe(5);
        expect(filter.effects[1]!.reach).toBeUndefined();
    });

    it('round a half up on both cards, as the room they ask for does', () => {
        expect(outline().fragment).toContain('floor(mu.thickness + 0.5)');
        expect(outline().fragmentGlsl).toContain('floor(mu.thickness + 0.5)');
        expect(outline().reach!({ color: [1, 1, 1], thickness: 2.5 })).toBe(3);
    });

    it('keep what an effect gives back to its own alpha on a filter, and only there', () => {
        const effect = dither();
        expect(buildPostShader(effect.fragment, effect.uniformSig)).not.toContain('min(shown.rgb');
        expect(buildPostShader(effect.fragment, effect.uniformSig, true)).toContain('min(shown.rgb, vec3<f32>(alpha))');
        expect(buildPostShaderGlsl(effect.fragmentGlsl, effect.uniformSig).fragment).not.toContain('min(shown.rgb');
        expect(buildPostShaderGlsl(effect.fragmentGlsl, effect.uniformSig, true).fragment).toContain('min(shown.rgb, vec3(alpha))');
    });
});

describe('a filter written down', () => {
    it('is a component of the object it filters, with its effects as a chain names them, and comes back the same', () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useSpawn(() => {
                useTransform(block(10, 10));
                createSprite({ width: 4, height: 4 });
                const filter = useFilter({ effects: [outline({ color: '#ff0000', thickness: 2 }), glow()], rect: { x: -8, y: -8, width: 16, height: 16 } });
                filter.add(useSelf());
                filter.effects[1]!.enabled = false;
            }, { name: 'Hero' })();
            return createScene();
        });
        const doc = serializeScene(root);
        const component = doc.root.children[0]!.components.find((c) => c.type === 'filter');
        expect(component).toEqual({
            type: 'filter',
            id: expect.any(String),
            effects: [
                { builtin: 'outline', uniforms: { color: [1, 0, 0], thickness: 2 } },
                { builtin: 'glow', uniforms: { color: [1, 0.9, 0.5], radius: 6, intensity: 1.5 }, enabled: false },
            ],
            rect: { x: -8, y: -8, width: 16, height: 16 },
        });
        expect(parseSceneDoc(doc, '/scenes/level.scene')).toEqual(doc);

        const { store: again } = createTestGame();
        registerScene(again, doc.name, sceneFromDoc(doc));
        const built = startScene(again, doc.name);
        expect(serializeScene(built)).toEqual(doc);
        const hero = built.children[0]!;
        expect(hero.filter!.effects.map((effect) => effect.name)).toEqual(['outline', 'glow']);
        expect(hero.filter!.effects[0]!.reach!(hero.filter!.effects[0]!.uniforms)).toBe(2);
    });

    it('says again the name and the options its entries were read with', () => {
        const doc = parseSceneDoc({
            format: 'nacatamalon-scene',
            version: 1,
            name: 'Level',
            root: {
                id: 'root',
                name: 'Level',
                children: [{
                    id: 'a',
                    name: 'A',
                    components: [
                        { type: 'sprite', id: 's', width: 4, height: 4 },
                        { type: 'filter', id: 'f', effects: [{ builtin: 'ascii', name: 'Letters', options: { glyphs: ' .#' } }] },
                    ],
                }],
            },
        }, '/scenes/level.scene');
        const { store } = createTestGame();
        registerScene(store, doc.name, sceneFromDoc(doc));
        const built = startScene(store, doc.name);
        const written = serializeScene(built).root.children[0]!.components.find((c) => c.type === 'filter');
        expect(written).toMatchObject({ effects: [{ builtin: 'ascii', name: 'Letters', options: { glyphs: ' .#' } }] });
    });

    it('leaves out an effect written in code, and says so', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => undefined);
        try {
            const { store } = createTestGame();
            const root = startTestScene(store, 'Level', () => {
                useSpawn(() => {
                    createSprite({ width: 4, height: 4 });
                    useFilter({ effects: [{ fragment: 'fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> { return color; }' }, outline()] }).add(useSelf());
                }, { name: 'Hero' })();
                return createScene();
            });
            const component = serializeScene(root).root.children[0]!.components.find((c) => c.type === 'filter');
            expect(component).toMatchObject({ effects: [{ builtin: 'outline' }] });
            expect(warn.mock.calls.some(([said]) => String(said).includes('written in code'))).toBe(true);
        } finally {
            warn.mockRestore();
        }
    });

    it('drops what it cannot run, and a filter with nothing left is kept as it was written', () => {
        const doc = parseSceneDoc({
            format: 'nacatamalon-scene',
            version: 1,
            name: 'Level',
            root: {
                id: 'root',
                name: 'Level',
                children: [{
                    id: 'a',
                    name: 'A',
                    components: [
                        { type: 'filter', id: 'f', effects: [{ builtin: 'outline', uniforms: { thickness: 2 } }, { nothing: true }], padding: 3 },
                        { type: 'filter', id: 'g', effects: [] },
                    ],
                }],
            },
        }, '/scenes/level.scene');
        const components = doc.root.children[0]!.components;
        expect(components.find((c) => c.type === 'filter')).toEqual({ type: 'filter', id: 'f', effects: [{ builtin: 'outline', uniforms: { thickness: 2 } }], padding: 3 });
    });
});
