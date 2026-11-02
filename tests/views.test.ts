import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createText } from '../src/gameobjects/text';
import { createMesh } from '../src/gameobjects/mesh';
import { createParticles, particleCount } from '../src/gameobjects/particles';
import { createSpriteTexture, resizeSpriteTexture, setViewFilter, viewToRay, viewToWorld, worldToView } from '../src/gameobjects/sprite_texture';
import { useCubeGeometry } from '../src/hooks';
import { useCamera2d } from '../src/hooks/camera/use_camera_2d';
import { useCamera3d } from '../src/hooks/camera/use_camera_3d';
import { useScreenSpace } from '../src/hooks/camera/use_screen_space';
import { useWorldOffScreen } from '../src/hooks/camera/use_world_off_screen';
import { useCameraFollow } from '../src/hooks/camera/use_camera_follow';
import { tick } from '../src/game/loop/tick';
import { useParallax } from '../src/hooks/camera/use_parallax';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTag } from '../src/hooks/tags';
import { useFog } from '../src/hooks/fog/use_fog';
import { useMask } from '../src/hooks/mask/use_mask';
import { useTransform } from '../src/hooks/transform/use_transform';
import { pivotPlace } from '../src/render/shared/pivot_place';
import { destroy } from '../src/destroy/destroy';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { parseSceneDoc, sceneFromDoc, serializeScene } from '../src/scene/document';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { createFakeCanvas, createTestGame, startTestScene } from './helpers/test_game';
import { useDirectionalLight } from '../src/hooks/light/use_directional_light';
import { captureScreen } from '../src/game/capture';
import { findShadowSources } from '../src/render/shared/light_space';
import type { ITexture } from '../src/render/interface';
import { setCameraPreview } from '../src/game/preview';
import { createCamera2d } from '../src/camera/create_camera_2d';
import type { TFrameContext, TRenderPass } from '../src/render';
import type { TTexture } from '../src/loaders';
import type { TRuntimeStore } from '../src/store';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';
import type { TCamera2d } from '../src/camera';
import type { TParticlesEffect2d } from '../src/loaders/particles';

/**
 * A view of the world (`createSpriteTexture({ sees: 'world' })`): the scene drawn again through the
 * view's own cameras, without being run again, and without changing what the screen draws.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

afterEach(() => { mock.restore(); });

const newFrame = (): TFrameContext => ({ passes: [{}], time: 0, progress: 0, phase: 0 });
const frameOf = (store: TRuntimeStore, ctx: TFrameContext = newFrame()): TFrameContext => {
    fillFrameContext(store, ctx, 1 / 60);
    return ctx;
};
const screenOf = (ctx: TFrameContext): TRenderPass => ctx.passes[ctx.passes.length - 1]!;
const passFor = (ctx: TFrameContext, texture: TTexture): TRenderPass => ctx.passes.find((pass) => pass.renderTarget === texture.gpu)!;

/** Where each sprite of a pass is drawn, by the texture key it shows, as numbers that can be compared. */
const placesOf = (pass: TRenderPass): string[] =>
    (pass.drawables ?? []).filter((item) => item.type === 'sprite').map((item) => {
        const place = (item as TSprite).worldTransform ?? (item as TSprite).transform;
        return `${(item as TSprite).texture?.key ?? 'plain'}@${place.x.toFixed(3)},${place.y.toFixed(3)}`;
    });

const keyed = (key: string): TTexture => ({ type: 'texture', key, src: `/${key}.png`, status: 'ready', width: 16, height: 16, gpu: { resourceType: 'texture' } }) as unknown as TTexture;
const HILLS = keyed('hills');
const HERO = keyed('hero');

/** A level with a camera, a far layer that moves at half its pace, and a hero; a view of it, or not. */
const level = (withView: boolean, viewOptions: Record<string, unknown> = {}) => {
    const { store } = createTestGame({ pixelSnap: 'screen' } as never);
    let camera!: TCamera2d;
    let view: TTexture | null = null;
    let hero!: TSprite;
    const Far = () => {
        useParallax({ x: 0.5, y: 0.5 });
        createSprite({ texture: HILLS, transform: { x: 100, y: 40 } });
    };
    const Minimap = () => {
        const own = useCamera2d({ zoom: 0.25 });
        own.transform.x = -40.3;
        own.transform.y = 10.7;
    };
    startTestScene(store, 'Level', () => {
        camera = useCamera2d();
        camera.transform.x = 33.4;
        camera.transform.y = 7.6;
        useSpawn(Far)();
        hero = createSprite({ texture: HERO, transform: { x: 160.25, y: 120.5 } });
        if (withView) {
            view = createSpriteTexture({ width: 96, height: 64, sees: 'world', ...viewOptions }, Minimap);
        }
        return createScene();
    });
    return { store, camera, view: view as TTexture | null, hero };
};

