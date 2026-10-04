import { describe, expect, it } from 'bun:test';
import { buildParts } from '../src/loaders/gltf/build_parts';
import { findMeshNodes } from '../src/loaders/gltf/find_mesh_nodes';
import { jointLookup, readSkin } from '../src/loaders/gltf/read_skin';
import { readAnimations } from '../src/loaders/gltf/read_animations';
import { computeJointMatrices } from '../src/math/skinning';
import { SKIN_STRIDE } from '../src/geometry';
import { asGltf } from './helpers/test_gltf';
import type { TGltfDoc } from '../src/loaders/gltf/types/t_gltf_doc';
import type { TTestModel } from './helpers/test_gltf';

/**
 * Reading a rig out of a file: which bones there are, which hangs from which, how they stand at
 * rest, and what the corners say about who moves them.
 */

/**
 * A triangle whose three corners all hang off bone 1.
 */
const LIMB = {
    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    indices: [0, 1, 2],
    joints: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    weights: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
};

const parse = (model: TTestModel) => {
    const { json, bin } = asGltf(model);
    const doc = json as TGltfDoc;
    const skeletons = (doc.skins ?? []).map((_, i) => readSkin(doc, [bin], i, `k#${i}`));
    const renumbers = skeletons.map((s) => s.renumber);
    return {
        doc,
        skeletons: skeletons.map((s) => s.skeleton),
        renumbers,
        parts: buildParts(doc, [bin], findMeshNodes(doc), 'auto', renumbers),
        clips: readAnimations(doc, [bin], jointLookup(doc, renumbers)),
    };
};

describe('reading a rig', () => {
    it('finds the bones and which one each hangs from', () => {
        const { skeletons } = parse({
            nodes: [
                { name: 'Mesh', skin: 0, primitives: [LIMB] },
                { name: 'Hip', children: [2] },
                { name: 'Knee' },
            ],
            skins: [{ joints: [1, 2] }],
        });

        expect(skeletons[0].pose).toHaveLength(2);
        expect(Array.from(skeletons[0].parentIndex)).toEqual([-1, 0]);
    });

    it('reads how each bone stands at rest', () => {
        const { skeletons } = parse({
            nodes: [
                { name: 'Mesh', skin: 0, primitives: [LIMB] },
                { name: 'Hip', translation: [0, 2, 0], children: [2] },
                { name: 'Knee', translation: [0, -1, 0], scale: [2, 2, 2] },
            ],
            skins: [{ joints: [1, 2] }],
        });

        expect(skeletons[0].bindPose[0].t).toEqual([0, 2, 0]);
        expect(skeletons[0].bindPose[1].t).toEqual([0, -1, 0]);
        expect(skeletons[0].bindPose[1].s).toEqual([2, 2, 2]);
    });

    it('takes apart a bone written as a finished placement, instead of leaving it at the origin', () => {
        const { skeletons } = parse({
            nodes: [
                { name: 'Mesh', skin: 0, primitives: [LIMB] },
                { name: 'Hip' },
                // Column by column: a move of (5, 6, 7).
                { name: 'Knee', matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 6, 7, 1] },
            ],
            skins: [{ joints: [1, 2] }],
        });

        // Core reads nothing here and the bone silently rests at the origin.
        expect(skeletons[0].bindPose[1].t[0]).toBeCloseTo(5);
        expect(skeletons[0].bindPose[1].t[1]).toBeCloseTo(6);
        expect(skeletons[0].bindPose[1].t[2]).toBeCloseTo(7);
    });

    it('stands a skeleton at rest to begin with, and keeps the rest position separate', () => {
        const { skeletons } = parse({
            nodes: [{ name: 'Mesh', skin: 0, primitives: [LIMB] }, { name: 'Hip', translation: [1, 2, 3] }],
            skins: [{ joints: [1] }],
        });

        expect(skeletons[0].pose[0].t).toEqual([1, 2, 3]);
        // Moving the live one must not move the one it can be put back to.
        skeletons[0].pose[0].t[0] = 99;
        expect(skeletons[0].bindPose[0].t[0]).toBe(1);
    });

    it('gives every bone an untouched rest matrix when the file names none', () => {
        const { skeletons } = parse({
            nodes: [{ name: 'Mesh', skin: 0, primitives: [LIMB] }, { name: 'Hip' }],
            skins: [{ joints: [1] }],
        });

        expect(Array.from(skeletons[0].inverseBindMatrices))
            .toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    });

    it('reads the rest matrices the file does name', () => {
        const ibm = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -2, 0, 1];
        const { skeletons } = parse({
            nodes: [{ name: 'Mesh', skin: 0, primitives: [LIMB] }, { name: 'Hip', translation: [0, 2, 0] }],
            skins: [{ joints: [1], inverseBindMatrices: ibm }],
        });

        expect(Array.from(skeletons[0].inverseBindMatrices)).toEqual(ibm);
    });
});

