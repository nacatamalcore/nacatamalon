import { getColor } from '../color';
import { computeModelMatrix } from '../render/shared/compute_mvp_3d';
import * as mat from '../math/mat4';
import { getActiveBox, getActiveGame } from '../store';
import { outsideSceneBody } from '../utils/outside_scene_body';
import { ownGeometry } from './create_geometry';
import { cornersOf } from './kept_corners';
import { COLOR_STRIDE, GEOMETRY_STRIDE } from './types/t_geometry';
import type { TMeshInstancePlacement } from '../gameobjects/mesh/types/t_mesh_instances';
import type { TTransform3d } from '../gameobjects/types/t_transform_3d';
import type { TKeptCorners } from './kept_corners';
import type { TGeometry } from './types/t_geometry';

/**
 * One piece of a `mergeGeometries`: a shape, and where it sits in the merged one, said the way an
 * instance of `createMeshInstances` is placed. Everything left out is the plain answer: at the middle,
 * unturned, its own size, and white.
 *
 * @category Geometry
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMergePiece = Omit<TMeshInstancePlacement, 'data' | 'tint'> & {
    /**
     * The shape: one of a shape hook's, one made by `createGeometry`, or one made by another
     * `mergeGeometries`.
     */
    geometry: TGeometry;
    /**
     * Its colour, painted on its corners in the merged shape and so multiplied into the material's
     * tint and picture, as a corner colour of its own is: pieces that differ only in colour (red and
     * black pockets, a team's shirts) then share one material and one draw. Its alpha below 1 is
     * only seen through on a material that is `transparent`, or cut out with `alphaCutoff`.
     */
    tint?: TMeshInstancePlacement['tint'];
};

const placeScratch = mat.create();
const whereScratch: TTransform3d = { x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1, quaternion: null };

/**
 * Where a piece sits, as the matrix that takes its corners there.
 */
const matrixOf = (piece: TMergePiece) => {
    const size = piece.scale ?? 1;
    whereScratch.x = piece.x ?? 0;
    whereScratch.y = piece.y ?? 0;
    whereScratch.z = piece.z ?? 0;
    whereScratch.rotation = piece.rotation ?? 0;
    whereScratch.rotationX = piece.rotationX ?? 0;
    whereScratch.rotationY = piece.rotationY ?? 0;
    whereScratch.quaternion = piece.quaternion ?? null;
    whereScratch.scaleX = piece.scaleX ?? size;
    whereScratch.scaleY = piece.scaleY ?? size;
    whereScratch.scaleZ = piece.scaleZ ?? size;
    return computeModelMatrix(whereScratch, placeScratch);
};

/**
 * Why a piece's shape cannot be read again, or nothing when it can.
 */
const unreadable = (geometry: TGeometry): string | null => {
    if (geometry.source?.kind === 'gltf') {
        return 'is a piece of a model file, whose corners are on the graphics card alone';
    }
    if (geometry.status === 'loading') {
        return 'is still loading';
    }
    if (geometry.skinBuffer !== null) {
        return 'is moved by bones, which a merged shape does not have';
    }
    if (geometry.vertexBuffer === null) {
        return 'was let go of with the object that made it';
    }
    return null;
};

