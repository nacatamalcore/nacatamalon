import { describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createText } from '../src/gameobjects/text/create_text';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useSelf } from '../src/hooks/spawn/use_self';
import { useTransform } from '../src/hooks/transform/use_transform';
import { useMask } from '../src/hooks/mask/use_mask';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { pickTargets } from '../src/input/pick_targets';
import { destroy } from '../src/destroy/destroy';
import { flushDestroyed } from '../src/destroy/flush_destroyed';
import { setShapePixels } from '../src/mask/masked_pick';
import { createTestGame, startTestScene } from './helpers/test_game';
import { createTestFont } from './helpers/test_font';
import { boxFromDoc, parseSceneDoc, sceneFromDoc, serializeScene } from '../src/scene/document';
import { registerScene } from '../src/scene/register_scene';
import { setCameraPreview } from '../src/game/preview';
import { createCamera2d } from '../src/camera/create_camera_2d';
import { startScene } from '../src/scene/start_scene';
import type { TFrameContext, TRenderPass } from '../src/render';
import type { TDrawItem, TDrawStencil } from '../src/render/interface';
import type { TGameObject } from '../src/hooks/spawn/use_spawn';
import type { TMask } from '../src/mask';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';
import type { TTexture } from '../src/loaders';
import type { TRuntimeStore } from '../src/store';

/**
 * Masks: what keeps objects, and everything under them, to a rectangle or to the shape of another
 * object. What reaches a backend is checked here, entry by entry: a scissor where a rectangle stays
 * square to the screen, the stencil written right before what it keeps in, and a soft mask's two
 * pictures drawn in passes before the screen's.
 */

const frame = (store: TRuntimeStore): TFrameContext => {
    const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
    fillFrameContext(store, ctx);
    return ctx;
};
const screenOf = (ctx: TFrameContext): TRenderPass => ctx.passes[ctx.passes.length - 1]!;

/** Each entry of the screen's pass as what it is and what it does: `'add 0'`, `'draw 1'`, `'reset 0'`. */
const steps = (pass: TRenderPass): string[] => (pass.drawables ?? []).map((item, i) => {
    const state = pass.stencil?.[i];
    const write = state === undefined || state.write === 'none' ? 'draw' : state.write;
    return `${write} ${state?.ref ?? 0}`;
});

const block = (x: number, y: number, over: Partial<{ rotation: number }> = {}) => ({ x, y, rotation: over.rotation ?? 0, scaleX: 1, scaleY: 1 });

/** A box at a place, drawing one 10 × 10 square in its middle, with the box itself given back. */
const square = (x: number, y: number, rotation = 0, zIndex?: number) => useSpawn(() => {
    useTransform(block(x, y, { rotation }));
    createSprite({ width: 10, height: 10, ...(zIndex !== undefined ? { zIndex } : {}) });
})();

describe('a mask', () => {
    it('masks nothing until it is added, and nothing in a game without one changes', () => {
        const { store } = createTestGame();
        let mask!: TMask;
        let box!: TGameObject;
        startTestScene(store, 'Level', () => {
            box = square(50, 50);
            createSprite({ width: 4, height: 4 });
            mask = useMask({ rect: { x: 0, y: 0, width: 5, height: 5 } });
            return createScene();
        });
        const before = screenOf(frame(store));
        expect(before.stencil).toBeUndefined();
        expect(before.drawables).toHaveLength(2);

        mask.add(box);
        expect(mask.has(box)).toBe(true);
        expect(box.mask).toBe(mask);
        expect(screenOf(frame(store)).stencil).toBeDefined();

        mask.remove(box);
        expect(box.mask).toBeNull();
        expect(screenOf(frame(store)).stencil).toBeUndefined();
    });

    it('is a rectangle or a shape, not both', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            const shape = square(0, 0);
            expect(() => useMask({ rect: { x: 0, y: 0, width: 1, height: 1 }, by: shape })).toThrow(/rect or a shape/);
            return createScene();
        });
    });

    it('takes the place of the one an object had, and says so', () => {
        const { store } = createTestGame();
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        startTestScene(store, 'Level', () => {
            const box = square(0, 0);
            const first = useMask({ rect: { x: 0, y: 0, width: 1, height: 1 } });
            const second = useMask({ rect: { x: 0, y: 0, width: 2, height: 2 } });
            first.add(box);
            second.add(box);
            expect(box.mask).toBe(second);
            expect(first.boxes).toHaveLength(0);
            return createScene();
        });
        expect(warn.mock.calls.some(([message]) => String(message).includes('already had a mask'))).toBe(true);
        warn.mockRestore();
    });

    it('goes away with the object it was asked for in, and what it masked is drawn whole again', () => {
        const { store } = createTestGame();
        let owner!: TGameObject;
        let box!: TGameObject;
        startTestScene(store, 'Level', () => {
            box = square(50, 50);
            owner = useSpawn(() => {
                useMask({ rect: { x: 0, y: 0, width: 5, height: 5 } }).add(box);
            })();
            return createScene();
        });
        expect(box.mask).not.toBeNull();
        destroy(owner);
        flushDestroyed(store);
        expect(box.mask).toBeNull();
        expect(screenOf(frame(store)).stencil).toBeUndefined();
    });
});