describe('bones listed out of order', () => {
    const OUT_OF_ORDER: TTestModel = {
        nodes: [
            { name: 'Mesh', skin: 0, primitives: [LIMB] },
            { name: 'Knee' },
            { name: 'Hip', children: [1] },
        ],
        // The knee is listed before the hip it hangs from.
        skins: [{ joints: [1, 2], inverseBindMatrices: [
            1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -9, 0, 1,
            1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -3, 0, 1,
        ] }],
    };

    it('puts them in an order where a bone always comes after the one it hangs from', () => {
        const { skeletons } = parse(OUT_OF_ORDER);

        // Core warns and carries on, and the model comes out folded through itself.
        const parents = Array.from(skeletons[0].parentIndex);
        parents.forEach((parent, j) => { expect(parent).toBeLessThan(j); });
        expect(parents).toEqual([-1, 0]);
    });

    it('carries the rest matrix of each bone with it when it moves', () => {
        const { skeletons } = parse(OUT_OF_ORDER);
        const ibm = skeletons[0].inverseBindMatrices;

        // The hip is now first, and its own matrix (-3) came with it.
        expect(ibm[13]).toBe(-3);
        expect(ibm[16 + 13]).toBe(-9);
    });

    it('renumbers what the corners say, so they still point at their own bone', () => {
        const { parts, renumbers } = parse(OUT_OF_ORDER);

        expect(Array.from(renumbers[0])).toEqual([1, 0]);
        // Every corner named bone 1, the knee, which is now bone 0.
        expect(parts[0].skin![0]).toBe(0);
    });
});

describe('the corners of a deformed piece', () => {
    it('says which bones move it and how much, in a run of its own', () => {
        const { parts } = parse({
            nodes: [{ name: 'Mesh', skin: 0, primitives: [LIMB] }, { name: 'Hip' }, { name: 'Knee' }],
            skins: [{ joints: [1, 2] }],
        });

        expect(parts[0].skin).not.toBeNull();
        expect(parts[0].skin).toHaveLength(3 * SKIN_STRIDE);
        expect(parts[0].skeleton).toBe(0);
        // Four bones then four weights, for the first corner.
        expect(Array.from(parts[0].skin!.subarray(0, 8))).toEqual([1, 0, 0, 0, 1, 0, 0, 0]);
    });

    it('reads bone numbers written a byte wide as well as two', () => {
        const narrow = parse({
            nodes: [{ name: 'Mesh', skin: 0, primitives: [{ ...LIMB, jointBits: 8 }] }, { name: 'Hip' }, { name: 'Knee' }],
            skins: [{ joints: [1, 2] }],
        });

        expect(Array.from(narrow.parts[0].skin!.subarray(0, 4))).toEqual([1, 0, 0, 0]);
    });

    it('does NOT work the node placement into a deformed piece, because its bones already place it', () => {
        const { parts } = parse({
            nodes: [
                { name: 'Mesh', skin: 0, translation: [100, 0, 0], primitives: [LIMB] },
                { name: 'Hip' },
                { name: 'Knee' },
            ],
            skins: [{ joints: [1, 2] }],
        });

        // Applied here as well, the model would be placed twice and scatter.
        expect(parts[0].vertices[0]).toBe(0);
    });

    it('still works it in for a piece with no bones, exactly as before', () => {
        const { parts } = parse({
            nodes: [{ name: 'Rock', translation: [100, 0, 0], primitives: [{ positions: [0, 0, 0], indices: [0] }] }],
        });

        expect(parts[0].vertices[0]).toBe(100);
        expect(parts[0].skin).toBeNull();
        expect(parts[0].skeleton).toBeUndefined();
    });
});

