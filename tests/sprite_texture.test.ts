import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createMesh } from '../src/gameobjects/mesh';
import { createSpriteTexture } from '../src/gameobjects/sprite_texture';
import { useCubeGeometry } from '../src/hooks';
import { useCamera2d } from '../src/hooks/camera/use_camera_2d';
import { useCamera3d } from '../src/hooks/camera/use_camera_3d';
import { useLight } from '../src/hooks/light/use_light';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { destroy } from '../src/destroy/destroy';
import { flushDestroyed } from '../src/destroy/flush_destroyed';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { pickTargets } from '../src/input/pick_targets';
import { findShadowSource } from '../src/render/shared/light_space';
import { parseSceneDoc, sceneFromDoc, serializeScene } from '../src/scene/document';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { stopScene } from '../src/scene/stop_scene';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TBox } from '../src/box';
import type { TFrameContext, TRenderPass } from '../src/render';
import type { TTexture } from '../src/loaders';
import type { TRuntimeStore } from '../src/store';
import type { TSceneDoc } from '../src/scene/document';
import { SCENE_FORMAT } from '../src/scene/document/types/t_scene_doc';

/**
 * Part of a scene drawn into a picture instead of the screen.
 *
 * Everything here reads the frame the renderer would be handed, because that is where the promise
 * is kept: which passes there are, in what order, and what each one holds. Whether the pixels come
 * out right is the browser's question.
 */

const newFrame = (): TFrameContext => ({ passes: [{}], time: 0, progress: 0, phase: 0 });

/**
 * One frame of the game, as the renderer would get it.
 */
const frameOf = (store: TRuntimeStore, ctx: TFrameContext = newFrame()): TFrameContext => {
    fillFrameContext(store, ctx, 1 / 60);
    return ctx;
};

/**
 * The screen's pass, which the rest of the engine promises is the last one.
 */
const screenOf = (ctx: TFrameContext): TRenderPass => ctx.passes[ctx.passes.length - 1];

/**
 * The pass that draws into `texture`, if the frame has one.
 */
const passFor = (ctx: TFrameContext, texture: TTexture): TRenderPass | undefined =>
    ctx.passes.find((pass) => pass.renderTarget === texture.gpu);

/**
 * Which picture each pass draws into, by name, and `'screen'` for the screen. By name because the
 * fake renderer's pictures are all alike: compared by what they hold, any order would pass.
 */
const orderOf = (ctx: TFrameContext, named: Record<string, TTexture>): string[] =>
    ctx.passes.map((pass) => pass.renderTarget === undefined
        ? 'screen'
        : Object.keys(named).find((name) => named[name].gpu === pass.renderTarget) ?? '?');

/**
 * That `list` holds exactly these objects, in this order: the very ones, not ones that look alike.
 */
const holds = (list: readonly unknown[] | undefined, ...expected: unknown[]): void => {
    expect(list).toHaveLength(expected.length);
    expected.forEach((item, i) => expect(list![i]).toBe(item));
};

/**
 * The box a picture's component was made in.
 */
const pictureBox = (scene: TBox): TBox => scene.children.find((box) => box.spriteTexture !== null)!;

const block = (width = 10, height = 10) => createSprite({ width, height });