describe('a view of the world', () => {
    it('leaves the screen as it was, parallax and pixel steps included', () => {
        const without = level(false);
        const withIt = level(true);

        expect(placesOf(screenOf(frameOf(withIt.store)))).toEqual(placesOf(screenOf(frameOf(without.store))));
    });

    it('draws the world through its own camera, each thing placed for it, and leaves the game\'s drawings alone', () => {
        const { store, view, hero } = level(true);
        const ctx = frameOf(store);
        const pass = passFor(ctx, view!);

        const drawn = (pass.drawables ?? []).filter((item) => item.type === 'sprite') as TSprite[];
        expect(drawn.map((item) => item.texture?.key).sort()).toEqual(['hero', 'hills']);
        // Copies, not the game's own sprites: the screen draws those.
        expect(drawn.includes(hero)).toBe(false);
        expect(pass.cameras?.[0]?.zoom).toBe(0.25);
        // The far layer is moved by half of the view's camera, not the screen's: (-40.3, 10.7) * 0.5
        // left behind, on the view's pixels at zoom 0.25.
        const hills = drawn.find((item) => item.texture?.key === 'hills')!;
        const screenHills = (screenOf(ctx).drawables ?? []).find((item) => (item as TSprite).texture?.key === 'hills') as TSprite;
        expect(hills.worldTransform!.x).not.toBe(screenHills.worldTransform!.x);
    });

    it('never shows what is pinned to the screen, nor what shows the view itself', () => {
        const { store } = createTestGame();
        let view!: TTexture;
        const Hud = (picture: TTexture) => {
            useScreenSpace();
            createSprite({ texture: picture, transform: { x: 10, y: 10 } });
            createText({ text: 'SCORE' });
        };
        startTestScene(store, 'Level', () => {
            createSprite({ texture: HERO });
            view = createSpriteTexture({ width: 32, height: 32, sees: 'world' });
            useSpawn(Hud)(view);
            return createScene();
        });
        const ctx = frameOf(store);

        const seen = passFor(ctx, view).drawables ?? [];
        expect(seen.map((item) => (item as TSprite).texture?.key)).toEqual(['hero']);
        // The screen still has all three: the hero, the view shown and the score's letters.
        expect((screenOf(ctx).drawables ?? []).some((item) => (item as TSprite).texture === view)).toBe(true);
    });

    it('leaves out what its hide names, takes in only what its only names, and hide wins', () => {
        const { store } = createTestGame();
        let view!: TTexture;
        let boss!: TSprite;
        const Tagged = (texture: TTexture) => {
            createSprite({ texture });
        };
        startTestScene(store, 'Level', () => {
            useSpawn(Tagged, { tags: ['terrain'] })(keyed('rock'));
            useSpawn(Tagged, { tags: ['scenery'] })(keyed('tree'));
            boss = createSprite({ texture: keyed('boss') });
            createText({ text: 'HI' });
            view = createSpriteTexture({ width: 32, height: 32, sees: 'world', hide: { tags: ['scenery'], kinds: ['text'] } });
            return createScene();
        });
        const keys = () => (passFor(frameOf(store), view).drawables ?? []).map((item) => (item as TSprite).texture?.key).sort();

        expect(keys()).toEqual(['boss', 'rock']);
        setViewFilter(view, { only: { tags: ['terrain', 'scenery'], objects: [boss] }, hide: { objects: [boss] } });
        expect(keys()).toEqual(['rock', 'tree']);
    });

    it('leaves out a sprite by a tag of its own, as by its object\'s', () => {
        const { store } = createTestGame();
        let view!: TTexture;
        startTestScene(store, 'Level', () => {
            createSprite({ texture: HERO });
            useTag('secret').add(createSprite({ texture: keyed('coin') }));
            view = createSpriteTexture({ width: 32, height: 32, sees: 'world', hide: { tags: ['secret'] } });
            return createScene();
        });

        expect((passFor(frameOf(store), view).drawables ?? []).map((item) => (item as TSprite).texture?.key)).toEqual(['hero']);
    });

    it('still cuts what it takes in by a mask whose shape it leaves out', () => {
        const { store } = createTestGame();
        let view!: TTexture;
        const Square = (x: number) => {
            useTransform({ x, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
            createSprite({ width: 10, height: 10 });
        };
        startTestScene(store, 'Level', () => {
            const terrain = useSpawn(Square, { tags: ['terrain'] })(0);
            useMask({ by: useSpawn(Square)(4) }).add(terrain);
            view = createSpriteTexture({ width: 32, height: 32, sees: 'world', only: { tags: ['terrain'] } });
            return createScene();
        });
        const ctx = frameOf(store);
        const steps = (pass: TRenderPass) => (pass.drawables ?? []).map((_, i) => {
            const state = pass.stencil?.[i];
            return `${state === undefined || state.write === 'none' ? 'draw' : state.write} ${state?.ref ?? 0}`;
        });

        // The shape is written into the stencil and not drawn, on the screen and in the view alike.
        expect(steps(passFor(ctx, view))).toEqual(steps(screenOf(ctx)));
        expect(steps(passFor(ctx, view))).toEqual(['add 0', 'draw 1']);
    });

    it('places a turned sprite inside a turned and grown object where the screen does', () => {
        const { store } = createTestGame();
        let view!: TTexture;
        let sprite!: TSprite;
        const Turned = () => {
            useTransform({ x: 10, y: 10, rotation: Math.PI / 2, scaleX: 2, scaleY: 2 });
            sprite = createSprite({ width: 8, height: 8, pivot: { x: 0, y: 0 } });
        };
        startTestScene(store, 'Level', () => {
            useSpawn(Turned)();
            view = createSpriteTexture({ width: 64, height: 64, sees: 'world' });
            return createScene();
        });
        const ctx = frameOf(store);
        const standIn = (passFor(ctx, view).drawables ?? [])[0] as TSprite;
        const placed = (drawn: TSprite) => {
            const at = pivotPlace(drawn.worldTransform!, drawn, { x: 0.5, y: 0.5 }, 8, 8, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
            return [at.x.toFixed(3), at.y.toFixed(3)];
        };

        expect(standIn).not.toBe(sprite);
        expect(placed(standIn)).toEqual(placed(sprite));
    });

    it('lets go of what is taken off a drawing, as the drawing does', () => {
        const { store } = createTestGame();
        let view!: TTexture;
        let first!: TSprite;
        startTestScene(store, 'Level', () => {
            first = createSprite({ texture: keyed('first') });
            createSprite({ texture: keyed('second') });
            view = createSpriteTexture({ width: 32, height: 32, sees: 'world' });
            return createScene();
        });
        const order = () => (passFor(frameOf(store), view).drawables ?? []).map((item) => (item as TSprite).texture?.key);

        first.zIndex = 5;
        expect(order()).toEqual(['second', 'first']);
        delete first.zIndex;
        expect(order()).toEqual(['first', 'second']);
    });

    it('does not run the world again: its particles move once a frame', () => {
        const { store } = createTestGame();
        let emitter!: ReturnType<typeof createParticles>;
        const effect: TParticlesEffect2d = { kind: 'particles-2d', max: 100, life: 10, emission: { rate: 60, burst: 0, loop: true } };
        startTestScene(store, 'Level', () => {
            emitter = createParticles({ effect });
            createSpriteTexture({ width: 32, height: 32, sees: 'world' });
            createSpriteTexture({ width: 32, height: 32, sees: 'world' });
            return createScene();
        });
        for (let i = 0; i < 60; i++) frameOf(store);

        expect(particleCount(emitter)).toBeGreaterThanOrEqual(58);
        expect(particleCount(emitter)).toBeLessThanOrEqual(61);
    });

    it('sees the scene\'s models too, through its own 3D camera', () => {
        const { store } = createTestGame();
        let view!: TTexture;
        const Eye = () => {
            useCamera3d({ projection: 'perspective', transform: { z: 5 } });
        };
        startTestScene(store, 'Level', () => {
            useCamera3d({ projection: 'perspective', transform: { z: 10 } });
            createMesh({ geometry: useCubeGeometry() });
            view = createSpriteTexture({ width: 32, height: 32, sees: 'world' }, Eye);
            return createScene();
        });
        const pass = passFor(frameOf(store), view);

        expect((pass.drawables ?? []).map((item) => item.type)).toEqual(['mesh']);
        expect(pass.views3d?.[0]?.camera?.transform.z).toBe(5);
    });

    it('is refused filters when it does not see the world, and a kind that is not one', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            expect(() => createSpriteTexture({ width: 8, height: 8, hide: { tags: ['x'] } })).toThrow("hide and only choose what a view of the world takes in");
            expect(() => createSpriteTexture({ width: 8, height: 8, sees: 'world', hide: { kinds: ['sprites' as never] } })).toThrow("hide.kinds holds 'sprites', which is not a kind of drawing");
            return createScene();
        });
    });
});