describe('a masked object that leaves', () => {
    it('is taken off its mask, which goes on masking the others', () => {
        const { store } = createTestGame();
        let mask!: TMask;
        let gone!: TGameObject;
        let kept!: TGameObject;
        startTestScene(store, 'Level', () => {
            mask = useMask({ rect: { x: 0, y: 0, width: 5, height: 5 } });
            gone = square(0, 0);
            kept = square(20, 20);
            mask.add(gone);
            mask.add(kept);
            return createScene();
        });
        destroy(gone);
        flushDestroyed(store);
        expect(mask.boxes).toEqual([kept]);
        expect(screenOf(frame(store)).stencil).toBeDefined();
    });
});

describe('a rectangle', () => {
    it('square to the screen is a scissor on what it keeps in, and draws nothing of its own', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            const box = square(100, 60);
            useSpawn(() => {
                useTransform(block(0, 0));
                createSprite({ width: 4, height: 4 });
            })();
            useMask({ rect: { x: -20, y: -10, width: 40, height: 30 } }).add(box);
            return createScene();
        });
        const pass = screenOf(frame(store));
        expect(steps(pass)).toEqual(['draw 0', 'draw 0']);
        expect(pass.stencil![0]!.scissor).toEqual({ x: 80, y: 50, width: 40, height: 30 });
        expect(pass.stencil![1]!.scissor).toBeNull();
    });

    it('keeps the box\'s own drawables and every one below it, all in one state, so a run stays a run', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            const box = useSpawn(() => {
                useTransform(block(0, 0));
                createSprite({ width: 4, height: 4 });
                useSpawn(() => {
                    createSprite({ width: 4, height: 4 });
                    useSpawn(() => { createSprite({ width: 4, height: 4 }); })();
                })();
            })();
            useMask({ rect: { x: 0, y: 0, width: 8, height: 8 } }).add(box);
            return createScene();
        });
        const pass = screenOf(frame(store));
        expect(pass.drawables).toHaveLength(3);
        expect(new Set(pass.stencil)).toHaveProperty('size', 1);
    });

    it('turned on the screen goes into the stencil, and leaving it brings the count back', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            const box = square(100, 60, 0.3);
            createSprite({ width: 4, height: 4 });
            useMask({ rect: { x: -20, y: -10, width: 40, height: 30 } }).add(box);
            return createScene();
        });
        const pass = screenOf(frame(store));
        // What the scene draws itself comes first, then the rectangle written and what it keeps.
        expect(steps(pass)).toEqual(['draw 0', 'add 0', 'draw 1']);
        const quad = pass.drawables![1] as Extract<TDrawItem, { type: 'sprite' }>;
        expect(quad.width).toBe(40);
        expect(quad.height).toBe(30);
        expect(quad.worldTransform!.rotation).toBeCloseTo(0.3, 6);
    });

    it('inside another keeps to both scissors at once', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            let inner!: TGameObject;
            const outer = useSpawn(() => {
                useTransform(block(0, 0));
                inner = square(0, 0);
            })();
            useMask({ rect: { x: 0, y: 0, width: 100, height: 100 } }).add(outer);
            useMask({ rect: { x: -50, y: 20, width: 100, height: 50 } }).add(inner);
            return createScene();
        });
        const pass = screenOf(frame(store));
        expect(pass.stencil![0]!.scissor).toEqual({ x: 0, y: 20, width: 50, height: 50 });
    });
});

