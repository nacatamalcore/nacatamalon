import { describe, expect, it } from 'bun:test';
import { pickMeshLights } from '../src/render/shared/pick_mesh_lights';
import { computeModelMatrix } from '../src/render/shared/compute_mvp_3d';
import { MAX_LIGHTS } from '../src/light';
import type { TDrawLight } from '../src/render/interface/draw/t_draw_light';
import type { TTransform3d } from '../src/gameobjects/types/t_transform_3d';

/**
 * Which of a scene's lights light one model: the eight that reach it most, found by the box around
 * its shape, as the consoles of the era chose a model's lights from the ones near it.
 */

const white = { r: 1, g: 1, b: 1, a: 1 };
const place = (over: Partial<TTransform3d> = {}): TTransform3d => ({
    x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1, ...over,
});
const lamp = (x: number, range = 5, intensity = 1): TDrawLight => ({ type: 'point', color: white, intensity, range, transform: place({ x }) });
const sun: TDrawLight = { type: 'directional', color: white, intensity: 1, transform: place({ rotationX: -1 }) };
const CUBE = { min: { x: -0.5, y: -0.5, z: -0.5 }, max: { x: 0.5, y: 0.5, z: 0.5 } };

/** The places in the scene's block a model was given, read back out of its two numbers. */
const unpack = ([first, second]: [number, number]): number[] => {
    const out: number[] = [];
    for (let k = 0; k < 8; k++) {
        const lane = k < 4 ? first : second;
        const named = Math.floor(lane / 2 ** (6 * (k % 4))) % 64;
        if (named === 0) break;
        out.push(named - 1);
    }
    return out;
};

const pick = (lights: TDrawLight[], at: Partial<TTransform3d> = {}, bounds: typeof CUBE | null = CUBE): number[] =>
    unpack(pickMeshLights(lights, computeModelMatrix(place(at)), bounds));

describe('the lights one model is lit by', () => {
    it('are every light of a scene of a few, in the order the scene holds them', () => {
        expect(pick([sun, lamp(1), lamp(-1)])).toEqual([0, 1, 2]);
    });

    it('leave out a lamp whose reach does not get to it, which would have added nothing', () => {
        expect(pick([lamp(2), lamp(20)])).toEqual([0]);
    });

    it('always take a sun, however far: it reaches everything', () => {
        expect(pick([lamp(30), sun], { x: 1000 })).toEqual([1]);
    });

    it('are measured from the nearest point of the model, not its middle: a long floor lit at one end', () => {
        // A floor 20 across, a lamp reaching 3 standing over one end, 10 from its middle.
        const floor = { min: { x: -10, y: 0, z: -1 }, max: { x: 10, y: 0, z: 1 } };
        expect(pick([lamp(9, 3)], {}, floor)).toEqual([0]);
        // Measured from its middle it would have been left out.
        expect(pick([lamp(9, 3)], {}, null)).toEqual([]);
    });

    it('are the eight that reach it most, when more reach it', () => {
        // Twelve lamps in a row, the nearest the strongest for it; the four farthest are left out.
        const row = [...Array(12).keys()].map((i) => lamp(i, 20));
        const chosen = pick(row);
        expect(chosen).toHaveLength(MAX_LIGHTS);
        expect(chosen).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
        // A brighter one far down the row takes the place of the weakest near one.
        row[11] = lamp(11, 20, 10);
        expect(pick(row)).toEqual([0, 1, 2, 3, 4, 5, 6, 11]);
    });

    it('go with the model where it is: the far end of the corridor has its own', () => {
        const corridor = [...Array(20).keys()].map((i) => lamp(i * 4, 3));
        expect(pick(corridor, { x: 0 })).toEqual([0]);
        expect(pick(corridor, { x: 40 })).toEqual([10]);
        expect(pick(corridor, { x: 76 })).toEqual([19]);
    });

    it('can name every one of the thirty-two a scene holds', () => {
        const lights = [...Array(32).keys()].map((i) => lamp(i * 10, 3));
        expect(pick(lights, { x: 310 })).toEqual([31]);
    });
});