describe('a scene whose world is off the screen', () => {
    it('has the screen draw only what is pinned, while its views and its particles go on', () => {
        const { store } = createTestGame();
        let view!: TTexture;
        let emitter!: ReturnType<typeof createParticles>;
        const Screens = (picture: TTexture) => {
            useScreenSpace();
            createSprite({ texture: picture, anchor: { x: 0, y: 0 } });
        };
        startTestScene(store, 'Level', () => {
            useWorldOffScreen();
            createSprite({ texture: HERO });
            emitter = createParticles({ effect: { kind: 'particles-2d', max: 50, life: 10, emission: { rate: 60, burst: 0, loop: true } } });
            view = createSpriteTexture({ width: 32, height: 32, sees: 'world' });
            useSpawn(Screens)(view);
            return createScene();
        });
        let ctx = frameOf(store);
        for (let i = 0; i < 29; i++) ctx = frameOf(store);

        expect((screenOf(ctx).drawables ?? []).map((item) => (item as TSprite).texture)).toEqual([view]);
        expect((passFor(ctx, view).drawables ?? []).map((item) => item.type).sort()).toEqual(['particles', 'sprite']);
        expect(particleCount(emitter)).toBeGreaterThanOrEqual(28);
    });
});

describe('a scene whose world is off the screen, watched by a monitor', () => {
    it('still shows the monitor its models', () => {
        const { store } = createTestGame();
        let monitor!: TTexture;
        const Eye = () => {
            useCamera3d({ projection: 'perspective', transform: { z: 5 } });
        };
        startTestScene(store, 'Level', () => {
            useWorldOffScreen();
            useCamera3d({ projection: 'perspective', transform: { z: 10 } });
            createMesh({ geometry: useCubeGeometry() });
            monitor = createSpriteTexture({ width: 32, height: 32, sees: '3d' }, Eye);
            return createScene();
        });
        const ctx = frameOf(store);

        expect((screenOf(ctx).drawables ?? []).map((item) => item.type)).toEqual([]);
        expect((passFor(ctx, monitor).drawables ?? []).map((item) => item.type)).toEqual(['mesh']);
    });
});