describe('a shape', () => {
    it('writes what its object draws, added together, and is not drawn itself', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            const shape = useSpawn(() => {
                useTransform(block(100, 100));
                createSprite({ width: 20, height: 20 });
                createSprite({ width: 20, height: 20, transform: block(30, 0) });
            })();
            const box = square(0, 0);
            useMask({ by: shape }).add(box);
            return createScene();
        });
        const pass = screenOf(frame(store));
        expect(steps(pass)).toEqual(['add 0', 'add 0', 'draw 1']);
        // The two writes share one state, so they go in one draw.
        expect(pass.stencil![0]).toBe(pass.stencil![1]!);
    });

    it('with showShape is drawn as well', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            const shape = square(100, 100);
            const box = square(0, 0);
            useMask({ by: shape, showShape: true }).add(box);
            return createScene();
        });
        expect(steps(screenOf(frame(store)))).toEqual(['draw 0', 'add 0', 'draw 1']);
    });

    it('reads a black and white cut-out by how light it is', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            useMask({ by: square(100, 100), channel: 'luminance' }).add(square(0, 0));
            return createScene();
        });
        const pass = screenOf(frame(store));
        expect(pass.stencil![0]!.channel).toBe('luminance');
    });

    it('can be letters: a text is written as its letters', () => {
        const { store } = createTestGame();
        const font = createTestFont();
        startTestScene(store, 'Level', () => {
            const title = useSpawn(() => { createText({ text: 'ABC', font }); })();
            useMask({ by: title }).add(square(0, 0));
            return createScene();
        });
        expect(steps(screenOf(frame(store)))).toEqual(['add 0', 'add 0', 'add 0', 'draw 1']);
    });

    it('inverted is everything raised and the shape lowered back, so only what is outside it is drawn', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            useMask({ by: square(100, 100), invert: true }).add(square(0, 0));
            return createScene();
        });
        expect(steps(screenOf(frame(store)))).toEqual(['add 0', 'sub 1', 'draw 1']);
    });

    it('that is gone keeps everything out', () => {
        const { store } = createTestGame();
        let shape!: TGameObject;
        startTestScene(store, 'Level', () => {
            shape = square(100, 100);
            useMask({ by: shape }).add(square(0, 0));
            return createScene();
        });
        shape.visible = false;
        expect(steps(screenOf(frame(store)))).toEqual(['draw 1']);
    });

    it('inside another counts one more, and the outer one is written once for both', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            let inner!: TGameObject;
            const outer = useSpawn(() => {
                createSprite({ width: 4, height: 4 });
                inner = square(0, 0);
            })();
            useMask({ by: square(100, 100) }).add(outer);
            useMask({ by: square(200, 100) }).add(inner);
            return createScene();
        });
        expect(steps(screenOf(frame(store)))).toEqual(['add 0', 'draw 1', 'add 1', 'draw 2']);
    });

    it('keeps the sort: what zIndex put between two masked things stays between them', () => {
        const { store } = createTestGame();
        let order!: TSprite[];
        startTestScene(store, 'Level', () => {
            const shape = square(100, 100);
            const low = square(0, 0, 0, 0);
            const high = square(0, 0, 0, 2);
            const between = createSprite({ width: 4, height: 4, zIndex: 1 });
            const mask = useMask({ by: shape });
            mask.add(low);
            mask.add(high);
            order = [low.drawables[0] as TSprite, between, high.drawables[0] as TSprite];
            return createScene();
        });
        const pass = screenOf(frame(store));
        expect(steps(pass)).toEqual(['add 0', 'draw 1', 'reset 0', 'draw 0', 'add 0', 'draw 1']);
        const drawn = pass.drawables!.filter((_, i) => pass.stencil![i]!.write === 'none');
        expect(drawn).toEqual(order as unknown as TDrawItem[]);
    });
});

describe('a soft mask', () => {
    it('draws what it keeps into a picture, and its shape into another, before the screen, and lays them where it was', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            createSprite({ width: 4, height: 4 });
            useMask({ by: square(100, 100), soft: true, channel: 'luminance', invert: true }).add(square(0, 0));
            createSprite({ width: 4, height: 4, transform: block(5, 5) });
            return createScene();
        });
        const ctx = frame(store);
        expect(ctx.passes).toHaveLength(3);
        const [content, shape, screen] = ctx.passes as [TRenderPass, TRenderPass, TRenderPass];
        expect(content.renderTarget).toBeDefined();
        expect(content.clearColor).toEqual({ r: 0, g: 0, b: 0, a: 0 });
        expect(content.drawables).toHaveLength(1);
        expect(shape.drawables).toHaveLength(1);
        // The scene's own two first, then its child's, which the mask keeps.
        expect(screen.drawables!.map((item) => item.type)).toEqual(['sprite', 'sprite', 'mask-layer']);
        const layer = screen.drawables![2] as Extract<TDrawItem, { type: 'mask-layer' }>;
        expect(layer).toMatchObject({ content: content.renderTarget, shape: shape.renderTarget, channel: 'luminance', invert: true });
        // Nothing else masked, so the screen keeps to nothing.
        expect(screen.stencil!.every((state: TDrawStencil) => state.ref === 0 && state.write === 'none')).toBe(true);
    });

    it('makes its pictures once and draws into the same ones every frame', () => {
        const { store, renderer } = createTestGame();
        startTestScene(store, 'Level', () => {
            useMask({ by: square(100, 100), soft: true }).add(square(0, 0));
            return createScene();
        });
        const first = frame(store).passes[0]!.renderTarget;
        expect(frame(store).passes[0]!.renderTarget).toBe(first);
        expect(renderer.destroyedTextures).toHaveLength(0);
    });
});

