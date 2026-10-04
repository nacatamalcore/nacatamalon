import { describe, expect, it } from 'bun:test';
import { SHADOW_MAP_SIZE, lightSpaceMatrix, shadowCasterIndex } from '../src/render/shared/light_space';
import type { TDrawCamera3d, TDrawLight } from '../src/render/interface';

/**
 * Where the shadow-casting light looks from.
 *
 * The one that matters most here is the snapping. Following the camera is what stops a character
 * losing their shadow by walking away, and it brings a fault that a still screenshot cannot show:
 * the shadow crawling along its own edge as the camera slides. These tests are the only thing that
 * can catch that, because a person looking at two captures cannot tell a shadow that moved a step
 * from one that did not.
 */

const at = (fields: Partial<TDrawLight['transform']> = {}): TDrawLight['transform'] => ({
    x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1, ...fields,
});

/**
 * A sun pointing down and slightly along, which is where a sun in a game usually is.
 */
const sun = (fields: Partial<TDrawLight> = {}): TDrawLight => ({
    type: 'directional',
    color: { r: 1, g: 1, b: 1, a: 1 },
    intensity: 1,
    castShadow: true,
    transform: at({ rotationX: -0.9, rotationY: 0.4 }),
    ...fields,
});

const camera = (x: number, y = 2, z = 6): TDrawCamera3d => ({
    projection: 'perspective',
    transform: at({ x, y, z }),
    fov: 55, near: 0.1, far: 100, zoom: 1,
});

/**
 * Runs a world point through a matrix and hands back where it landed, divided through.
 */
const project = (matrix: Float32Array, x: number, y: number, z: number) => {
    const out = [0, 1, 2, 3].map((row) => matrix[row] * x + matrix[4 + row] * y + matrix[8 + row] * z + matrix[12 + row]);
    const w = out[3] === 0 ? 1 : out[3];
    return { x: out[0] / w, y: out[1] / w, z: out[2] / w };
};

describe('which light a scene casts from', () => {
    const lamp: TDrawLight = { type: 'point', color: { r: 1, g: 1, b: 1, a: 1 }, intensity: 1, transform: at(), castShadow: true };

    it('is the first one that asks, and nobody else', () => {
        const lights = [sun({ castShadow: false }), sun(), sun()];

        expect(shadowCasterIndex(lights)).toBe(1);
    });

    it('is nobody at all when no light asked, which is the ordinary scene', () => {
        expect(shadowCasterIndex([sun({ castShadow: false })])).toBe(-1);
        expect(shadowCasterIndex([])).toBe(-1);
    });

    it('is never a bulb, however loudly it asks: shining every way needs six pictures, not one', () => {
        expect(shadowCasterIndex([lamp])).toBe(-1);
        // And a bulb standing in front of a sun does not take its turn.
        expect(shadowCasterIndex([lamp, sun()])).toBe(1);
    });
});