describe('a scene whose world is off the screen, looked at by a tool', () => {
    it('shows the world to a camera of its own, the editor\'s or a preview\'s, and not to the game\'s', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            useWorldOffScreen();
            createSprite({ texture: HERO });
            return createScene();
        });
        const keys = (pass: TRenderPass) => (pass.drawables ?? []).map((item) => (item as TSprite).texture?.key);

        expect(keys(screenOf(frameOf(store)))).toEqual([]);
        store.setState('viewport', { camera2d: createCamera2d() });
        expect(keys(screenOf(frameOf(store)))).toEqual(['hero']);
        store.setState('viewport', { camera2d: null });
        setCameraPreview(store, { canvas: { width: 320, height: 240 } as HTMLCanvasElement, camera2d: createCamera2d() });
        const ctx = frameOf(store);
        expect(keys(screenOf(ctx))).toEqual([]);
        expect(keys(ctx.passes.find((pass) => pass.targetCanvas !== undefined)!)).toEqual(['hero']);
    });
});

describe('views that show each other', () => {
    it('draws a view after the views it shows, and breaks a ring where the earliest made is', () => {
        const { store } = createTestGame();
        let a!: TTexture;
        let b!: TTexture;
        let c!: TTexture;
        const shows: TSprite[] = [];
        const Shows = () => {
            shows.push(createSprite({ width: 4, height: 4 }));
        };
        startTestScene(store, 'Level', () => {
            a = createSpriteTexture({ width: 8, height: 8 }, Shows);
            b = createSpriteTexture({ width: 8, height: 8 }, Shows);
            c = createSpriteTexture({ width: 8, height: 8 }, Shows);
            return createScene();
        });
        // a shows b, b shows a (a ring), c shows a.
        [shows[0]!.texture, shows[1]!.texture, shows[2]!.texture] = [b, a, a];
        const order = frameOf(store).passes.map((pass) => pass.renderTarget === a.gpu ? 'a' : pass.renderTarget === b.gpu ? 'b' : pass.renderTarget === c.gpu ? 'c' : 'screen');

        expect(order).toEqual(['a', 'b', 'c', 'screen']);
    });
});

