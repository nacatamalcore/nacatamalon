import { computeDetail, GEOMETRY_STRIDE, SKIN_STRIDE } from '../../geometry';
import { computeNormals, splitPerCorner, toFlatShaded } from './shading';
import { readColors, readFloats, readIndices, readJoints } from './read_accessors';
import { GLTF_MODE_TRIANGLES } from './types/t_gltf_doc';
import * as mat from '../../math/mat4';
import type { Mat4 } from '../../math/mat4';
import type { TGltfDoc } from './types/t_gltf_doc';
import { findMeshNodes } from './find_mesh_nodes';
import type { TMeshNode } from './find_mesh_nodes';
import type { TShading } from './shading';

/**
 * The corners of one piece, ready to go on the graphics card, and which surface of the file it
 * wears.
 *
 * @internal
 */
export type TBuiltPart = {
    name: string;
    /**
     * Which of the pieces called `name` it is, from 0, counted over the whole file (see
     * `occurrencesOf`).
     */
    occurrence: number;
    vertices: Float32Array;
    indices: Uint16Array | Uint32Array;
    materialIndex: number | undefined;
    /**
     * Which bones move each corner and how much, or `null` when nothing deforms it.
     */
    skin: Float32Array | null;
    /**
     * The colour painted on each corner, four screen bytes apiece, or `null` when none was.
     */
    colors: Uint8Array | null;
    /**
     * The detail run (tangents and second picture coordinates) when the file had either, or `null`
     * for the engine to work it all out when the shape is made.
     */
    detail: Float32Array | null;
    /**
     * Which rig deforms it, as a place in the model's list of them.
     */
    skeleton: number | undefined;
};

/**
 * Moves a point by a placement.
 */
const movePoint = (m: Mat4, x: number, y: number, z: number): [number, number, number] => [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
];

/**
 * Turns a direction by a matrix, and brings it back to length one.
 *
 * A direction along the surface (a tangent) is turned by the placement itself; a facing is turned by
 * `mat.normalMatrix` of it, which tells the two apart when a piece was stretched more one way than
 * another.
 */
const moveDirection = (m: Mat4, x: number, y: number, z: number): [number, number, number] => {
    const nx = m[0] * x + m[4] * y + m[8] * z;
    const ny = m[1] * x + m[5] * y + m[9] * z;
    const nz = m[2] * x + m[6] * y + m[10] * z;
    const length = Math.hypot(nx, ny, nz) || 1;
    return [nx / length, ny / length, nz / length];
};

/**
 * Whether a piece of a mesh is drawn: lines and points are left out rather than drawn as triangles,
 * which would be nonsense on screen. Absent means triangles, by the format's own default.
 */
const drawn = (primitive: { mode?: number }): boolean =>
    primitive.mode === undefined || primitive.mode === GLTF_MODE_TRIANGLES;

/**
 * Which of the pieces of its name each piece of the file is, from 0, by `node/primitive`.
 *
 * A node drawn in two materials is two pieces with the node's name, and a file may leave nodes
 * unnamed or name two alike: the name alone does not tell them apart, and this number does. Counted
 * in the order the loader walks the file, the same every time: the nodes of its scene depth first,
 * each before the ones under it and those in the order the file lists them, then the pieces of each
 * in the order its mesh lists them. Counted over the whole file even when only part of it is taken,
 * so a piece has the same number however it was loaded.
 */
const occurrencesOf = (doc: TGltfDoc): Map<string, number> => {
    const seen = new Map<string, number>();
    const occurrences = new Map<string, number>();
    for (const node of findMeshNodes(doc)) {
        const primitives = doc.meshes?.[node.meshIndex]?.primitives ?? [];
        primitives.forEach((primitive, at) => {
            if (!drawn(primitive)) return;
            const count = seen.get(node.name) ?? 0;
            seen.set(node.name, count + 1);
            occurrences.set(`${node.index}/${at}`, count);
        });
    }
    return occurrences;
};

/**
 * Corners numbered straight through, for a piece that did not say which order to use.
 */
const sequentialIndices = (count: number): Uint16Array | Uint32Array => {
    const out = count > 65535 ? new Uint32Array(count) : new Uint16Array(count);
    for (let i = 0; i < count; i++) {
        out[i] = i;
    }
    return out;
};

/**
 * Room for one corner's bones while the heaviest are picked out, reused: corners are read one after
 * another.
 */
const candidateBones = new Float32Array(8);
const candidateWeights = new Float32Array(8);

/**
 * The bones a corner is moved by, out of the eight two sets give it: a bone named in both counts
 * once with both its weights, and of what is left only the four that weigh the most are kept,
 * heaviest first. Bones and weights go into `skin` at `at`, bones then weights, as the card reads
 * them; the weights are brought back to one by whoever calls this, with the rest.
 *
 * Four because that is what the card is given a corner. What falls off is the fifth bone onwards,
 * which moves a corner least, so a face rigged with eight bends almost as it was rigged.
 */
