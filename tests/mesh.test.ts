import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createMesh } from '../src/gameobjects/mesh';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { useCubeGeometry } from '../src/hooks/geometry';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { destroy, flushDestroyed } from '../src/destroy';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TFrameContext } from '../src/render';
import type { TRuntimeStore } from '../src/store';
import type { TMesh } from '../src/gameobjects/mesh';

/**
 * Models in a scene: that they reach the frame, that they leave it, and where they sit in the
 * order against everything that is not one.
 */

const tint = { r: 1, g: 1, b: 1, a: 1 };
const flat = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };

/**
 * What the renderer would be handed, as the kind of each thing in order.
 */
const kinds = (store: TRuntimeStore): string[] => {
    const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
    fillFrameContext(store, ctx);
    return (ctx.passes[0].drawables ?? []).map((item) => item.type);
};

const frame = (store: TRuntimeStore) => {
    const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
    fillFrameContext(store, ctx);
    return ctx.passes[0];
};

describe('createMesh', () => {
    it('refuses to be called outside a scene body', () => {
        expect(() => createMesh({ geometry: null as never })).toThrow('[NacatamalOn] createMesh');
    });

    it('reaches the frame with its shape and its surface', () => {
        const { store } = createTestGame();
        let mesh!: TMesh;
        startTestScene(store, 'Level', () => {
            mesh = createMesh({ geometry: useCubeGeometry(), tint, shininess: 8, alpha: 0.5 });
            return createScene();
        });

        const drawn = frame(store).drawables ?? [];
        expect(drawn).toHaveLength(1);
        expect(drawn[0]).toBe(mesh);
        expect(mesh.geometry?.indexCount).toBe(36);
        expect(mesh.material.alpha).toBe(0.5);
        // Matt by default: a shine is what makes something read as wet or polished, and most
        // things are neither.
        expect(mesh.material.specular).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    });

    it('starts nowhere in particular, unturned and unscaled', () => {
        const { store } = createTestGame();
        let mesh!: TMesh;
        startTestScene(store, 'Level', () => {
            mesh = createMesh({ geometry: useCubeGeometry(), transform: { x: 3 } });
            return createScene();
        });

        expect(mesh.transform).toEqual({ x: 3, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 });
    });

    it('is hidden like anything else, and goes away like anything else', () => {
        const { store } = createTestGame();
        let mesh!: TMesh;
        startTestScene(store, 'Level', () => {
            mesh = createMesh({ geometry: useCubeGeometry() });
            return createScene();
        });

        expect(kinds(store)).toEqual(['mesh']);

        mesh.visible = false;
        expect(kinds(store)).toEqual([]);

        mesh.visible = true;
        destroy(mesh);
        flushDestroyed(store);
        expect(kinds(store)).toEqual([]);
    });

    it('keeps its shape when it is destroyed, because the shape is shared', () => {
        const { store, renderer } = createTestGame();
        let mesh!: TMesh;
        startTestScene(store, 'Level', () => {
            mesh = createMesh({ geometry: useCubeGeometry() });
            createMesh({ geometry: useCubeGeometry() });
            return createScene();
        });

        destroy(mesh);
        flushDestroyed(store);

        // Both were the same shape and the other one is still drawing it. Letting go of a shape is
        // what unloading an asset would be, never what destroying one thing that shows it is.
        expect(renderer.buffers.every((buffer) => buffer.alive)).toBe(true);
    });

    it('moves with the box it is in', () => {
        const { store } = createTestGame();
        let mesh!: TMesh;
        startTestScene(store, 'Level', () => {
            useSpawn(() => {
                useTransform({ x: 10, y: 5, z: 2 });
                mesh = createMesh({ geometry: useCubeGeometry(), transform: { x: 1 } });
            })();
            return createScene();
        });

        frame(store);
        const world = mesh.worldMatrix!;
        // The last row of a placement matrix is where it ended up: its own step plus the box's.
        expect(world[12]).toBeCloseTo(11, 5);
        expect(world[13]).toBeCloseTo(5, 5);
        expect(world[14]).toBeCloseTo(2, 5);
    });
});

describe('a model among sprites', () => {
    it('is drawn under one on the same number', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            createSprite({ width: 1, height: 1, tint, transform: { ...flat } });
            createMesh({ geometry: useCubeGeometry() });
            return createScene();
        });

        // The model was made second and still goes first: a HUD is meant to be seen, and which one
        // was written first is not a thing anyone should have to think about.
        expect(kinds(store)).toEqual(['mesh', 'sprite']);
    });

    it('goes over one that asked to be lower', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            createSprite({ width: 1, height: 1, tint, transform: { ...flat }, zIndex: -5 });
            createMesh({ geometry: useCubeGeometry() });
            return createScene();
        });

        expect(kinds(store)).toEqual(['sprite', 'mesh']);
    });

    it('brings its scene a way of being seen and lit', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            createMesh({ geometry: useCubeGeometry() });
            return createScene();
        });

        const pass = frame(store);
        expect(pass.views3d).toHaveLength(1);
        expect(pass.viewIndex).toEqual([0]);
        // No camera of its own means flat on in the game's pixels, the same answer a scene with no
        // 2D camera gets.
        expect(pass.views3d?.[0].camera).toBeNull();
    });

    it('leaves a scene of sprites alone', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            createSprite({ width: 1, height: 1, tint, transform: { ...flat } });
            return createScene();
        });

        const pass = frame(store);
        expect(pass.views3d).toHaveLength(0);
        expect(pass.viewIndex).toEqual([-1]);
    });
});
