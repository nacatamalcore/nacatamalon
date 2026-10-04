import { describe, expect, it } from 'bun:test';
import * as mat from '../src/math/mat4';

/**
 * Whether a matrix operation may be told to write into one of its own operands.
 *
 * The whole of the reuse this engine does in its 3D path rests on that being true, and it is not
 * something the engine gets to decide: it is how `wgpu-matrix` happens to be written. Today its
 * functions read every input into a local before writing anything, and guard the parts they copy
 * through with an explicit check, so aliasing is safe.
 *
 * **If that ever stopped being true it would not throw.** The result would come back with a few
 * entries computed from values that had already been overwritten, which on screen is a model in
 * slightly the wrong place, or a light coming from slightly the wrong side. Nothing would report
 * it. This file is the only thing standing between that and a release.
 */

const sample = (seed: number): mat.Mat4 => {
    const m = new Float32Array(16);
    for (let i = 0; i < 16; i++) {
        // Nothing round: a zero or a one can hide an entry that was read after being clobbered.
        m[i] = Math.sin(seed + i * 1.7) * 3 + i * 0.37 + 1.1;
    }
    return m;
};

const vec = { x: 1.3, y: -2.7, z: 0.9 };

/**
 * Every operation that takes a matrix and gives one back, with the arguments it needs.
 */
const operations: Array<{ name: string; run: (a: mat.Mat4, b: mat.Mat4, dst?: mat.Mat4) => mat.Mat4 }> = [
    { name: 'multiply', run: (a, b, dst) => mat.multiply(a, b, dst) },
    { name: 'invert', run: (a, _b, dst) => mat.invert(a, dst) },
    { name: 'transpose', run: (a, _b, dst) => mat.transpose(a, dst) },
    { name: 'translate', run: (a, _b, dst) => mat.translate(a, vec, dst) },
    { name: 'scale', run: (a, _b, dst) => mat.scale(a, vec, dst) },
    { name: 'rotateX', run: (a, _b, dst) => mat.rotateX(a, 0.7, dst) },
    { name: 'rotateY', run: (a, _b, dst) => mat.rotateY(a, 0.7, dst) },
    { name: 'rotateZ', run: (a, _b, dst) => mat.rotateZ(a, 0.7, dst) },
];

describe('writing a matrix operation into a destination', () => {
    it('gives the same answer as letting it make one', () => {
        for (const { name, run } of operations) {
            const fresh = run(sample(1), sample(9));
            const into = new Float32Array(16);
            const returned = run(sample(1), sample(9), into);

            expect(`${name}: ${Array.from(into).map((v) => v.toFixed(5)).join()}`)
                .toBe(`${name}: ${Array.from(fresh).map((v) => v.toFixed(5)).join()}`);
            // Handed back as well as filled in, so it reads the same either way.
            expect(returned).toBe(into);
        }
    });

    it('gives the same answer when the destination IS one of the operands', () => {
        for (const { name, run } of operations) {
            const expected = run(sample(1), sample(9));
            const aliased = sample(1);
            run(aliased, sample(9), aliased);

            expect(`${name}: ${Array.from(aliased).map((v) => v.toFixed(5)).join()}`)
                .toBe(`${name}: ${Array.from(expected).map((v) => v.toFixed(5)).join()}`);
        }
    });

    it('lets the right-hand side be the destination too, which multiply is the only one to have', () => {
        const expected = mat.multiply(sample(1), sample(9));
        const right = sample(9);
        mat.multiply(sample(1), right, right);

        expect(Array.from(right).map((v) => v.toFixed(5))).toEqual(Array.from(expected).map((v) => v.toFixed(5)));
    });

    it('fills a destination for the ones that build a matrix out of nothing', () => {
        const projection = new Float32Array(16);
        expect(mat.perspective(1, 1.5, 0.1, 100, projection)).toBe(projection);
        expect(Array.from(projection)).toEqual(Array.from(mat.perspective(1, 1.5, 0.1, 100)));

        const flat = new Float32Array(16);
        expect(mat.ortho(0, 8, 0, 6, 0.1, 50, flat)).toBe(flat);
        expect(Array.from(flat)).toEqual(Array.from(mat.ortho(0, 8, 0, 6, 0.1, 50)));

        const aimed = new Float32Array(16);
        const eye = { x: 1, y: 2, z: 3 };
        const target = { x: 0, y: 0, z: 0 };
        const up = { x: 0, y: 1, z: 0 };
        expect(mat.lookAt(eye, target, up, aimed)).toBe(aimed);
        expect(Array.from(aimed)).toEqual(Array.from(mat.lookAt(eye, target, up)));

        // Starting again from identity has to be possible without making a matrix, or every reuse
        // below it would have to remember to clear what it left behind.
        const reused = sample(4);
        expect(mat.identity(reused)).toBe(reused);
        expect(Array.from(reused)).toEqual(Array.from(mat.create()));
    });
});