const heaviestFour = (
    joints: Float32Array,
    weights: Float32Array,
    moreJoints: Float32Array,
    moreWeights: Float32Array,
    corner: number,
    skin: Float32Array,
    at: number,
): void => {
    let found = 0;
    for (let c = 0; c < 8; c++) {
        const bone = (c < 4 ? joints[corner * 4 + c] : moreJoints[corner * 4 + c - 4]) ?? 0;
        const weight = (c < 4 ? weights[corner * 4 + c] : moreWeights[corner * 4 + c - 4]) ?? 0;
        if (!(weight > 0)) {
            continue;
        }
        let k = 0;
        while (k < found && candidateBones[k] !== bone) k++;
        if (k < found) {
            candidateWeights[k] += weight;
        } else {
            candidateBones[found] = bone;
            candidateWeights[found] = weight;
            found++;
        }
    }
    // Heaviest first, keeping the order they came in between equals.
    for (let a = 1; a < found; a++) {
        const bone = candidateBones[a];
        const weight = candidateWeights[a];
        let b = a - 1;
        while (b >= 0 && candidateWeights[b] < weight) {
            candidateBones[b + 1] = candidateBones[b];
            candidateWeights[b + 1] = candidateWeights[b];
            b--;
        }
        candidateBones[b + 1] = bone;
        candidateWeights[b + 1] = weight;
    }
    for (let c = 0; c < 4; c++) {
        skin[at + c] = c < found ? candidateBones[c] : 0;
        skin[at + 4 + c] = c < found ? candidateWeights[c] : 0;
    }
};

