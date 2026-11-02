import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createMesh } from '../src/gameobjects/mesh/create_mesh';
import { useCubeGeometry } from '../src/hooks';
import { useCamera3d } from '../src/hooks';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { parseSceneDoc, sceneFromDoc, serializeScene } from '../src/scene/document';
import { isTransparentMesh } from '../src/render/shared/is_transparent_mesh';
import { createTestGame, startTestScene } from './helpers/test_game';
import { createParticles3d } from '../src/gameobjects/particles';
import { createSpriteTexture } from '../src/gameobjects/sprite_texture';
import { useWorldOffScreen } from '../src/hooks/camera/use_world_off_screen';
import type { TTexture } from '../src/loaders';
import { newParticlesFile } from '../src/loaders/particles/new_particles_file';
import { parseParticlesDoc } from '../src/loaders/particles/parse_particles_doc';
import type { TMesh } from '../src/gameobjects/mesh/types/t_mesh';
import type { TFrameContext } from '../src/render';
import type { TRuntimeStore } from '../src/store';

/**
 * See-through models, and the order they are handed to the renderer in.
 *
 * A see-through model blends over what is already drawn and writes no depth, so it has to come
 * after everything solid, and among themselves the furthest first. Created in whatever order, and
 * wherever they are. The case that found it: a glass tube made when the room was built, and an
 * avatar made later that walked into it and vanished.
 */

const tint = { r: 1, g: 1, b: 1, a: 1 };
const names = new Map<unknown, string>();

/**
 * A cube at depth `z`, remembered by name so an order reads as a list of names.
 */
const cube = (name: string, z: number, options: { alpha?: number; transparent?: boolean; zIndex?: number; a?: number } = {}): TMesh => {
    const mesh = createMesh({
        geometry: useCubeGeometry(),
        tint: { ...tint, a: options.a ?? 1 },
        alpha: options.alpha,
        transparent: options.transparent,
        zIndex: options.zIndex,
        transform: { x: 0, y: 0, z },
    });
    names.set(mesh, name);
    return mesh;
};

/**
 * The camera at z = 10 looking down -z, so a lower z is further away.
 */
const camera = (): void => {
    useCamera3d({ projection: 'perspective', fov: 60, transform: { z: 10 } });
};

const paintOrder = (store: TRuntimeStore): string[] => {
    const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
    fillFrameContext(store, ctx);
    return (ctx.passes[0].drawables ?? []).map((drawable) => names.get(drawable) ?? '?');
};

describe('see-through models', () => {
    it('are drawn after the solid ones, whichever was made first', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            camera();
            cube('glass', 2, { alpha: 0.22 });
            cube('avatar', 0);
            return createScene();
        });

        expect(paintOrder(store)).toEqual(['avatar', 'glass']);
    });

    it('are drawn furthest first, whatever order they were made in', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            camera();
            cube('near', 5, { alpha: 0.5 });
            cube('far', -5, { alpha: 0.5 });
            cube('middle', 0, { alpha: 0.5 });
            cube('solid', 3);
            return createScene();
        });

        expect(paintOrder(store)).toEqual(['solid', 'far', 'middle', 'near']);
    });

    it('keep the solid ones in the order they were made', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            camera();
            cube('a', -5);
            cube('glass', 0, { alpha: 0.5 });
            cube('b', 5);
            cube('c', 0);
            return createScene();
        });

        expect(paintOrder(store)).toEqual(['a', 'b', 'c', 'glass']);
    });

    it('still give way to a zIndex written by hand', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            camera();
            cube('solid', 0);
            cube('glass', 2, { alpha: 0.5, zIndex: -1 });
            return createScene();
        });

        expect(paintOrder(store)).toEqual(['glass', 'solid']);
    });

    it('follow a fade: the order changes the frame the alpha does', () => {
        const { store } = createTestGame();
        let ghost: TMesh | null = null;
        startTestScene(store, 'Level', () => {
            camera();
            ghost = cube('ghost', 2);
            cube('solid', 0);
            return createScene();
        });

        expect(paintOrder(store)).toEqual(['ghost', 'solid']);
        ghost!.material.alpha = 0.55;
        expect(paintOrder(store)).toEqual(['solid', 'ghost']);
    });
});

describe('what counts as see-through', () => {
    it('is an alpha below one, the material\'s or its tint\'s', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            camera();
            expect(isTransparentMesh(cube('solid', 0))).toBe(false);
            expect(isTransparentMesh(cube('alpha', 0, { alpha: 0.99 }))).toBe(true);
            expect(isTransparentMesh(cube('tint', 0, { a: 0.5 }))).toBe(true);
            return createScene();
        });
    });

    it('is whatever `transparent` says when it says it', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            camera();
            // A shader that works out its own alpha, or a picture with holes: nothing else would tell.
            expect(isTransparentMesh(cube('shader', 0, { transparent: true }))).toBe(true);
            expect(isTransparentMesh(cube('forced', 0, { alpha: 0.5, transparent: false }))).toBe(false);
            return createScene();
        });
    });
});