describe('views that show each other, further', () => {
    const orderOf = (ctx: TFrameContext, named: Record<string, TTexture>) =>
        ctx.passes.map((pass) => Object.keys(named).find((name) => named[name]!.gpu === pass.renderTarget) ?? (pass === screenOf(ctx) ? 'screen' : 'soft'));

    it('breaks a ring at its own earliest made, not at one that only shows it', () => {
        const { store } = createTestGame();
        let a!: TTexture;
        let b!: TTexture;
        let c!: TTexture;
        const shows: TSprite[] = [];
        const Shows = () => {
            shows.push(createSprite({ width: 4, height: 4 }));
        };
        startTestScene(store, 'Level', () => {
            a = createSpriteTexture({ width: 8, height: 8 }, Shows);
            b = createSpriteTexture({ width: 8, height: 8 }, Shows);
            c = createSpriteTexture({ width: 8, height: 8 }, Shows);
            return createScene();
        });
        // a shows c; b and c show each other.
        [shows[0]!.texture, shows[1]!.texture, shows[2]!.texture] = [c, c, b];

        expect(orderOf(frameOf(store), { a, b, c })).toEqual(['b', 'c', 'a', 'screen']);
    });

    it('draws a picture before one that shows it under a soft mask', () => {
        const { store } = createTestGame();
        let outer!: TTexture;
        let inner!: TTexture;
        let masked!: TSprite;
        const Square = (x: number) => {
            useTransform({ x, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
            return createSprite({ width: 10, height: 10 });
        };
        const Outer = () => {
            const content = useSpawn(Square)(0);
            masked = content.api;
            useMask({ by: useSpawn(Square)(4), soft: true }).add(content);
        };
        startTestScene(store, 'Level', () => {
            outer = createSpriteTexture({ width: 16, height: 16 }, Outer);
            inner = createSpriteTexture({ width: 8, height: 8 });
            return createScene();
        });
        masked.texture = inner;

        expect(orderOf(frameOf(store), { outer, inner })).toEqual(['inner', 'soft', 'soft', 'outer', 'screen']);
    });
});

describe('resizing a picture', () => {
    it('keeps the same picture and makes it another size', () => {
        const { store } = createTestGame();
        let view!: TTexture;
        startTestScene(store, 'Level', () => {
            view = createSpriteTexture({ width: 32, height: 16, sees: 'world' });
            return createScene();
        });
        const before = view.gpu;

        resizeSpriteTexture(view, 64.8, 20);

        expect([view.width, view.height]).toEqual([64, 20]);
        expect(view.gpu).not.toBe(before);
        expect(store.get('assets').textures.get(view.key)).toBe(view);
        expect(() => resizeSpriteTexture(view, Infinity, 20)).toThrow('Give it two numbers; under 1 is taken as 1.');
    });

    it('goes with the object it is in: drawn no more, and off the card', () => {
        const { store } = createTestGame();
        let view!: TTexture;
        let piece!: ReturnType<ReturnType<typeof useSpawn>>;
        const Piece = () => {
            view = createSpriteTexture({ width: 32, height: 16, sees: 'world' });
        };
        startTestScene(store, 'Level', () => {
            createSprite({ texture: HERO });
            piece = useSpawn(Piece)();
            return createScene();
        });
        expect(passFor(frameOf(store), view)).toBeDefined();

        destroy(piece, { immediate: true });

        expect(frameOf(store).passes.some((pass) => pass.renderTarget !== undefined)).toBe(false);
        expect([view.status, view.gpu]).toEqual(['released', null]);
    });
});

describe("a view's coordinates", () => {
    const shownView = (spriteOptions: Record<string, unknown>, pinnedSprite = true) => {
        const { store } = createTestGame();
        let view!: TTexture;
        let shown!: TSprite;
        const Minimap = () => {
            const own = useCamera2d({ zoom: 0.25 });
            own.transform.x = -40;
            own.transform.y = 10;
        };
        const Hud = (picture: TTexture) => {
            if (pinnedSprite) useScreenSpace();
            shown = createSprite({ texture: picture, ...spriteOptions });
        };
        startTestScene(store, 'Level', () => {
            const camera = useCamera2d();
            camera.transform.x = 500;
            view = createSpriteTexture({ width: 96, height: 64, sees: 'world' }, Minimap);
            useSpawn(Hud)(view);
            return createScene();
        });
        return { store, view, shown };
    };

    it('turns the middle of the sprite into what the view sees there, through its camera', () => {
        const { shown } = shownView({ transform: { x: 100, y: 50 } });

        const at = viewToWorld(shown, { x: 100, y: 50 });

        expect(at.inside).toBe(true);
        expect(at.picture).toEqual({ x: 48, y: 32 });
        // 48 and 32 pixels at a quarter, from the camera's corner at (-40, 10).
        expect([at.x, at.y]).toEqual([152, 138]);
    });

    it('takes the pointer as it is: its screen pixels for a pinned sprite, the world for one in it', () => {
        const pinnedOne = shownView({ transform: { x: 100, y: 50 } });
        const info = { screenX: 100, screenY: 50, worldX: 600, worldY: 50 } as never;
        expect(viewToWorld(pinnedOne.shown, info).picture).toEqual({ x: 48, y: 32 });

        // In the world, under a camera at x 500: the screen's 100 is the world's 600.
        const inWorld = shownView({ transform: { x: 600, y: 50 } }, false);
        expect(viewToWorld(inWorld.shown, info).picture).toEqual({ x: 48, y: 32 });
    });

    it('goes there and back, grown, turned, mirrored and held by its corner', () => {
        const { shown } = shownView({ transform: { x: 80, y: 40, rotation: 0.6, scaleX: 1.5, scaleY: 0.75 }, flipX: true, anchor: { x: 0, y: 0 } });
        const world = { x: 150, y: 120 };

        const there = worldToView(shown, world);
        const back = viewToWorld(shown, there);

        expect(there.inside).toBe(true);
        expect(back.x).toBeCloseTo(world.x, 6);
        expect(back.y).toBeCloseTo(world.y, 6);
    });

    it('says where a point off the view would be, and the edge in its direction', () => {
        const { shown } = shownView({ transform: { x: 100, y: 50 } });

        // Far to the right of what the view takes in: 96 pixels at a quarter reach x 344.
        const off = worldToView(shown, { x: 1000, y: 138 });

        expect(off.inside).toBe(false);
        expect(off.x).toBeGreaterThan(148);
        // On the right edge of the sprite, level with its middle.
        expect(off.edge.x).toBeCloseTo(148, 6);
        expect(off.edge.y).toBeCloseTo(50, 6);
        expect(viewToWorld(shown, { x: 400, y: 400 }).inside).toBe(false);
    });

    it('gives the ray of the view\'s 3D camera through the point', () => {
        const { store } = createTestGame();
        let shown!: TSprite;
        const Eye = () => {
            useCamera3d({ projection: 'perspective', transform: { x: 3, z: 10 } });
        };
        const Hud = (picture: TTexture) => {
            useScreenSpace();
            shown = createSprite({ texture: picture, transform: { x: 100, y: 50 } });
        };
        startTestScene(store, 'Level', () => {
            useCamera3d({ projection: 'perspective', transform: { z: 4 } });
            const view = createSpriteTexture({ width: 64, height: 64, sees: 'world' }, Eye);
            useSpawn(Hud)(view);
            return createScene();
        });

        const ray = viewToRay(shown, { x: 100, y: 50 });

        expect(ray.inside).toBe(true);
        expect(ray.origin.x).toBeCloseTo(3, 4);
        expect(ray.direction.z).toBeCloseTo(-1, 4);
    });

    it('refuses a sprite that shows no picture', () => {
        const { store } = createTestGame();
        let plain!: TSprite;
        startTestScene(store, 'Level', () => {
            plain = createSprite({ texture: HERO });
            return createScene();
        });
        expect(() => viewToWorld(plain, { x: 0, y: 0 })).toThrow('[NacatamalOn] viewToWorld: this sprite does not show a picture made with createSpriteTexture');
    });
});

describe('a view in a scene document', () => {
    it('comes back seeing the world, with its tags and kinds, and its scene with the world off the screen', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { store } = createTestGame();
        startTestScene(store, 'S', () => {
            useWorldOffScreen();
            const boss = createSprite({ texture: HERO });
            createSpriteTexture({ width: 32, height: 16, key: 'map', sees: 'world', hide: { tags: ['secret'], kinds: ['particles'], objects: [boss] }, only: { objects: [boss] } }, () => {
                useCamera2d({ zoom: 0.5 });
            });
            return createScene();
        });
        const doc = serializeScene(store.get('world').scenes[0]!);
        const written = doc.root.children.flatMap((node) => node.components).find((c) => c.type === 'sprite-texture');

        // The objects named are left behind, and said; an only that named nothing else with them is
        // kept, naming nothing, so it still takes in nothing.
        expect(written).toEqual({ type: 'sprite-texture', id: expect.any(String), key: 'map', width: 32, height: 16, background: { r: 0, g: 0, b: 0, a: 1 }, sees: 'world', hide: { tags: ['secret'], kinds: ['particles'] }, only: {} });
        expect(warn.mock.calls.filter((call) => String(call[0]).includes('names objects in its')).length).toBe(2);
        expect(doc.root.worldOffScreen).toBe(true);

        const again = createTestGame().store;
        registerScene(again, 'T', sceneFromDoc(parseSceneDoc(JSON.parse(JSON.stringify(doc)), 'x.scene')));
        const root = startScene(again, 'T');
        const box = root.children.find((child) => child.spriteTexture !== null)!;

        expect(box.spriteTexture!.sees).toBe('world');
        expect(box.spriteTexture!.hide).toEqual({ tags: ['secret'], kinds: ['particles'] });
        expect(box.spriteTexture!.only).toEqual({});
        expect(root.worldOffScreen).toBe(true);
        expect(serializeScene(root)).toEqual(doc);

        // A kind this version does not know is said and left out, not the whole scene refused.
        const read = parseSceneDoc({ ...JSON.parse(JSON.stringify(doc)), root: { ...doc.root, children: [{ ...doc.root.children[1], components: [{ ...written, hide: { kinds: ['sparkles', 'text'] } }] }] } }, 'y.scene');
        expect((read.root.children[0]!.components[0] as { hide?: unknown }).hide).toEqual({ kinds: ['text'] });
        expect(warn.mock.calls.some((call) => String(call[0]).includes("names the kind \"sparkles\""))).toBe(true);
    });
});

describe('a view that takes in nothing yet', () => {
    it('draws nothing of the world, and keeps it so through a document', () => {
        const { store } = createTestGame();
        let view!: TTexture;
        startTestScene(store, 'S', () => {
            createSprite({ texture: HERO });
            // A map of the zones found so far: none at the start.
            view = createSpriteTexture({ width: 32, height: 16, key: 'map', sees: 'world', only: { tags: [] } });
            return createScene();
        });
        expect(passFor(frameOf(store), view).drawables ?? []).toEqual([]);

        const doc = serializeScene(store.get('world').scenes[0]!);
        const read = parseSceneDoc(JSON.parse(JSON.stringify(doc)), 'x.scene');
        const component = read.root.children.flatMap((node) => node.components).find((c) => c.type === 'sprite-texture');
        expect((component as { only?: unknown }).only).toEqual({});
    });
});

describe('what a view draws itself', () => {
    it('goes through the camera its world is seen through, the scene\'s when it has none, and what it pins stays on its pixels', () => {
        const { store } = createTestGame();
        let view!: TTexture;
        const Label = () => {
            useScreenSpace();
            createSprite({ texture: keyed('label') });
        };
        const Marker = () => {
            createSprite({ texture: keyed('marker'), transform: { x: 30, y: 0 } });
            useSpawn(Label)();
        };
        startTestScene(store, 'S', () => {
            const camera = useCamera2d();
            camera.transform.x = 20;
            createSprite({ texture: HERO, transform: { x: 30, y: 0 } });
            view = createSpriteTexture({ width: 64, height: 32, sees: 'world' }, Marker);
            return createScene();
        });
        const pass = passFor(frameOf(store), view);
        const cameraOf = (key: string) => {
            const i = (pass.drawables ?? []).findIndex((item) => (item as TSprite).texture?.key === key);
            const index = pass.cameraIndex![i]!;
            return index < 0 ? null : pass.cameras![index]!.transform.x;
        };

        expect(cameraOf('hero')).toBe(20);
        expect(cameraOf('marker')).toBe(20);
        expect(cameraOf('label')).toBeNull();
    });

    it('puts its own models in the fog of the world it looks at, and a monitor in it looks through its 3D camera', () => {
        const { store } = createTestGame();
        let view!: TTexture;
        let monitor!: TTexture;
        const Inside = () => {
            createMesh({ geometry: useCubeGeometry() });
            monitor = createSpriteTexture({ width: 16, height: 16, sees: '3d' });
        };
        startTestScene(store, 'S', () => {
            useCamera3d({ projection: 'perspective', transform: { z: 10 } });
            useFog({ color: 'black' });
            createMesh({ geometry: useCubeGeometry() });
            view = createSpriteTexture({ width: 64, height: 32, sees: 'world' }, Inside);
            return createScene();
        });
        const ctx = frameOf(store);
        const views = passFor(ctx, view).views3d ?? [];

        expect(views.length).toBe(2);
        expect(views.every((one) => one.fog !== null && one.fog === views[0]!.fog)).toBe(true);
        expect(passFor(ctx, monitor).views3d?.[0]?.camera?.transform.z).toBe(10);
    });
});

describe('the light on what a view makes itself', () => {
    /** A lit level with a model, and a picture that makes a model of its own and maybe a lamp. */
    const lit = (sees: 'world' | 'inside', ownLamp: boolean) => {
        const { store } = createTestGame();
        let picture!: TTexture;
        const Own = () => {
            useCamera3d({ projection: 'perspective', transform: { z: 10 } });
            if (ownLamp) {
                useDirectionalLight({ intensity: 0.3 });
            }
            createMesh({ geometry: useCubeGeometry() });
        };
        startTestScene(store, 'S', () => {
            useCamera3d({ projection: 'perspective', transform: { z: 10 } });
            useDirectionalLight({ intensity: 0.7 });
            createMesh({ geometry: useCubeGeometry() });
            picture = createSpriteTexture({ width: 32, height: 32, sees }, Own);
            return createScene();
        });
        const views = passFor(frameOf(store), picture).views3d ?? [];
        // What the picture makes itself is its last 3D view.
        return views[views.length - 1]!.lights.map((light) => light.intensity);
    };

    it('in a view of the world, is the scene\'s lamps, unless the view brings its own', () => {
        expect(lit('world', false)).toEqual([0.7]);
        expect(lit('world', true)).toEqual([0.3]);
    });

    it('lights what the view makes with the scene\'s lamps without casting from them a second time', () => {
        const { store } = createTestGame();
        let main!: TTexture;
        let mini!: TTexture;
        const Main = () => {
            useCamera3d({ projection: 'perspective', transform: { z: 10 } });
        };
        const Mini = () => {
            useCamera3d({ projection: 'orthographic', transform: { z: 20 } });
            createMesh({ geometry: useCubeGeometry() });
        };
        startTestScene(store, 'S', () => {
            useWorldOffScreen();
            useDirectionalLight({ castShadow: true });
            createMesh({ geometry: useCubeGeometry() });
            main = createSpriteTexture({ width: 32, height: 32, sees: 'world' }, Main);
            mini = createSpriteTexture({ width: 32, height: 32, sees: 'world', only: { tags: ['marker'] } }, Mini);
            return createScene();
        });
        const ctx = frameOf(store);

        const cast = findShadowSources(ctx).map((source) => source.view);

        // The view of the world has its shadow, around its own camera. The minimap shows only its
        // markers, so it has no view of the world's models, and what it makes itself is lit by the
        // sun and casts nothing of its own.
        expect(cast).toEqual([passFor(ctx, main).views3d![0]!]);
        expect(cast).not.toContain(passFor(ctx, mini).views3d![0]!);
    });

    it('in a picture of its own world, is only what is in it', () => {
        expect(lit('inside', false)).not.toContain(0.7);
        expect(lit('inside', true)).toEqual([0.3]);
    });
});

describe('a capture of a scene whose world is off the screen', () => {
    it('is the screen when it looks through the game\'s cameras, and the world through another', () => {
        const { store, renderer } = createTestGame({}, createFakeCanvas(320, 224));
        let view!: TTexture;
        const Screens = (picture: TTexture) => {
            useScreenSpace();
            createSprite({ texture: picture, anchor: { x: 0, y: 0 } });
        };
        startTestScene(store, 'Level', () => {
            useWorldOffScreen();
            createSprite({ texture: HERO });
            view = createSpriteTexture({ width: 32, height: 32, sees: 'world' });
            useSpawn(Screens)(view);
            return createScene();
        });
        const targets: ITexture[] = [];
        renderer.createRenderTexture = () => {
            const texture: ITexture = { resourceType: 'texture' };
            targets.push(texture);
            return texture;
        };
        const captured = () => {
            const ctx = frameOf(store);
            const pass = ctx.passes.find((one) => one.renderTarget === targets[targets.length - 1])!;
            store.setState('capture', { request: null });
            return (pass.drawables ?? []).map((item) => (item as TSprite).texture?.key);
        };

        void captureScreen(store).catch(() => {});
        expect(captured()).toEqual([view.key]);
        void captureScreen(store, { camera2d: createCamera2d() }).catch(() => {});
        expect(captured()).toEqual(['hero', view.key]);
    });
});

describe('a camera following inside a view', () => {
    it('centres on what it follows in the view, not on the screen', () => {
        const { store } = createTestGame();
        let view!: TTexture;
        let own!: TCamera2d;
        const Half = (who: TSprite) => {
            own = useCamera2d();
            useCameraFollow(who);
        };
        startTestScene(store, 'Level', () => {
            const who = createSprite({ texture: HERO, transform: { x: 500, y: 300 } });
            view = createSpriteTexture({ width: 100, height: 60, sees: 'world' }, Half, who);
            return createScene();
        });
        const ctx = newFrame();
        for (let i = 0; i < 3; i++) tick(store, ctx, (i * 1000) / 60, i === 0 ? 0 : ((i - 1) * 1000) / 60);

        // Half of 100 by 60 back from (500, 300), not half of the screen.
        expect([own.transform.x, own.transform.y]).toEqual([450, 270]);
        expect(view.width).toBe(100);
    });
});

describe('a 2D camera skipping for another', () => {
    it('leaves out what the other camera does not see on the screen', () => {
        const { store } = createTestGame();
        let view!: TTexture;
        let eye!: TCamera2d;
        const Window = () => {
            const above = useCamera2d({ zoom: 0.125, transform: { x: -1000, y: -1000 } });
            above.cullingCamera = eye;
        };
        startTestScene(store, 'Level', () => {
            eye = useCamera2d();
            createSprite({ texture: keyed('near'), transform: { x: 100, y: 100 } });
            createSprite({ texture: keyed('edge'), transform: { x: 300, y: 200 } });
            createSprite({ texture: keyed('far'), transform: { x: 900, y: 100 } });
            view = createSpriteTexture({ width: 40, height: 30, sees: 'world' }, Window);
            return createScene();
        });
        const keys = () => (passFor(frameOf(store), view).drawables ?? []).map((item) => (item as TSprite).texture?.key).sort();

        // Over the screen (320 by 224 here), not over the 40 by 30 of the window.
        expect(keys()).toEqual(['edge', 'near']);
        eye.transform.x = 700;
        expect(keys()).toEqual(['far']);
    });
});