/**
 * Makes one shape out of several, each where it sits: a fence of posts and rails, a table of a top
 * and four legs, the separators round a wheel. Hand it to `createMesh`, and what was a draw a piece
 * is one draw.
 *
 * **One draw only for pieces that share a surface.** A merged shape is drawn in one material, so
 * pieces in nine materials are nine merges and nine meshes, not one. Pieces that differ only in colour
 * can share one, with a `tint` each painted on their corners.
 *
 * Each piece is placed as an instance of `createMeshInstances` is: `x`, `y`, `z`, a turn in radians
 * (`rotationX`, `rotationY`, `rotation` about Z, or a `quaternion`), a `scale`, or `scaleX`, `scaleY`,
 * `scaleZ` one way apart. Its facings turn with it, and a piece mirrored by a negative scale is turned
 * inside out again, so it is seen from the same side as before. Every piece keeps its picture places,
 * so one picture is laid on each as it was on its own.
 *
 * Pieces may be any shape hook's, one made by `createGeometry`, or another merge. Not a piece of a
 * model file: its corners are on the graphics card alone and cannot be read back. A shape hook's is
 * built again from its recipe to be read, once a merge however many pieces wear it.
 *
 * **It belongs to the object that made it**, as one from `createGeometry` does: it goes when the object
 * goes, and `updateGeometry` changes it. It is made in code, in the body of the object that wears it:
 * a scene document cannot write it down. The pieces are read once, when it is made, so changing one
 * later does not change it.
 *
 * Merge what does not move apart. Pieces that each move are separate meshes; many of one shape, each
 * placed apart, are `createMeshInstances`.
 *
 * @param pieces The shapes, each with where it sits.
 * @returns The merged shape, to hand to `createMesh`.
 *
 * @example
 * ```ts
 * const Fence = () => {
 *     useCamera3d({ projection: 'perspective', transform: { y: 2, z: 8 } });
 *     useDirectionalLight({ intensity: 1 });
 *
 *     const post = useCubeGeometry({ width: 0.2, height: 1.2, depth: 0.2 });
 *     const rail = useCubeGeometry({ width: 6, height: 0.15, depth: 0.1 });
 *     const pieces: TMergePiece[] = [];
 *     for (let i = 0; i < 7; i++) {
 *         pieces.push({ geometry: post, x: i - 3, y: 0.6 });
 *     }
 *     pieces.push({ geometry: rail, y: 0.4 }, { geometry: rail, y: 0.9 });
 *
 *     // Nine pieces, one draw.
 *     createMesh({ geometry: mergeGeometries(pieces), tint: '#a0703d' });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Geometry
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const mergeGeometries = (pieces: readonly TMergePiece[]): TGeometry => {
    if (getActiveGame() === null || getActiveBox() === null) {
        throw outsideSceneBody('mergeGeometries');
    }
    if (!Array.isArray(pieces) || pieces.length === 0) {
        throw new Error('[NacatamalOn] mergeGeometries: no pieces. Give it a list of { geometry, x, y, z, … }, one for each shape where it sits.');
    }

    // Every piece read and checked before anything is laid out, so a mistake in the last one is said
    // before any work is done.
    const read: Array<{ corners: TKeptCorners; matrix: Float32Array; det: number; tint: { r: number; g: number; b: number; a: number } | null }> = [];
    // Each shape read once however many pieces wear it: a shape hook's is built again to be read.
    const shapes = new Map<TGeometry, TKeptCorners | null>();
    for (const [i, piece] of pieces.entries()) {
        const geometry = piece?.geometry;
        if (geometry === undefined || geometry === null || geometry.type !== 'geometry') {
            throw new Error(`[NacatamalOn] mergeGeometries: piece ${i} has no geometry. Each piece is { geometry, … }, the shape from a shape hook, createGeometry or another merge.`);
        }
        const why = unreadable(geometry);
        if (why === null && !shapes.has(geometry)) {
            shapes.set(geometry, cornersOf(geometry));
        }
        const corners = why === null ? shapes.get(geometry) ?? null : null;
        if (corners === null) {
            throw new Error(
                `[NacatamalOn] mergeGeometries: piece ${i}, '${geometry.key}', ${why ?? 'keeps no way to read its corners again'}. ` +
                'A merge reads the corners of shapes from a shape hook, createGeometry or another merge.',
            );
        }
        const matrix = Float32Array.from(matrixOf(piece));
        if (!matrix.every(Number.isFinite)) {
            throw new Error(`[NacatamalOn] mergeGeometries: piece ${i} is placed at something that is not a number. Its x, y, z, turns and scales take numbers.`);
        }
        const det = determinant(matrix);
        if (det === 0) {
            throw new Error(`[NacatamalOn] mergeGeometries: piece ${i} has a scale of 0 one way, which squashes it flat with no way to face. Leave it out.`);
        }
        read.push({ corners, matrix, det, tint: piece.tint === undefined ? null : getColor(piece.tint) });
    }

    let cornerCount = 0;
    let indexCount = 0;
    let painted = false;
    let withUv2 = false;
    for (const { corners, tint } of read) {
        cornerCount += corners.vertices.length / GEOMETRY_STRIDE;
        indexCount += corners.indices.length;
        painted ||= corners.colors !== null || tint !== null;
        withUv2 ||= corners.uv2 !== null;
    }

    const vertices = new Float32Array(cornerCount * GEOMETRY_STRIDE);
    // The narrow kind holds corners up to 65535, the number it keeps for starting a new strip.
    const indices = cornerCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
    // Only when a piece has them: one painted is white everywhere else, one with a second place has
    // its first again everywhere else, as a shape left without them reads.
    const colors = painted ? new Uint8Array(cornerCount * COLOR_STRIDE).fill(255) : null;
    const uv2 = withUv2 ? new Float32Array(cornerCount * 2) : null;

    let cornerAt = 0;
    let indexAt = 0;
    for (const { corners, matrix: m, det, tint } of read) {
        const count = corners.vertices.length / GEOMETRY_STRIDE;
        // Facings turn by the inverse of the turn and scale, transposed: a piece stretched one way
        // leans its facings the other, and stays lit as its surface lies. Its cofactors are that up to
        // the determinant, whose sign is kept so a mirrored piece still faces out.
        const flip = det < 0 ? -1 : 1;
        const n00 = (m[5] * m[10] - m[9] * m[6]) * flip;
        const n01 = -(m[1] * m[10] - m[9] * m[2]) * flip;
        const n02 = (m[1] * m[6] - m[5] * m[2]) * flip;
        const n10 = -(m[4] * m[10] - m[8] * m[6]) * flip;
        const n11 = (m[0] * m[10] - m[8] * m[2]) * flip;
        const n12 = -(m[0] * m[6] - m[4] * m[2]) * flip;
        const n20 = (m[4] * m[9] - m[8] * m[5]) * flip;
        const n21 = -(m[0] * m[9] - m[8] * m[1]) * flip;
        const n22 = (m[0] * m[5] - m[4] * m[1]) * flip;

        for (let c = 0; c < count; c++) {
            const from = c * GEOMETRY_STRIDE;
            const to = (cornerAt + c) * GEOMETRY_STRIDE;
            const src = corners.vertices;
            const px = src[from];
            const py = src[from + 1];
            const pz = src[from + 2];
            vertices[to] = m[0] * px + m[4] * py + m[8] * pz + m[12];
            vertices[to + 1] = m[1] * px + m[5] * py + m[9] * pz + m[13];
            vertices[to + 2] = m[2] * px + m[6] * py + m[10] * pz + m[14];
            const nx = src[from + 3];
            const ny = src[from + 4];
            const nz = src[from + 5];
            const fx = n00 * nx + n01 * ny + n02 * nz;
            const fy = n10 * nx + n11 * ny + n12 * nz;
            const fz = n20 * nx + n21 * ny + n22 * nz;
            const length = Math.hypot(fx, fy, fz);
            const unit = length > 0 ? 1 / length : 0;
            vertices[to + 3] = fx * unit;
            vertices[to + 4] = fy * unit;
            vertices[to + 5] = fz * unit;
            vertices[to + 6] = src[from + 6];
            vertices[to + 7] = src[from + 7];
        }

        // A mirrored piece has its triangles the other way round, and would be seen from inside: two
        // of each three swapped turn it back.
        const given = corners.indices;
        for (let i = 0; i < given.length; i += 3) {
            indices[indexAt + i] = given[i] + cornerAt;
            indices[indexAt + i + 1] = given[det < 0 ? i + 2 : i + 1] + cornerAt;
            indices[indexAt + i + 2] = given[det < 0 ? i + 1 : i + 2] + cornerAt;
        }

        if (colors !== null) {
            const r = tint?.r ?? 1;
            const g = tint?.g ?? 1;
            const b = tint?.b ?? 1;
            const a = tint?.a ?? 1;
            for (let c = 0; c < count; c++) {
                const from = c * COLOR_STRIDE;
                const to = (cornerAt + c) * COLOR_STRIDE;
                const own = corners.colors;
                colors[to] = Math.round((own === null ? 255 : own[from]) * clamp01(r));
                colors[to + 1] = Math.round((own === null ? 255 : own[from + 1]) * clamp01(g));
                colors[to + 2] = Math.round((own === null ? 255 : own[from + 2]) * clamp01(b));
                colors[to + 3] = Math.round((own === null ? 255 : own[from + 3]) * clamp01(a));
            }
        }

        if (uv2 !== null) {
            for (let c = 0; c < count; c++) {
                const to = (cornerAt + c) * 2;
                uv2[to] = corners.uv2 === null ? corners.vertices[c * GEOMETRY_STRIDE + 6] : corners.uv2[c * 2];
                uv2[to + 1] = corners.uv2 === null ? corners.vertices[c * GEOMETRY_STRIDE + 7] : corners.uv2[c * 2 + 1];
            }
        }

        cornerAt += count;
        indexAt += given.length;
    }

    return ownGeometry('mergeGeometries', { vertices, indices, colors, uv2 });
};

const clamp01 = (value: number): number => (Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 1);

/**
 * How much the turn and scale of a placement grow a volume, signed: below 0 for one mirrored.
 */
const determinant = (m: Float32Array): number =>
    m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
