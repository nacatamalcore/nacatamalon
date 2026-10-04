import { GEOMETRY_STRIDE, SKIN_STRIDE } from '../../geometry';
import { computeNormals, toFlatShaded } from './shading';
import { readColors, readFloats, readIndices, readJoints } from './read_accessors';
import { GLTF_MODE_TRIANGLES } from './types/t_gltf_doc';
import type { Mat4 } from '../../math/mat4';
import type { TGltfDoc } from './types/t_gltf_doc';
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
 * Turns a facing by a placement, and brings it back to length one.
 *
 * The honest answer needs the placement inverted and flipped, which differs from this one only when
 * a piece was stretched more one way than another. Files do that rarely, and paying for an inverted
 * matrix per piece to be right about it is not the trade this engine makes. The limit is real and
 * is written down here so it is found when it bites.
 */
const moveDirection = (m: Mat4, x: number, y: number, z: number): [number, number, number] => {
    const nx = m[0] * x + m[4] * y + m[8] * z;
    const ny = m[1] * x + m[5] * y + m[9] * z;
    const nz = m[2] * x + m[6] * y + m[10] * z;
    const length = Math.hypot(nx, ny, nz) || 1;
    return [nx / length, ny / length, nz / length];
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

    for (const node of nodes) {
        const mesh = doc.meshes?.[node.meshIndex];
        if (mesh === undefined) {
            continue;
        }

        for (const primitive of mesh.primitives) {
            // Lines and points are left out rather than drawn as triangles, which would be nonsense
            // on screen. Absent means triangles, by the format's own default.
            if (primitive.mode !== undefined && primitive.mode !== GLTF_MODE_TRIANGLES) {
                continue;
            }
            if (primitive.attributes.POSITION === undefined) {
                throw new Error('[NacatamalOn] useLoadGltf: a piece of the model does not say where its corners are.');
            }

            // A deformed piece is put where it belongs BY ITS BONES, so the node's own placement
            // must not also be worked into its corners: doing both applies it twice and scatters
            // the model across the scene.
            const deformed = node.skinIndex !== undefined
                && primitive.attributes.JOINTS_0 !== undefined
                && primitive.attributes.WEIGHTS_0 !== undefined;
            const place = deformed ? null : node.world;

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

            const vertices = new Float32Array(count * GEOMETRY_STRIDE);
            for (let i = 0; i < count; i++) {
                const [px, py, pz] = place === null
                    ? [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]]
                    : movePoint(place, positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
                const [nx, ny, nz] = place === null
                    ? [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]]
                    : moveDirection(place, normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]);
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
                const renumber = renumbers[node.skinIndex as number];
                skin = new Float32Array(count * SKIN_STRIDE);
                for (let i = 0; i < count; i++) {
                    const at = i * SKIN_STRIDE;
                    for (let c = 0; c < 4; c++) {
                        const bone = joints[i * 4 + c] ?? 0;
                        skin[at + c] = renumber === undefined ? bone : renumber[bone] ?? bone;
                        skin[at + 4 + c] = weights[i * 4 + c] ?? 0;
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
            parts.push({
                name: node.name,
                vertices: shaped.vertices,
                indices: shaped.indices,
                skin: shaped.skin,
                colors: shaped.colors,
                skeleton: deformed ? node.skinIndex : undefined,
                materialIndex: primitive.material,
            });
        }
    }

    return parts;
};
