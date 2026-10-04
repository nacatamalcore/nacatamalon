import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createMesh } from '../src/gameobjects/mesh/create_mesh';
import { useCubeGeometry } from '../src/hooks';
import { useCamera3d } from '../src/hooks';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { isTransparentMesh } from '../src/render/shared/is_transparent_mesh';
import { createTestGame, startTestScene } from './helpers/test_game';
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
    useCamera3d({ projection: 'perspective', fov: 60, z: 10 });
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
