import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import {
    useCircleGeometry, useConeGeometry, useCubeGeometry, useCylinderGeometry,
    useIcoSphereGeometry, usePlaneGeometry, useTorusGeometry, useUvSphereGeometry,
} from '../src/hooks/geometry';
import { GEOMETRY_STRIDE } from '../src/geometry';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TFakeRenderer } from './helpers/test_game';
import type { TGeometry } from '../src/geometry';

/**
 * The shapes: how many corners they have, which way their surfaces face, and where their pictures
 * land on them.
 *
 * A shape built wrong is invisible rather than wrong-looking, because the graphics card throws away
 * triangles that face away from it. That is why the checks here are about direction and counts and
 * not about how it looks: by the time it looks wrong there is nothing on screen to look at.
 */

/**
 * Builds shapes inside a scene and hands back what the renderer was given.
 */
const built = (body: () => TGeometry[]) => {
    const { store, renderer } = createTestGame();
    let made: TGeometry[] = [];
    startTestScene(store, 'Level', () => {
        made = body();
        return createScene();
    });
    return { store, renderer, made };
};

/**
 * The corners of a shape, as the numbers that went to the graphics card.
 */
const cornersOf = (renderer: TFakeRenderer, geometry: TGeometry): Float32Array =>
    renderer.buffers.find((b) => b.handle === geometry.vertexBuffer)!.data as Float32Array;

describe('every shape', () => {
    it('is ready at once, with corners and triangles on the card', () => {
        const { renderer, made } = built(() => [useCubeGeometry()]);
        const [cube] = made;

        expect(cube.status).toBe('ready');
        // Six faces of four corners, and two triangles each.
        expect(cube.vertexCount).toBe(24);
        expect(cube.indexCount).toBe(36);
        // The corners, and the colour painted on each: white, since nobody painted a built cube.
        expect(renderer.buffers.filter((b) => b.usage === 'vertex')).toHaveLength(2);
        expect(renderer.buffers.filter((b) => b.usage === 'index')).toHaveLength(1);
    });

    it('keeps its corners AND its triangles on this side', () => {
        const { made } = built(() => [useCubeGeometry()]);
        const [cube] = made;

        // Both halves, because one without the other is not a shape. A collider made of a room's
        // real triangles is built from the pair, and the card's copy of either cannot be read back.
        expect(cube.positions).toHaveLength(24 * 3);
        expect(cube.indices).toHaveLength(36);
        expect(Math.max(...cube.indices!)).toBe(23);
    });

    it('faces outwards everywhere, in every shape', () => {
        const { renderer, made } = built(() => [
            useCubeGeometry(), usePlaneGeometry(), useCircleGeometry(),
            useUvSphereGeometry(), useIcoSphereGeometry(),
            useCylinderGeometry(), useConeGeometry(), useTorusGeometry(),
        ]);

        for (const geometry of made) {
            const corners = cornersOf(renderer, geometry);
            for (let i = 0; i < corners.length; i += GEOMETRY_STRIDE) {
                const length = Math.hypot(corners[i + 3], corners[i + 4], corners[i + 5]);
                // A direction has to be exactly one long, or lighting reads it as brighter or
                // darker than it is, which looks like a bug in the light and not in the shape.
                expect(length).toBeCloseTo(1, 4);
            }
        }
    });

    it('lands its picture inside the picture, in every shape', () => {
        const { renderer, made } = built(() => [
            useCubeGeometry(), usePlaneGeometry({ widthSegments: 3, depthSegments: 2 }),
            useCircleGeometry(), useUvSphereGeometry(), useCylinderGeometry(), useTorusGeometry(),
        ]);

        for (const geometry of made) {
            const corners = cornersOf(renderer, geometry);
            for (let i = 0; i < corners.length; i += GEOMETRY_STRIDE) {
                expect(corners[i + 6]).toBeGreaterThanOrEqual(0);
                expect(corners[i + 6]).toBeLessThanOrEqual(1);
                expect(corners[i + 7]).toBeGreaterThanOrEqual(0);
                expect(corners[i + 7]).toBeLessThanOrEqual(1);
            }
        }
    });

    it('measures the box it fits inside', () => {
        const { made } = built(() => [useCubeGeometry({ width: 2, height: 4, depth: 6 })]);
        expect(made[0].bounds).toEqual({ min: { x: -1, y: -2, z: -3 }, max: { x: 1, y: 2, z: 3 } });
    });

    it('never asks for a corner it does not have', () => {
        const { renderer, made } = built(() => [useUvSphereGeometry(), useIcoSphereGeometry({ subdivisions: 1 }), useConeGeometry()]);

        for (const geometry of made) {
            const indices = renderer.buffers.find((b) => b.handle === geometry.indexBuffer)!.data;
            for (const index of indices) {
                expect(index).toBeLessThan(geometry.vertexCount);
            }
        }
    });
});

describe('a shape asked for twice', () => {
    it('is built once when the size is the same', () => {
        const { renderer, made } = built(() => [useCubeGeometry({ width: 2 }), useCubeGeometry({ width: 2 })]);

        expect(made[1]).toBe(made[0]);
        // Corners, colours and triangles, once.
        expect(renderer.buffers).toHaveLength(3);
    });

    it('is built again when the size is not', () => {
        const { renderer, made } = built(() => [useCubeGeometry({ width: 2 }), useCubeGeometry({ width: 3 })]);

        expect(made[1]).not.toBe(made[0]);
        expect(renderer.buffers).toHaveLength(6);
    });

    it('is the same one under a name of its own', () => {
        const { made } = built(() => [useTorusGeometry({ key: 'ring' }), useTorusGeometry({ key: 'ring', tube: 9 })]);
        // The name is the identity, as it is for a texture: the second call finds the first.
        expect(made[1]).toBe(made[0]);
    });
});

describe('the sizes asked for', () => {
    it('are what comes out', () => {
        const { renderer, made } = built(() => [usePlaneGeometry({ width: 10, depth: 4 })]);
        const corners = cornersOf(renderer, made[0]);

        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i < corners.length; i += GEOMETRY_STRIDE) {
            minX = Math.min(minX, corners[i]); maxX = Math.max(maxX, corners[i]);
            minZ = Math.min(minZ, corners[i + 2]); maxZ = Math.max(maxZ, corners[i + 2]);
        }
        expect(maxX - minX).toBeCloseTo(10, 5);
        expect(maxZ - minZ).toBeCloseTo(4, 5);
    });

    it('cut a plane into the squares asked for', () => {
        const { made } = built(() => [usePlaneGeometry({ widthSegments: 3, depthSegments: 2 })]);
        // Four corners across by three along, and two triangles per square.
        expect(made[0].vertexCount).toBe(12);
        expect(made[0].indexCount).toBe(3 * 2 * 6);
    });

    it('split an icosphere four ways each time round', () => {
        const { made } = built(() => [
            useIcoSphereGeometry({ subdivisions: 0 }),
            useIcoSphereGeometry({ subdivisions: 1 }),
            useIcoSphereGeometry({ subdivisions: 2 }),
        ]);
        expect(made.map((g) => g.indexCount / 3)).toEqual([20, 80, 320]);
    });
});

describe('a shape hook', () => {
    it('refuses to be called outside a scene body', () => {
        expect(() => useCubeGeometry()).toThrow('[NacatamalOn] useCubeGeometry');
    });
});
