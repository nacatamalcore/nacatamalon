import * as mat from '../../math/mat4';
import type { Mat4 } from '../../math/mat4';
import { computeModelMatrix, fillCameraSpace, newCameraSpace } from './compute_mvp_3d';
import type { TCameraSpace } from './compute_mvp_3d';
import type { TDrawCamera3d } from '../interface/draw/t_draw_camera_3d';
import type { TDrawMesh } from '../interface/draw/t_draw_mesh';

/**
 * Where a model's placement and the whole way onto the screen are worked out. Never handed out.
 */
const modelScratch = mat.create();
const uprightScratch = mat.create();
const clipScratch = mat.create();
/** A model's own `y` turned over, as `fillMeshUniforms` stands it in a world whose `y` goes down. */
const UPRIGHT = { x: 1, y: -1, z: 1 };

/**
 * Whether a model can put any pixel on the screen it is about to be drawn on, so one that cannot is
 * skipped before it costs anything: its numbers, its draw, every corner the card would have moved.
 *
 * The box around its shape is carried onto the screen with the same matrices it is drawn with, and
 * it is out when all eight of its corners are past the same edge: left, right, top, bottom, beyond
 * how far the camera sees, or behind it. A box past no single edge is kept even when it misses the
 * picture by a corner, which is rare and only costs a draw that shows nothing.
 *
 * The edges are the ones both backends agree on, so the same answer comes whether the matrix has had
 * WebGL2's depth fix folded in or not. The near one is left to `w`, the side of the camera a corner is
 * on: something between the camera and its near plane is drawn and cut by the card as before.
 *
 * **It answers `true` whenever it cannot be sure**, because a model that vanishes at the edge of the
 * screen is a fault nobody can explain, and one drawn for nothing is only slower:
 * - one that says `alwaysDrawn`;
 * - one with no box to measure;
 * - one whose material moves its corners in a shader (`vertex`), which no box on this side can know
 *   about, unless it says how far with `boundsMargin`.
 *
 * A model that bends is measured in the pose it is in, not the one it was made in: its box is taken
 * once by each of its bones, and every corner lies in what those cover, since a corner is a blend of
 * where its bones would each carry it.
 *
 * @param viewProjection - The way onto the screen of the view it is in, or a light's for its shadow.
 * @param flat - Seen through the 2D camera, where a model is turned upright first.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const meshInView = (mesh: TDrawMesh, viewProjection: Mat4, flat = false): boolean => {
    if (mesh.alwaysDrawn === true) {
        return true;
    }
    const bounds = mesh.geometry?.bounds ?? null;
    if (bounds === null) {
        return true;
    }
    const margin = mesh.boundsMargin;
    if (margin === undefined ? mesh.material.vertex !== null || mesh.material.vertexGlsl !== null : !Number.isFinite(margin)) {
        return true;
    }
    const pad = Math.max(0, margin ?? 0);

    // Its middle and half sizes, in its own space.
    let cx = (bounds.min.x + bounds.max.x) / 2;
    let cy = (bounds.min.y + bounds.max.y) / 2;
    let cz = (bounds.min.z + bounds.max.z) / 2;
    let ex = (bounds.max.x - bounds.min.x) / 2 + pad;
    let ey = (bounds.max.y - bounds.min.y) / 2 + pad;
    let ez = (bounds.max.z - bounds.min.z) / 2 + pad;

    const j = mesh.skeleton?.jointMatrices ?? null;
    if (j !== null && j.length >= 16) {
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (let at = 0; at + 16 <= j.length; at += 16) {
            const wx = j[at] * cx + j[at + 4] * cy + j[at + 8] * cz + j[at + 12];
            const wy = j[at + 1] * cx + j[at + 5] * cy + j[at + 9] * cz + j[at + 13];
            const wz = j[at + 2] * cx + j[at + 6] * cy + j[at + 10] * cz + j[at + 14];
            const hx = Math.abs(j[at]) * ex + Math.abs(j[at + 4]) * ey + Math.abs(j[at + 8]) * ez;
            const hy = Math.abs(j[at + 1]) * ex + Math.abs(j[at + 5]) * ey + Math.abs(j[at + 9]) * ez;
            const hz = Math.abs(j[at + 2]) * ex + Math.abs(j[at + 6]) * ey + Math.abs(j[at + 10]) * ez;
            minX = Math.min(minX, wx - hx); maxX = Math.max(maxX, wx + hx);
            minY = Math.min(minY, wy - hy); maxY = Math.max(maxY, wy + hy);
            minZ = Math.min(minZ, wz - hz); maxZ = Math.max(maxZ, wz + hz);
        }
        cx = (minX + maxX) / 2;
        cy = (minY + maxY) / 2;
        cz = (minZ + maxZ) / 2;
        ex = (maxX - minX) / 2;
        ey = (maxY - minY) / 2;
        ez = (maxZ - minZ) / 2;
    }

    let model = mesh.worldMatrix ?? computeModelMatrix(mesh.transform, modelScratch);
    if (flat) model = mat.scale(model, UPRIGHT, uprightScratch);
    const m = mat.multiply(viewProjection, model, clipScratch);

    // Each bit an edge; what is left after all eight is an edge every corner is past.
    let past = 0b111111;
    for (let corner = 0; corner < 8 && past !== 0; corner++) {
        const px = corner & 1 ? cx + ex : cx - ex;
        const py = corner & 2 ? cy + ey : cy - ey;
        const pz = corner & 4 ? cz + ez : cz - ez;
        const x = m[0] * px + m[4] * py + m[8] * pz + m[12];
        const y = m[1] * px + m[5] * py + m[9] * pz + m[13];
        const z = m[2] * px + m[6] * py + m[10] * pz + m[14];
        const w = m[3] * px + m[7] * py + m[11] * pz + m[15];
        past &= (x < -w ? 1 : 0) | (x > w ? 2 : 0) | (y < -w ? 4 : 0) | (y > w ? 8 : 0) | (z > w ? 16 : 0) | (w <= 0 ? 32 : 0);
    }
    return past === 0;
};

/**
 * The spaces of the cameras some view was told to skip by, kept between frames, and what each view
 * is judged by.
 */
const borrowed: TCameraSpace[] = [];
const judges: Mat4[] = [];

/**
 * What each view of a pass decides what it draws by: its own way onto the screen, or, for one whose
 * camera has a `cullingCamera`, that camera's, measured on the same size.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const cullingMatricesFor = (
    views: readonly { readonly camera: TDrawCamera3d | null }[],
    spaces: readonly TCameraSpace[],
    viewportWidth: number,
    viewportHeight: number,
): readonly Mat4[] => {
    judges.length = views.length;
    let lent = 0;
    for (let i = 0; i < views.length; i++) {
        const other = views[i].camera?.cullingCamera ?? null;
        if (other === null) {
            judges[i] = spaces[i].viewProjection;
            continue;
        }
        borrowed[lent] ??= newCameraSpace();
        judges[i] = fillCameraSpace(borrowed[lent], other, viewportWidth, viewportHeight).viewProjection;
        lent++;
    }
    return judges;
};
