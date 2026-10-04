import * as mat from '../../math/mat4';
import * as quat from '../../math/quat';
import { newSkeleton } from '../../animation';
import { readFloats } from './read_accessors';
import type { Mat4 } from '../../math/mat4';
import type { TGltfDoc, TGltfNode } from './types/t_gltf_doc';
import type { TJointPose, TSkeleton } from '../../animation';

/**
 * Where one node sits relative to the one above it.
 */
const localMatrixOf = (node: TGltfNode): Mat4 => {
    if (node.matrix !== undefined) {
        return new Float32Array(node.matrix) as Mat4;
    }
    const [tx, ty, tz] = node.translation ?? [0, 0, 0];
    const r = node.rotation ?? [0, 0, 0, 1];
    const [sx, sy, sz] = node.scale ?? [1, 1, 1];

    let m = mat.create();
    m = mat.translate(m, { x: tx, y: ty, z: tz });
    m = mat.multiply(m, quat.toMat4([r[0], r[1], r[2], r[3]]));
    m = mat.scale(m, { x: sx, y: sy, z: sz });
    return m;
};

/**
 * Whether a matrix does nothing, so the ordinary case costs nothing to carry.
 */
const isIdentity = (m: Mat4): boolean => {
    for (let i = 0; i < 16; i++) {
        if (Math.abs(m[i] - (i % 5 === 0 ? 1 : 0)) > 1e-6) {
            return false;
        }
    }
    return true;
};

/**
 * A run of matrices that all do nothing, one per bone.
 */
const identityRuns = (count: number): Float32Array => {
    const out = new Float32Array(count * 16);
    for (let j = 0; j < count; j++) {
        out[j * 16] = 1;
        out[j * 16 + 5] = 1;
        out[j * 16 + 10] = 1;
        out[j * 16 + 15] = 1;
    }
    return out;
};

/**
 * How a bone stands at rest, taken from the node it is.
 */
const restOf = (node: TGltfNode): TJointPose => {
    if (node.matrix !== undefined) {
        // A bone written as a finished placement has to be taken apart, because standing is held
        // as a move, a turn and a size. Core skips this case and the bone silently rests at the
        // origin, which scatters the model with no message at all.
        const { translation, rotation, scale } = mat.decomposeTrs(new Float32Array(node.matrix) as mat.Mat4);
        return { t: [...translation], r: [...rotation], s: [...scale] };
    }

    const [tx, ty, tz] = node.translation ?? [0, 0, 0];
    const [rx, ry, rz, rw] = node.rotation ?? [0, 0, 0, 1];
    const [sx, sy, sz] = node.scale ?? [1, 1, 1];
    return { t: [tx, ty, tz], r: [rx, ry, rz, rw], s: [sx, sy, sz] };
};

/**
 * Where every node of the file ends up, walked once from the roots of the scene.
 *
 * Needed because **a bone's place includes everything above it, not just the bones above it**. A
 * rig is nearly always kept inside something: an export from Blender puts the whole scene under one
 * node that turns it upright, and the numbers undoing the rest position were written knowing about
 * that turn. Walking only the bones leaves it out, and the model is drawn a quarter turn from where
 * it belongs. It shows on files that have such a node and on no others, which is exactly how it
 * gets shipped.
 */
const worldOfEveryNode = (doc: TGltfDoc): Map<number, Mat4> => {
    const nodes = doc.nodes ?? [];
    const found = new Map<number, Mat4>();
    const seen = new Set<number>();

    const visit = (index: number, parent: Mat4): void => {
        const node = nodes[index];
        if (node === undefined || seen.has(index)) {
            return;
        }
        seen.add(index);
        const world = mat.multiply(parent, localMatrixOf(node));
        found.set(index, world);
        for (const child of node.children ?? []) {
            visit(child, world);
        }
    };

    for (const root of doc.scenes?.[doc.scene ?? 0]?.nodes ?? []) {
        visit(root, mat.create());
    }
    return found;
};

/**
 * Puts the bones in an order where every one comes after the bone it hangs from.
 *
 * **Everything downstream depends on this and nothing else checks it.** Working out where a bone
 * ended up is one pass from the front, which is only right if its parent was already done; a file
 * that lists a hand before the arm it hangs from would come out folded through itself. Core notices
 * and warns and carries on regardless, which means the model is wrong and the console says so in a
 * line nobody reads.
 *
 * Returns where each bone moved to, so the corners can be renumbered to match.
 */