describe('see-through in a scene document', () => {
    const written = (transparent: boolean | undefined) => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useSpawn(function Glass() {
                useTransform({});
                createMesh({ geometry: useCubeGeometry(), ...(transparent !== undefined ? { transparent } : {}) });
            })();
            return createScene();
        });
        return serializeScene(root);
    };
    const materialOf = (doc: ReturnType<typeof written>) =>
        (doc.root.children[0]!.components.find((component) => component.type === 'mesh') as { material: { transparent?: unknown } }).material;

    it('is written only when it was asked for, either way, and read back the same', () => {
        expect(materialOf(written(undefined))).not.toHaveProperty('transparent');
        // Solid at any alpha is a word of its own, not the default left out.
        expect(materialOf(written(false)).transparent).toBe(false);
        const glass = written(true);
        expect(materialOf(glass).transparent).toBe(true);
        expect(parseSceneDoc(glass, '/scenes/level.scene')).toEqual(glass);
    });

    it('is drawn that way when the scene is made from it', () => {
        for (const transparent of [true, false]) {
            const { store } = createTestGame();
            const root = startTestScene(store, 'Level', sceneFromDoc(written(transparent)));
            const mesh = root.children[0]!.drawables.find((drawable) => drawable.type === 'mesh') as TMesh;
            expect(mesh.material.transparent).toBe(transparent);
        }
    });

    it('leaves out a word that is not one', () => {
        const doc = written(true);
        materialOf(doc).transparent = 'yes';
        expect(materialOf(parseSceneDoc(doc, '/scenes/level.scene'))).not.toHaveProperty('transparent');
    });
});

describe('particles in space', () => {
    /**
     * A cloud of particles at depth `z`, as many as `count` so the order can tell the clouds apart:
     * what reaches the frame is a copy of the emitter for drawing, not the emitter.
     */
    const cloud = (store: TRuntimeStore, count: number, z: number, zIndex?: number): void => {
        const key = `smoke-${count}`;
        const file = newParticlesFile(key, key);
        file.doc = parseParticlesDoc({ kind: 'particles-3d', emission: { burst: count } }, `/${key}.particles`);
        file.status = 'ready';
        store.get('assets').particles.set(key, file);
        useSpawn(() => {
            useTransform({ z });
            createParticles3d({ effect: key, seed: 1, ...(zIndex !== undefined ? { zIndex } : {}) });
        })();
    };

    /** The order, a cloud read as `smoke×count`. */
    const order = (store: TRuntimeStore): string[] => {
        const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
        fillFrameContext(store, ctx, 1 / 60);
        return (ctx.passes[0].drawables ?? []).map((drawable) => drawable.type === 'particles-3d'
            ? `smoke×${(drawable as unknown as { count: number }).count}`
            : names.get(drawable) ?? '?');
    };

    it('are drawn among see-through models by how far they are, whichever was made first', () => {
        for (const madeFirst of ['smoke', 'glass'] as const) {
            const { store } = createTestGame();
            startTestScene(store, 'Level', () => {
                camera();
                if (madeFirst === 'smoke') cloud(store, 2, -4);
                cube('glass', 0, { alpha: 0.4 });
                if (madeFirst === 'glass') cloud(store, 2, -4);
                cloud(store, 4, 4);
                cube('wall', -8);
                return createScene();
            });

            // The wall first, solid; then from the furthest: the smoke behind the glass (2), the
            // glass, the smoke in front of it (4).
            expect(order(store)).toEqual(['wall', 'smoke×2', 'glass', 'smoke×4']);
        }
    });

    it('are drawn in a monitor by how far they are from its own camera, not the screen\'s', () => {
        for (const offScreen of [false, true]) {
            const { store } = createTestGame();
            let monitor!: TTexture;
            // Behind the scene, looking back at it: what is far for the screen is near for it.
            const Behind = () => {
                useCamera3d({ projection: 'perspective', fov: 60, transform: { z: -10, rotationY: Math.PI } });
            };
            startTestScene(store, 'Level', () => {
                if (offScreen) useWorldOffScreen();
                camera();
                cloud(store, 2, -4);
                cube('glass', 0, { alpha: 0.4 });
                monitor = createSpriteTexture({ width: 16, height: 16, sees: '3d' }, Behind);
                return createScene();
            });
            const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
            fillFrameContext(store, ctx, 1 / 60);
            const read = (drawables: readonly unknown[]) => drawables.map((drawable) => (drawable as { type: string }).type === 'particles-3d'
                ? `smoke×${(drawable as { count: number }).count}`
                : names.get(drawable) ?? '?');
            const watched = ctx.passes.find((pass) => pass.renderTarget === monitor.gpu)!;

            if (!offScreen) expect(read(ctx.passes[ctx.passes.length - 1]!.drawables ?? [])).toEqual(['smoke×2', 'glass']);
            expect(read(watched.drawables ?? [])).toEqual(['glass', 'smoke×2']);
        }
    });

    it('keep their zIndex in a monitor too, where they are drawn by a stand-in', () => {
        const { store } = createTestGame();
        let monitor!: TTexture;
        const Behind = () => {
            useCamera3d({ projection: 'perspective', fov: 60, transform: { z: -10, rotationY: Math.PI } });
        };
        startTestScene(store, 'Level', () => {
            camera();
            cube('glass', 0, { alpha: 0.4 });
            // In front of the glass on the screen, behind it for the monitor, and after it by hand.
            cloud(store, 2, 4, 1);
            monitor = createSpriteTexture({ width: 16, height: 16, sees: '3d' }, Behind);
            return createScene();
        });
        const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
        fillFrameContext(store, ctx, 1 / 60);
        const read = (drawables: readonly unknown[]) => drawables.map((drawable) => (drawable as { type: string }).type === 'particles-3d'
            ? `smoke×${(drawable as { count: number }).count}`
            : names.get(drawable) ?? '?');

        expect(read(ctx.passes[ctx.passes.length - 1]!.drawables ?? [])).toEqual(['glass', 'smoke×2']);
        expect(read(ctx.passes.find((pass) => pass.renderTarget === monitor.gpu)!.drawables ?? [])).toEqual(['glass', 'smoke×2']);
    });

    it('still give way to a zIndex written by hand', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            camera();
            cube('glass', -4, { alpha: 0.4, zIndex: 1 });
            cloud(store, 2, 4);
            return createScene();
        });

        // Nearer than the glass, and drawn under it all the same.
        expect(order(store)).toEqual(['smoke×2', 'glass']);
    });
});