describe('masks found twice in a frame', () => {
    it('a soft mask inside another: each pass that lays one over carries what draws it', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            let inner!: TGameObject;
            const outer = useSpawn(() => {
                useTransform(block(0, 0));
                createSprite({ width: 10, height: 10 });
                inner = square(0, 0);
            })();
            useMask({ rect: { x: 0, y: 0, width: 50, height: 50 }, soft: true }).add(outer);
            useMask({ rect: { x: 0, y: 0, width: 20, height: 20 }, soft: true }).add(inner);
            return createScene();
        });
        const ctx = frame(store);
        // The inner pair first, then the outer pair, whose picture holds the inner one laid over.
        for (const pass of ctx.passes) {
            if (pass.drawables!.some((item) => item.type === 'mask-layer')) {
                expect(pass.stencil).toBeDefined();
            }
        }
        expect(ctx.passes.filter((pass) => pass.renderTarget !== undefined)).toHaveLength(4);
    });

    it('a preview of another camera does not move the screen\'s masks', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            const box = square(100, 60);
            useMask({ rect: { x: -20, y: -10, width: 40, height: 30 } }).add(box);
            return createScene();
        });
        store.setState('viewport', { screen2d: createCamera2d({ transform: { x: 30, y: 0 } }) });
        // Pinned to the screen, so the screen's pass sees it through the tool's camera for that.
        store.get('world').scenes[0]!.children[0]!.screenSpace = true;
        const alone = screenOf(frame(store)).stencil![0]!.scissor;
        setCameraPreview(store, { canvas: { width: 320, height: 240 } as HTMLCanvasElement, camera2d: createCamera2d({ transform: { x: 500, y: 500 } }) });
        expect(screenOf(frame(store)).stencil![0]!.scissor).toEqual(alone);
    });
});

describe('the pointer', () => {
    it('does not touch what a mask keeps out', () => {
        const { store } = createTestGame();
        let wide!: TSprite;
        startTestScene(store, 'Level', () => {
            const box = useSpawn(() => {
                useTransform(block(100, 100));
                wide = createSprite({ width: 100, height: 20 });
            })();
            useMask({ rect: { x: -10, y: -10, width: 20, height: 20 } }).add(box);
            return createScene();
        });
        expect(pickTargets(store, 100, 100)).toEqual([wide]);
        expect(pickTargets(store, 140, 100)).toEqual([]);
    });

    it('touches what a soft mask lets through, which is no longer in the screen\'s pass', () => {
        const { store } = createTestGame();
        let inside!: TSprite;
        startTestScene(store, 'Level', () => {
            const box = useSpawn(() => { inside = createSprite({ width: 100, height: 100, transform: block(50, 50) }); })();
            useMask({ by: square(50, 50), soft: true }).add(box);
            return createScene();
        });
        expect(pickTargets(store, 50, 50)).toEqual([inside]);
        expect(pickTargets(store, 20, 20)).toEqual([]);
    });

    it('reads a sprite shape by its picture: where it is see-through, nothing is touched', () => {
        const { store } = createTestGame();
        const ring: TTexture = { type: 'texture', key: 'ring', src: '', width: 2, height: 1, status: 'ready', gpu: { resourceType: 'texture' } } as unknown as TTexture;
        // Left pixel solid, right pixel clear.
        setShapePixels(ring, { type: 'pixels', width: 2, height: 1, data: new Uint8Array([255, 255, 255, 255, 0, 0, 0, 0]) });
        let under!: TSprite;
        startTestScene(store, 'Level', () => {
            const shape = useSpawn(() => { createSprite({ texture: ring, width: 20, height: 10, transform: block(50, 50) }); })();
            const box = useSpawn(() => { under = createSprite({ width: 100, height: 100, transform: block(50, 50) }); })();
            useMask({ by: shape }).add(box);
            return createScene();
        });
        expect(pickTargets(store, 45, 50)).toEqual([under]);
        expect(pickTargets(store, 55, 50)).toEqual([]);
    });

    it('inverted, touches only outside the shape', () => {
        const { store } = createTestGame();
        let under!: TSprite;
        startTestScene(store, 'Level', () => {
            const box = useSpawn(() => { under = createSprite({ width: 100, height: 100, transform: block(50, 50) }); })();
            useMask({ by: square(50, 50), invert: true }).add(box);
            return createScene();
        });
        expect(pickTargets(store, 50, 50)).toEqual([]);
        expect(pickTargets(store, 20, 20)).toEqual([under]);
    });
});