const inParentOrder = (parentOf: Int32Array): Int32Array => {
    const count = parentOf.length;
    const order: number[] = [];
    const placed = new Int8Array(count);

    // Repeated sweeps: each one takes every bone whose parent is already down. A file in the usual
    // order finishes in one sweep, so the ordinary case pays a single walk.
    let added = -1;
    while (added !== 0 && order.length < count) {
        added = 0;
        for (let j = 0; j < count; j++) {
            if (placed[j] === 1) {
                continue;
            }
            const parent = parentOf[j];
            if (parent < 0 || placed[parent] === 1) {
                order.push(j);
                placed[j] = 1;
                added++;
            }
        }
    }

    // A loop in the file would leave bones unplaced. They go on the end as roots rather than
    // vanishing: a model drawn oddly is easier to recognise than a model missing an arm.
    for (let j = 0; j < count; j++) {
        if (placed[j] === 0) {
            order.push(j);
        }
    }
    return Int32Array.from(order);
};

/**
 * Reads one rig: which nodes are bones, which hangs from which, how they stand at rest, and what
 * undoes that rest position.
 *
 * `renumber` comes back beside the skeleton because the corners of the model name their bones by
 * the position the file put them in, and this may have moved them.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const readSkin = (
    doc: TGltfDoc,
    buffers: ArrayBuffer[],
    skinIndex: number,
    key: string,
): { skeleton: TSkeleton; renumber: Int32Array } => {
    const skin = doc.skins?.[skinIndex];
    if (skin === undefined) {
        throw new Error('[NacatamalOn] useLoadGltf: the file points at a rig it does not contain.');
    }

    const nodes = doc.nodes ?? [];
    const jointNodes = skin.joints;
    const count = jointNodes.length;
    const nodeToJoint = new Map<number, number>();
    for (let j = 0; j < count; j++) {
        nodeToJoint.set(jointNodes[j], j);
    }

    // The file says which bones hang from a bone; what is needed is the other way round.
    const parentOf = new Int32Array(count).fill(-1);
    for (let j = 0; j < count; j++) {
        for (const child of nodes[jointNodes[j]]?.children ?? []) {
            const asJoint = nodeToJoint.get(child);
            if (asJoint !== undefined) {
                parentOf[asJoint] = j;
            }
        }
    }

    // What sits above each bone that hangs from nothing. Only they need it: a bone inside the rig
    // is already carried by the one above it.
    const placed = worldOfEveryNode(doc);
    const order = inParentOrder(parentOf);
    // Where each bone went, so the corners and the rest matrices can follow it.
    const renumber = new Int32Array(count);
    for (let position = 0; position < count; position++) {
        renumber[order[position]] = position;
    }

    const parentIndex = new Int32Array(count);
    const bindPose: TJointPose[] = new Array(count);
    let roots: Float32Array | null = null;

    for (let position = 0; position < count; position++) {
        const was = order[position];
        const parent = parentOf[was];
        parentIndex[position] = parent < 0 ? -1 : renumber[parent];
        bindPose[position] = restOf(nodes[jointNodes[was]] ?? {});

        if (parent < 0) {
            // Its own place, taken back out of where it ended up: what is left is everything above
            // it. Kept apart from the bone's own standing, which an animation is free to write over.
            const world = placed.get(jointNodes[was]);
            const own = localMatrixOf(nodes[jointNodes[was]] ?? {});
            if (world !== undefined) {
                const above = mat.multiply(world, mat.invert(own));
                if (!isIdentity(above)) {
                    roots = roots ?? identityRuns(count);
                    roots.set(above, position * 16);
                }
            }
        }
    }

    // Without them every bone rests at the origin, which is what the format says to assume.
    const given = skin.inverseBindMatrices !== undefined ? readFloats(doc, buffers, skin.inverseBindMatrices) : null;
    const inverseBindMatrices = new Float32Array(count * 16);
    for (let position = 0; position < count; position++) {
        const was = order[position];
        if (given !== null) {
            inverseBindMatrices.set(given.subarray(was * 16, was * 16 + 16), position * 16);
        } else {
            inverseBindMatrices[position * 16] = 1;
            inverseBindMatrices[position * 16 + 5] = 1;
            inverseBindMatrices[position * 16 + 10] = 1;
            inverseBindMatrices[position * 16 + 15] = 1;
        }
    }

    return { skeleton: newSkeleton(key, parentIndex, bindPose, inverseBindMatrices, roots), renumber };
};

/**
 * Which bone of which rig a node is, across every rig in the file.
 *
 * Animation names what it moves by node, and a node may be a bone of one rig or of none.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const jointLookup = (doc: TGltfDoc, renumbers: Int32Array[]): Map<number, { skeleton: number; joint: number }> => {
    const found = new Map<number, { skeleton: number; joint: number }>();
    (doc.skins ?? []).forEach((skin, skeleton) => {
        skin.joints.forEach((node, was) => {
            if (!found.has(node)) {
                found.set(node, { skeleton, joint: renumbers[skeleton]?.[was] ?? was });
            }
        });
    });
    return found;
};