describe('createSpriteTexture', () => {
    it('gives back a picture that is ready at once and listed by its key', () => {
        const { store } = createTestGame();
        let picture!: TTexture;
        startTestScene(store, 'S', () => {
            picture = createSpriteTexture({ width: 128.7, height: 0.2, key: 'screen' });
            return createScene();
        });

        expect(picture.status).toBe('ready');
        expect(picture.gpu).not.toBeNull();
        // Rounded down, and never nothing.
        expect([picture.width, picture.height]).toEqual([128, 1]);
        expect(store.get('assets').textures.get('screen')).toBe(picture);
    });

    it('clears to opaque black and makes up a key of its own when none is given', () => {
        const { store } = createTestGame();
        let a!: TTexture;
        let b!: TTexture;
        const scene = startTestScene(store, 'S', () => {
            a = createSpriteTexture({ width: 8, height: 8 });
            b = createSpriteTexture({ width: 8, height: 8 });
            return createScene();
        });

        expect(a.key).not.toBe(b.key);
        expect(a.gpu).not.toBe(b.gpu);
        expect(pictureBox(scene).spriteTexture!.background).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    });

    it('runs the component as a part of the scene of its own, with the arguments it was given', () => {
        const { store } = createTestGame();
        const seen: number[] = [];
        const Screen = (n: number) => {
            seen.push(n);
        };
        const scene = startTestScene(store, 'S', () => {
            createSpriteTexture({ width: 8, height: 8 }, Screen, 7);
            return createScene();
        });

        expect(seen).toEqual([7]);
        expect(pictureBox(scene).name).toBe('Screen');
        expect(pictureBox(scene).parent).toBe(scene);
    });

    it('refuses a key that already names a loaded image', () => {
        const { store } = createTestGame();
        store.get('assets').textures.set('hero', { type: 'texture', key: 'hero', src: '/hero.png', width: 8, height: 8, status: 'ready', gpu: { resourceType: 'texture' } });

        expect(() => startTestScene(store, 'S', () => {
            createSpriteTexture({ width: 8, height: 8, key: 'hero' });
            return createScene();
        })).toThrow(/hero/);
    });

    it('gives the same picture back for the same key and size, so a restarted scene makes no new one', () => {
        const { store, renderer } = createTestGame();
        let made = 0;
        const make = renderer.createRenderTexture;
        renderer.createRenderTexture = (width, height) => {
            made++;
            return make(width, height);
        };
        const pictures: TTexture[] = [];
        const body = () => {
            pictures.push(createSpriteTexture({ width: 8, height: 8, key: 'tv' }));
            return createScene();
        };

        startTestScene(store, 'A', body);
        startTestScene(store, 'B', body);
        startTestScene(store, 'C', () => {
            pictures.push(createSpriteTexture({ width: 16, height: 8, key: 'tv' }));
            return createScene();
        });

        expect(made).toBe(2);
        expect(pictures[1]).toBe(pictures[0]);
        // Another size is another picture.
        expect(pictures[2]).not.toBe(pictures[0]);
        expect(store.get('assets').textures.get('tv')).toBe(pictures[2]);
    });
});