describe('reading the movements', () => {
    it('reads a clip, how long it lasts, and what it moves', () => {
        const { clips } = parse({
            nodes: [{ name: 'Mesh', skin: 0, primitives: [LIMB] }, { name: 'Hip' }],
            skins: [{ joints: [1] }],
            animations: [{ name: 'Walk', channels: [{ node: 1, path: 'translation', times: [0, 0.5, 1.25], values: [0, 0, 0, 0, 1, 0, 0, 0, 0] }] }],
        });

        expect(clips).toHaveLength(1);
        expect(clips[0].name).toBe('Walk');
        expect(clips[0].duration).toBe(1.25);
        expect(clips[0].channels[0]).toEqual({ skeleton: 0, joint: 0, path: 'translation', sampler: 0 });
    });

    it('drops a channel that moves something which is not a bone', () => {
        const { clips } = parse({
            nodes: [{ name: 'Mesh', skin: 0, primitives: [LIMB] }, { name: 'Hip' }, { name: 'Camera' }],
            skins: [{ joints: [1] }],
            animations: [{
                name: 'Mixed',
                channels: [
                    { node: 2, path: 'translation', times: [0, 1], values: [0, 0, 0, 1, 1, 1] },
                    { node: 1, path: 'rotation', times: [0, 1], values: [0, 0, 0, 1, 0, 0, 0, 1] },
                ],
            }],
        });

        expect(clips[0].channels).toHaveLength(1);
        expect(clips[0].channels[0].path).toBe('rotation');
    });

    it('names a clip the file left unnamed, so it can still be asked for', () => {
        const { clips } = parse({
            nodes: [{ name: 'Mesh', skin: 0, primitives: [LIMB] }, { name: 'Hip' }],
            skins: [{ joints: [1] }],
            animations: [{ channels: [{ node: 1, path: 'scale', times: [0], values: [1, 1, 1] }] }],
        });

        expect(clips[0].name).toBe('clip0');
    });
});


describe('a rig kept inside something', () => {
    /**
     * The invariant that says a rig was read correctly, and the only one that holds for every file:
     * **at rest, every bone's matrix must be the same matrix.**
     *
     * At rest each bone cancels against the numbers undoing it, leaving whatever sits above the
     * whole rig, which is the same for all of them. Two that disagree pull apart the parts of the
     * model weighted to them, and the model is torn.
     *
     * The case that got this wrong is a rig under a node that turns, which is what every export
     * from Blender has: one node standing the scene upright. Reading only the bones leaves that
     * turn out, and the model is drawn a quarter turn from where it belongs, on those files and no
     * others.
     */
    const restAgreement = (model: TTestModel): number => {
        const { skeletons } = parse(model);
        let worst = 0;
        for (const skeleton of skeletons) {
            computeJointMatrices(skeleton, 1);
            for (let j = 1; j < skeleton.pose.length; j++) {
                for (let k = 0; k < 16; k++) {
                    worst = Math.max(worst, Math.abs(skeleton.jointMatrices[j * 16 + k] - skeleton.jointMatrices[k]));
                }
            }
        }
        return worst;
    };

    /**
     * A quarter turn about x, which is how a file says "this scene was built z-up".
     */
    const Z_UP = [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1];

    it('agrees with itself at rest when nothing sits above the bones', () => {
        expect(restAgreement({
            nodes: [
                { name: 'Mesh', skin: 0, primitives: [LIMB] },
                { name: 'Hip', translation: [0, 2, 0], children: [2] },
                { name: 'Knee', translation: [0, 1, 0] },
            ],
            skins: [{ joints: [1, 2], inverseBindMatrices: [
                1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -2, 0, 1,
                1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -3, 0, 1,
            ] }],
        })).toBeLessThan(1e-5);
    });

    it('still agrees when the whole rig is kept inside a node that turns', () => {
        // The numbers undoing the rest position were written knowing about that turn, so leaving it
        // out puts every bone a quarter turn from where it belongs.
        expect(restAgreement({
            nodes: [
                { name: 'Z_UP', matrix: Z_UP, children: [1, 3] },
                { name: 'Hip', translation: [0, 2, 0], children: [2] },
                { name: 'Knee', translation: [0, 1, 0] },
                { name: 'Mesh', skin: 0, primitives: [LIMB] },
            ],
            roots: [0],
            skins: [{ joints: [1, 2], inverseBindMatrices: [
                // Written against where the bones really are, turn included: the hip ends up two
                // along z once the scene is stood upright, not two along y.
                1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, -2, 0, 1,
                1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, -3, 0, 1,
            ] }],
        })).toBeLessThan(1e-5);
    });

    it('carries that turn into what the card reads, rather than dropping it', () => {
        const { skeletons } = parse({
            nodes: [
                { name: 'Z_UP', matrix: Z_UP, children: [1, 2] },
                { name: 'Bone' },
                { name: 'Mesh', skin: 0, primitives: [LIMB] },
            ],
            roots: [0],
            skins: [{ joints: [1] }],
        });
        computeJointMatrices(skeletons[0], 1);

        // Without it the matrix would do nothing at all. With it, it turns a quarter about x.
        const m = skeletons[0].jointMatrices;
        expect(m[5]).toBeCloseTo(0);
        expect(m[6]).toBeCloseTo(1);
        expect(m[9]).toBeCloseTo(-1);
    });

    it('costs nothing to carry when nothing sits above the bones', () => {
        const { skeletons } = parse({
            nodes: [{ name: 'Mesh', skin: 0, primitives: [LIMB] }, { name: 'Bone' }],
            skins: [{ joints: [1] }],
        });

        expect(skeletons[0].rootMatrices).toBeNull();
    });
});