describe('the square a sun covers', () => {
    it('puts what the camera is looking at inside the picture', () => {
        const out = new Float32Array(16);
        lightSpaceMatrix(sun(), camera(0), out);

        const middle = project(out, 0, 0, 0);
        expect(Math.abs(middle.x)).toBeLessThan(1);
        expect(Math.abs(middle.y)).toBeLessThan(1);
        expect(middle.z).toBeGreaterThan(0);
        expect(middle.z).toBeLessThan(1);
    });

    it('covers the scene a camera is standing back from, not the space behind the camera', () => {
        // The case that had no test and no shadow: a camera well back from its scene, pointing into
        // it. Centred on the camera instead of on what it is watching, the square covers the empty
        // space behind the player and everything on screen comes out lit as though nothing were in
        // the way. Nothing in the engine reports that; the picture simply has no shadows in it.
        const out = new Float32Array(16);
        const back: TDrawCamera3d = {
            projection: 'perspective',
            transform: at({ y: 130, z: 260, rotationX: -0.45 }),
            fov: 45, near: 0.1, far: 1000, zoom: 1,
        };

        lightSpaceMatrix(sun({ shadowArea: 420, shadowDistance: 500 }), back, out);

        const watched = project(out, 0, 0, 0);
        expect(Math.abs(watched.x)).toBeLessThan(1);
        expect(Math.abs(watched.y)).toBeLessThan(1);
    });

    it('follows the camera, so walking away does not take a shadow with it', () => {
        const near = new Float32Array(16);
        const far = new Float32Array(16);
        lightSpaceMatrix(sun(), camera(0), near);
        lightSpaceMatrix(sun(), camera(200), far);

        // A point beside the distant camera is in the distant picture and nowhere near the first.
        expect(Math.abs(project(far, 200, 0, 0).x)).toBeLessThan(1);
        expect(Math.abs(project(near, 200, 0, 0).x)).toBeGreaterThan(1);
    });

    it('does not move at all when the camera moves less than one step of the map', () => {
        const before = new Float32Array(16);
        const after = new Float32Array(16);
        // A twentieth of a step. Without the rounding this is enough to re-measure every edge in
        // the scene, and the shadows crawl while nothing in the world has moved.
        const sliver = (12 / SHADOW_MAP_SIZE) / 20;

        lightSpaceMatrix(sun(), camera(0), before);
        lightSpaceMatrix(sun(), camera(sliver), after);

        expect(Array.from(after)).toEqual(Array.from(before));
    });

    it('does move when the camera has covered a whole step, so it never falls behind', () => {
        const before = new Float32Array(16);
        const after = new Float32Array(16);

        lightSpaceMatrix(sun(), camera(0), before);
        lightSpaceMatrix(sun(), camera(12 / SHADOW_MAP_SIZE * 8), after);

        expect(Array.from(after)).not.toEqual(Array.from(before));
    });

    it('holds still for a light shining straight down, where two directions would collapse', () => {
        const out = new Float32Array(16);
        // Straight down: the obvious reference direction is parallel to it, and crossing two
        // parallel directions gives nothing to build a square out of.
        lightSpaceMatrix(sun({ transform: at({ rotationX: -Math.PI / 2 }) }), camera(0), out);

        expect(Array.from(out).every((value) => Number.isFinite(value))).toBe(true);
        expect(Math.abs(project(out, 0, 0, 0).x)).toBeLessThan(1);
    });

    it('is as wide as it was told, and a wider one reaches further', () => {
        const tight = new Float32Array(16);
        const wide = new Float32Array(16);
        lightSpaceMatrix(sun({ shadowArea: 4 }), camera(0), tight);
        lightSpaceMatrix(sun({ shadowArea: 40 }), camera(0), wide);

        // Ten units along the ground: outside the small square, inside the big one.
        expect(Math.abs(project(tight, 10, 0, 0).x)).toBeGreaterThan(1);
        expect(Math.abs(project(wide, 10, 0, 0).x)).toBeLessThan(1);
    });

    it('is written into the place it was given, so a frame holds one of them', () => {
        const out = new Float32Array(16);

        expect(lightSpaceMatrix(sun(), camera(0), out)).toBe(out);
    });
});

describe('the cone a torch covers', () => {
    const torch = (fields: Partial<TDrawLight> = {}): TDrawLight => ({
        type: 'spot',
        color: { r: 1, g: 1, b: 1, a: 1 },
        intensity: 1,
        castShadow: true,
        range: 20,
        angle: 0.5,
        transform: at({ y: 6, rotationX: -Math.PI / 2 }),
        ...fields,
    });

    it('is its own, so moving the camera does not move it', () => {
        const before = new Float32Array(16);
        const after = new Float32Array(16);
        lightSpaceMatrix(torch(), camera(0), before);
        lightSpaceMatrix(torch(), camera(50), after);

        // A torch is somewhere and reaches a certain distance, so it already says which part of the
        // world its shadows are in. An area as well would be a second answer to a settled question.
        expect(Array.from(after)).toEqual(Array.from(before));
    });

    it('covers what it lights: straight under it is in the picture', () => {
        const out = new Float32Array(16);
        lightSpaceMatrix(torch(), null, out);

        const under = project(out, 0, 0, 0);
        expect(Math.abs(under.x)).toBeLessThan(1);
        expect(Math.abs(under.y)).toBeLessThan(1);
    });

    it('sees further when it reaches further', () => {
        const near = new Float32Array(16);
        const far = new Float32Array(16);
        lightSpaceMatrix(torch({ range: 4 }), null, near);
        lightSpaceMatrix(torch({ range: 60 }), null, far);

        // The floor is six below a torch that reaches four: past its far plane, and inside the
        // other's.
        expect(project(near, 0, 0, 0).z).toBeGreaterThan(1);
        expect(project(far, 0, 0, 0).z).toBeLessThan(1);
    });
});