describe('the passes of a frame with pictures', () => {
    it('draws the picture before the screen, into the picture, cleared to its background', () => {
        const { store } = createTestGame();
        let picture!: TTexture;
        startTestScene(store, 'S', () => {
            picture = createSpriteTexture({ width: 64, height: 32, background: { r: 0, g: 1, b: 0, a: 1 } }, block);
            return createScene();
        });

        const ctx = frameOf(store);

        expect(ctx.passes).toHaveLength(2);
        expect(ctx.passes[0].renderTarget).toBe(picture.gpu!);
        expect(ctx.passes[0].clearColor).toEqual({ r: 0, g: 1, b: 0, a: 1 });
        expect(ctx.passes[0].postProcess).toBe(false);
        expect(screenOf(ctx).renderTarget).toBeUndefined();
        expect(screenOf(ctx).postProcess).toBe(true);
    });

    it('keeps the screen pass it was given, so a frame with no pictures is what it always was', () => {
        const { store } = createTestGame();
        startTestScene(store, 'S', () => {
            block();
            return createScene();
        });
        const ctx = newFrame();
        const screen = ctx.passes[0];

        frameOf(store, ctx);
        frameOf(store, ctx);

        expect(ctx.passes).toEqual([screen]);
    });

    it('puts what the component draws in the picture, and nothing of it on the screen', () => {
        const { store } = createTestGame();
        let inside!: ReturnType<typeof createSprite>;
        let outside!: ReturnType<typeof createSprite>;
        let picture!: TTexture;
        startTestScene(store, 'S', () => {
            outside = block();
            picture = createSpriteTexture({ width: 64, height: 64 }, () => {
                // A child of the component, too: everything under it belongs to the picture.
                useSpawn(() => {
                    inside = block();
                })();
            });
            return createScene();
        });

        const ctx = frameOf(store);

        holds(passFor(ctx, picture)!.drawables, inside);
        holds(screenOf(ctx).drawables, outside);
    });

    it('draws a picture found inside another before the one it is in', () => {
        const { store } = createTestGame();
        let outer!: TTexture;
        let inner!: TTexture;
        startTestScene(store, 'S', () => {
            outer = createSpriteTexture({ width: 8, height: 8 }, () => {
                inner = createSpriteTexture({ width: 4, height: 4 }, block);
            });
            return createScene();
        });

        const ctx = frameOf(store);

        expect(orderOf(ctx, { inner, outer })).toEqual(['inner', 'outer', 'screen']);
    });

    it('draws a switched off screen empty, and a screen inside a hidden part not at all', () => {
        const { store } = createTestGame();
        let off!: TTexture;
        let buried!: TTexture;
        const scene = startTestScene(store, 'S', () => {
            off = createSpriteTexture({ width: 8, height: 8 }, block);
            useSpawn(() => {
                buried = createSpriteTexture({ width: 8, height: 8 }, block);
            })().visible = false;
            return createScene();
        });
        pictureBox(scene).visible = false;

        const ctx = frameOf(store);

        expect(passFor(ctx, off)!.drawables).toEqual([]);
        expect(passFor(ctx, buried)).toBeUndefined();
    });

    it('stops drawing a picture whose component was destroyed', () => {
        const { store } = createTestGame();
        const scene = startTestScene(store, 'S', () => {
            createSpriteTexture({ width: 8, height: 8, key: 'tv' }, block);
            return createScene();
        });

        destroy(pictureBox(scene));
        flushDestroyed(store);

        expect(frameOf(store).passes).toHaveLength(1);
        // Kept, so the next scene that asks for it by name gets this picture back.
        expect(store.get('assets').textures.has('tv')).toBe(true);
    });

    it('lets go of a picture with no name when its component is destroyed: nobody can ask for it again', () => {
        const { store, renderer } = createTestGame();
        let picture!: TTexture;
        const scene = startTestScene(store, 'S', () => {
            picture = createSpriteTexture({ width: 8, height: 8 }, block);
            // Something still showing it after it has gone draws nothing rather than a dead texture.
            createMesh({ geometry: useCubeGeometry(), texture: picture });
            return createScene();
        });
        const gpu = picture.gpu;

        destroy(pictureBox(scene));
        flushDestroyed(store);

        expect(renderer.destroyedTextures).toEqual([gpu!]);
        expect(picture.gpu).toBeNull();
        expect(store.get('assets').textures.has(picture.key)).toBe(false);
        expect(frameOf(store).passes).toHaveLength(1);
    });

    it('lets go of a picture with no name when its scene stops, so restarting does not pile them up', () => {
        const { store, renderer } = createTestGame();
        const pictures: TTexture[] = [];
        const body = () => {
            pictures.push(createSpriteTexture({ width: 8, height: 8 }));
            return createScene();
        };
        registerScene(store, 'Room', body);

        for (let restart = 0; restart < 3; restart++) {
            startScene(store, 'Room');
            stopScene(store, 'Room');
        }

        expect(pictures).toHaveLength(3);
        expect(renderer.destroyedTextures).toHaveLength(3);
        expect(pictures.every((picture) => picture.gpu === null)).toBe(true);
    });

    it('keeps a picture with a name when its component goes, for whoever asks for that name next', () => {
        const { store, renderer } = createTestGame();
        const scene = startTestScene(store, 'S', () => {
            createSpriteTexture({ width: 8, height: 8, key: 'tv' }, block);
            return createScene();
        });

        destroy(pictureBox(scene));
        flushDestroyed(store);

        expect(renderer.destroyedTextures).toEqual([]);
        expect(store.get('assets').textures.get('tv')!.gpu).not.toBeNull();
    });

    it('still finds what is under the pointer on the screen', () => {
        const { store } = createTestGame();
        let button!: ReturnType<typeof createSprite>;
        startTestScene(store, 'S', () => {
            createSpriteTexture({ width: 320, height: 224 }, () => block(320, 224));
            button = createSprite({ width: 20, height: 20, anchor: { x: 0, y: 0 }, transform: { x: 100, y: 50, rotation: 0, scaleX: 1, scaleY: 1 } });
            return createScene();
        });

        holds(pickTargets(store, 105, 55), button);
    });
});