describe('useSelf', () => {
    it('masks the object it is asked in', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            useSpawn(() => {
                useTransform(block(10, 10));
                useMask({ rect: { x: 0, y: 0, width: 5, height: 5 } }).add(useSelf());
                createSprite({ width: 4, height: 4 });
            })();
            return createScene();
        });
        expect(screenOf(frame(store)).stencil![0]!.scissor).toEqual({ x: 10, y: 10, width: 5, height: 5 });
    });
});

describe('a mask written down', () => {
    it('is a component of each object it masks, naming its shape by id, and comes back the same', () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Cave', () => {
            const light = useSpawn(() => { useTransform(block(100, 80)); createSprite({ width: 20, height: 20 }); }, { name: 'Light' })();
            const mask = useMask({ by: light, soft: true, channel: 'luminance' });
            mask.add(useSpawn(() => { createSprite({ width: 4, height: 4 }); }, { name: 'Map' })());
            useSpawn(() => {
                useTransform(block(0, 0));
                useMask({ rect: { x: 0, y: 0, width: 50, height: 20 }, invert: true }).add(useSelf());
            }, { name: 'Window' })();
            return createScene();
        });
        const doc = serializeScene(root);
        const [, map, window] = doc.root.children;
        expect(map!.components.find((c) => c.type === 'mask')).toEqual({ type: 'mask', id: expect.any(String), by: doc.root.children[0]!.id, channel: 'luminance', soft: true });
        expect(window!.components.find((c) => c.type === 'mask')).toEqual({ type: 'mask', id: expect.any(String), rect: { x: 0, y: 0, width: 50, height: 20 }, invert: true });
        expect(parseSceneDoc(doc, '/scenes/cave.scene.json')).toEqual(doc);

        const { store: again } = createTestGame();
        registerScene(again, doc.name, sceneFromDoc(doc));
        const built = startScene(again, doc.name);
        expect(serializeScene(built)).toEqual(doc);
        // The shape is found although it is only a name in the file, and is not drawn.
        const [light, builtMap] = built.children;
        expect(builtMap!.mask!.by).toBe(light!);
        expect(screenOf(frame(again)).drawables!.map((item) => item.type)).toEqual(['mask-layer']);
    });

    it('in a copy keeps to the copy\'s own shape', () => {
        const { store } = createTestGame();
        const source = startTestScene(store, 'Lamp', () => {
            useSpawn(() => {
                const shape = useSpawn(() => { createSprite({ width: 10, height: 10 }); }, { name: 'Shape' })();
                useMask({ by: shape }).add(useSelf());
                createSprite({ width: 4, height: 4 });
            }, { name: 'Lamp' })();
            return createScene();
        });
        const doc = serializeScene(source);
        const { store: again } = createTestGame();
        let copy!: TGameObject;
        startTestScene(again, 'Room', () => {
            copy = useSpawn(() => { boxFromDoc(doc); })();
            return createScene();
        });
        // The document's one box is built into the box spawned for it.
        expect(copy.name).toBe('Lamp');
        const shape = copy.children.find((child) => child.name === 'Shape')!;
        expect(copy.mask!.by).toBe(shape);
        expect(shape.id).not.toBe(doc.root.children[0]!.children[0]!.id);
    });

    it('reads what a file says it can, and nothing it cannot', () => {
        const doc = parseSceneDoc({
            format: 'nacatamalon-scene', version: 1, name: 'Bad',
            root: { id: 'r', name: 'Bad', transform: null, children: [], components: [
                { type: 'mask', id: 'm', rect: { x: 0, y: 0, width: 'wide' }, by: '', channel: 'red', soft: 'yes' },
            ] },
        }, '/scenes/bad.scene.json');
        expect(doc.root.components).toEqual([{ type: 'mask', id: 'm' }]);
    });
});