/**
 * Builds every drawable piece of a model out of the file.
 *
 * **Where each piece sits is worked into its corners here**, which is the one place it happens.
 * That is why two models loaded from the same file share one set of corners on the graphics card:
 * the answer depends on the file alone and not on where anybody later put the model. It is also
 * what lets the whole model be moved by a single placement, however many pieces deep its own tree
 * went.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const buildParts = (
    doc: TGltfDoc,
    buffers: ArrayBuffer[],
    nodes: TMeshNode[],
    shading: TShading,
    renumbers: Int32Array[] = [],
): TBuiltPart[] => {
    const parts: TBuiltPart[] = [];
    const occurrences = occurrencesOf(doc);

    for (const node of nodes) {
        const mesh = doc.meshes?.[node.meshIndex];
        if (mesh === undefined) {
            continue;
        }

        for (let at = 0; at < mesh.primitives.length; at++) {
            const primitive = mesh.primitives[at];
            if (!drawn(primitive)) {
                continue;
            }
            if (primitive.attributes.POSITION === undefined) {
                throw new Error('[NacatamalOn] useLoadModel: a piece of the model does not say where its corners are.');
            }

            // A deformed piece is put where it belongs BY ITS BONES, so the node's own placement
            // must not also be worked into its corners: doing both applies it twice and scatters
            // the model across the scene.
            const deformed = node.skinIndex !== undefined
                && primitive.attributes.JOINTS_0 !== undefined
                && primitive.attributes.WEIGHTS_0 !== undefined;
            const place = deformed ? null : node.world;
            const facing = place === null ? null : mat.normalMatrix(place);

            const positions = readFloats(doc, buffers, primitive.attributes.POSITION);
            const count = positions.length / 3;
            const indices = primitive.indices !== undefined
                ? readIndices(doc, buffers, primitive.indices)
                : sequentialIndices(count);

            // Flat writes every facing again once the corners have been split, so anything put here
            // would be thrown away. Asking for smooth, or asking for whatever the file has when it
            // has none, works them out instead: a piece with no facings would be drawn black.
            const normals = shading === 'flat'
                ? new Float32Array(count * 3)
                : shading === 'auto' && primitive.attributes.NORMAL !== undefined
                    ? readFloats(doc, buffers, primitive.attributes.NORMAL)
                    : computeNormals(positions, indices);

            const uvs = primitive.attributes.TEXCOORD_0 !== undefined
                ? readFloats(doc, buffers, primitive.attributes.TEXCOORD_0)
                : new Float32Array(count * 2);

            // The file's own tangents (the way across, and its hand) and second coordinates, when it
            // has them. A tangent lies along the surface, so it is turned by the piece's placement
            // itself, where a facing is turned by the inverse of it.
            const tangents = primitive.attributes.TANGENT !== undefined && shading !== 'flat'
                ? readFloats(doc, buffers, primitive.attributes.TANGENT)
                : null;
            if (tangents !== null && place !== null) {
                for (let i = 0; i < count; i++) {
                    const [tx, ty, tz] = moveDirection(place, tangents[i * 4], tangents[i * 4 + 1], tangents[i * 4 + 2]);
                    tangents[i * 4] = tx;
                    tangents[i * 4 + 1] = ty;
                    tangents[i * 4 + 2] = tz;
                }
            }
            const uv2 = primitive.attributes.TEXCOORD_1 !== undefined
                ? readFloats(doc, buffers, primitive.attributes.TEXCOORD_1)
                : null;

            const vertices = new Float32Array(count * GEOMETRY_STRIDE);
            for (let i = 0; i < count; i++) {
                const [px, py, pz] = place === null
                    ? [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]]
                    : movePoint(place, positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
                const [nx, ny, nz] = facing === null
                    ? [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]]
                    : moveDirection(facing, normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]);
                const base = i * GEOMETRY_STRIDE;
                vertices[base] = px;
                vertices[base + 1] = py;
                vertices[base + 2] = pz;
                vertices[base + 3] = nx;
                vertices[base + 4] = ny;
                vertices[base + 5] = nz;
                vertices[base + 6] = uvs[i * 2] ?? 0;
                vertices[base + 7] = uvs[i * 2 + 1] ?? 0;
            }

            // Which bones, and how much of each. Renumbered, because putting the bones in an order
            // where parents come first may have moved them since the file counted them.
            let skin: Float32Array | null = null;
            if (deformed) {
                const joints = readJoints(doc, buffers, primitive.attributes.JOINTS_0 as number);
                const weights = readFloats(doc, buffers, primitive.attributes.WEIGHTS_0 as number);
                // A second four, for a corner moved by more bones than four: a face drawn in detail.
                // Only read as a pair, since bones with no weights (or weights with no bones) say nothing.
                const more = primitive.attributes.JOINTS_1 !== undefined && primitive.attributes.WEIGHTS_1 !== undefined
                    ? { joints: readJoints(doc, buffers, primitive.attributes.JOINTS_1), weights: readFloats(doc, buffers, primitive.attributes.WEIGHTS_1) }
                    : null;
                const renumber = renumbers[node.skinIndex as number];
                skin = new Float32Array(count * SKIN_STRIDE);
                for (let i = 0; i < count; i++) {
                    const at = i * SKIN_STRIDE;
                    if (more !== null) {
                        heaviestFour(joints, weights, more.joints, more.weights, i, skin, at);
                    } else {
                        for (let c = 0; c < 4; c++) {
                            skin[at + c] = joints[i * 4 + c] ?? 0;
                            skin[at + 4 + c] = weights[i * 4 + c] ?? 0;
                        }
                    }
                    let total = 0;
                    for (let c = 0; c < 4; c++) {
                        const bone = skin[at + c];
                        skin[at + c] = renumber === undefined ? bone : renumber[bone] ?? bone;
                        total += skin[at + 4 + c];
                    }
                    // The four are meant to add up to one, and a file rounded on the way out often
                    // misses by a little, as four kept out of eight always do: brought back to one, a corner is always somewhere between
                    // where its bones would each put it, which is what a model is measured by to be
                    // left out of a view. A corner moved by nothing is left as it is.
                    if (total > 0 && Math.abs(total - 1) > 1e-6) {
                        for (let c = 0; c < 4; c++) {
                            skin[at + 4 + c] /= total;
                        }
                    }
                }
            }

            // Painted colours are carried as they are: a corner that moves with the piece keeps its
            // colour wherever it ends up.
            const colors = primitive.attributes.COLOR_0 !== undefined
                ? readColors(doc, buffers, primitive.attributes.COLOR_0)
                : null;

            const shaped = shading === 'flat'
                ? toFlatShaded(vertices, indices, skin, colors)
                : { vertices, indices, skin, colors };
            // Flat shading splits the corners and faces each triangle again, so the file's tangents
            // (read only when not flat) are left behind with its facings and worked out afresh;
            // the second coordinates are split like everything else held one per corner.
            const flatUv2 = uv2 !== null && shading === 'flat' ? splitPerCorner(uv2, 2, indices) : uv2;
            const detail = tangents !== null || flatUv2 !== null
                ? computeDetail(shaped.vertices, shaped.indices, tangents, flatUv2)
                : null;
            parts.push({
                name: node.name,
                occurrence: occurrences.get(`${node.index}/${at}`) ?? 0,
                vertices: shaped.vertices,
                indices: shaped.indices,
                skin: shaped.skin,
                colors: shaped.colors,
                detail,
                skeleton: deformed ? node.skinIndex : undefined,
                materialIndex: primitive.material,
            });
        }
    }

    return parts;
};