describe('the world inside a picture', () => {
    it('keeps a camera asked for inside the picture, and leaves the scene its own', () => {
        const { store } = createTestGame();
        let world!: ReturnType<typeof useCamera2d>;
        let screenCamera!: ReturnType<typeof useCamera2d>;
        let deep!: ReturnType<typeof useCamera3d>;
        let picture!: TTexture;
        const scene = startTestScene(store, 'S', () => {
            world = useCamera2d();
            picture = createSpriteTexture({ width: 8, height: 8 }, () => {
                screenCamera = useCamera2d({ x: 50 });
                deep = useCamera3d({ projection: 'perspective' });
                block();
            });
            return createScene();
        });

        expect(scene.camera2d).toBe(world);
        expect(scene.camera3d).toBeNull();
        expect(pictureBox(scene).camera2d).toBe(screenCamera);
        expect(pictureBox(scene).camera3d).toBe(deep);

        const ctx = frameOf(store);
        holds(passFor(ctx, picture)!.cameras, screenCamera);
        expect(passFor(ctx, picture)!.cameraIndex).toEqual([0]);
        holds(screenOf(ctx).cameras, world);
    });

    it('lights the picture with its own lamps, and the scene with the scene\'s', () => {
        const { store } = createTestGame();
        let picture!: TTexture;
        startTestScene(store, 'S', () => {
            const cube = useCubeGeometry();
            useLight({ intensity: 0.25 });
            createMesh({ geometry: cube });
            picture = createSpriteTexture({ width: 8, height: 8 }, () => {
                useLight({ intensity: 0.75 });
                createMesh({ geometry: cube });
            });
            return createScene();
        });

        const ctx = frameOf(store);
        // Told apart by how bright they are, which is all of them the renderer is handed.
        const lightsOf = (pass: TRenderPass) => pass.views3d!.flatMap((view) => view.lights.map((light) => light.intensity));

        expect(lightsOf(passFor(ctx, picture)!)).toEqual([0.75]);
        expect(lightsOf(screenOf(ctx))).toEqual([0.25]);
    });

    it('does not take the shadow from the screen when both ask for one', () => {
        const { store } = createTestGame();
        startTestScene(store, 'S', () => {
            const cube = useCubeGeometry();
            useLight({ castShadow: true, intensity: 0.25 });
            createMesh({ geometry: cube });
            createSpriteTexture({ width: 8, height: 8 }, () => {
                useLight({ castShadow: true, intensity: 0.75 });
                createMesh({ geometry: cube });
            });
            return createScene();
        });

        expect(findShadowSource(frameOf(store))!.light.intensity).toBe(0.25);
    });
});

describe('a picture that sees the scene', () => {
    /**
     * A room with a model, a flat sprite, a monitor showing the camera, and the camera.
     */
    const room = () => {
        const { store } = createTestGame();
        const made: {
            model?: ReturnType<typeof createMesh>;
            monitor?: ReturnType<typeof createMesh>;
            flat?: ReturnType<typeof createSprite>;
            rec?: ReturnType<typeof createSprite>;
            camera?: ReturnType<typeof useCamera3d>;
            feed?: TTexture;
            handheld?: TTexture;
        } = {};
        startTestScene(store, 'S', () => {
            const cube = useCubeGeometry();
            useCamera3d({ projection: 'perspective', z: 5 });
            made.handheld = createSpriteTexture({ width: 8, height: 8 }, block);
            made.model = createMesh({ geometry: cube, texture: made.handheld });
            made.flat = block();
            made.feed = createSpriteTexture({ width: 16, height: 16, sees: 'scene' }, () => {
                made.camera = useCamera3d({ projection: 'perspective', y: 5 });
                made.rec = block(4, 4);
            });
            made.monitor = createMesh({ geometry: cube, texture: made.feed });
            return createScene();
        });
        return { store, ...made } as Required<typeof made> & { store: TRuntimeStore };
    };

    it('shows the scene\'s models from its own camera, with what it draws on top', () => {
        const { store, model, rec, camera, feed } = room();

        const pass = passFor(frameOf(store), feed)!;

        holds(pass.drawables, model, rec);
        expect(pass.views3d![pass.viewIndex![0]].camera).toBe(camera);
    });

    it('leaves out the flat part of the scene, and the monitor that shows it', () => {
        const { store, flat, monitor, feed } = room();

        const drawn = passFor(frameOf(store), feed)!.drawables!;

        expect(drawn).not.toContain(flat);
        expect(drawn).not.toContain(monitor);
    });

    it('is drawn after the pictures with a world of their own, so it sees them this frame', () => {
        const { store, feed, handheld } = room();

        expect(orderOf(frameOf(store), { handheld, feed })).toEqual(['handheld', 'feed', 'screen']);
    });

    it('looks through the scene\'s camera when it has none of its own', () => {
        const { store } = createTestGame();
        let scene!: ReturnType<typeof useCamera3d>;
        let feed!: TTexture;
        startTestScene(store, 'S', () => {
            scene = useCamera3d({ projection: 'perspective', z: 5 });
            createMesh({ geometry: useCubeGeometry() });
            feed = createSpriteTexture({ width: 8, height: 8, sees: 'scene' });
            return createScene();
        });

        const pass = passFor(frameOf(store), feed)!;

        holds(pass.views3d!.map((view) => view.camera), scene);
    });
});

describe('a picture in a scene document', () => {
    it('comes back from a file drawn into the same picture, with the model showing it', () => {
        const { store } = createTestGame();
        startTestScene(store, 'S', () => {
            const tv = createSpriteTexture({ width: 32, height: 16, key: 'tv', background: { r: 1, g: 0, b: 0, a: 1 }, sees: 'scene' }, () => {
                useCamera2d({ x: 3 });
                block();
            });
            createMesh({ geometry: useCubeGeometry(), texture: tv });
            return createScene();
        });
        const doc = serializeScene(store.get('world').scenes[0]);
        const written = doc.root.children.find((node) => node.components.some((c) => c.type === 'sprite-texture'))!;

        // First on its object, ahead of the camera it owns.
        expect(written.components.map((c) => c.type)).toEqual(['sprite-texture', 'camera2d', 'sprite']);
        expect(written.components[0]).toEqual({ type: 'sprite-texture', id: expect.any(String), key: 'tv', width: 32, height: 16, background: { r: 1, g: 0, b: 0, a: 1 }, sees: 'scene' });

        const again = createTestGame().store;
        registerScene(again, 'T', sceneFromDoc(parseSceneDoc(JSON.parse(JSON.stringify(doc)), 'x.scene')));
        const root = startScene(again, 'T');

        const picture = again.get('assets').textures.get('tv')!;
        const box = pictureBox(root);
        expect(box.spriteTexture!.texture).toBe(picture);
        expect(box.spriteTexture!.sees).toBe('scene');
        expect(box.camera2d!.transform.x).toBe(3);
        expect(root.camera2d).toBeNull();
        const model = root.drawables.find((d) => d.type === 'mesh') as ReturnType<typeof createMesh>;
        expect(model.material.texture).toBe(picture);
        expect(serializeScene(root)).toEqual(doc);
    });

    it('is made before the objects, so a camera written ahead of it and a model earlier in the file both find it', () => {
        const { store } = createTestGame();
        startTestScene(store, 'S', () => {
            // The model on the scene itself, which is written before any object under it.
            createMesh({ geometry: useCubeGeometry(), texture: createSpriteTexture({ width: 8, height: 8, key: 'tv' }, () => {
                useCamera2d({ x: 9 });
            }) });
            return createScene();
        });
        const doc = JSON.parse(JSON.stringify(serializeScene(store.get('world').scenes[0]))) as TSceneDoc;
        const screen = doc.root.children[0];
        // The camera first, the way somebody editing the file by hand could leave it.
        screen.components.reverse();
        expect(screen.components.map((c) => c.type)).toEqual(['camera2d', 'sprite-texture']);

        const again = createTestGame().store;
        registerScene(again, 'x', sceneFromDoc(parseSceneDoc(doc, 'x.scene')));
        const root = startScene(again, 'x');

        const model = root.drawables.find((d) => d.type === 'mesh') as ReturnType<typeof createMesh>;
        expect(model.material.texture).toBe(again.get('assets').textures.get('tv')!);
        expect(root.camera2d).toBeNull();
        expect(pictureBox(root).camera2d!.transform.x).toBe(9);
    });

    it('sets aside a picture with no name or no size rather than guess one', () => {
        const doc = parseSceneDoc({
            format: SCENE_FORMAT,
            version: 1,
            name: 'x',
            assets: [],
            root: {
                id: 'root', name: 'root', transform: null, children: [],
                components: [{ type: 'sprite-texture', id: 'p', width: 8, height: 8 }],
            },
        }, 'x.scene');

        expect(doc.root.components).toEqual([]);
    });
});
