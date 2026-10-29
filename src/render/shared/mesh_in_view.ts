import * as mat from '../../math/mat4';
import type { Mat4 } from '../../math/mat4';
import { computeModelMatrix, fillCameraSpace, newCameraSpace } from './compute_mvp_3d';
import type { TCameraSpace } from './compute_mvp_3d';
import { snapGridOf, UPRIGHT } from './fill_mesh_uniforms';
import type { TDrawCamera3d } from '../interface/draw/t_draw_camera_3d';
import type { TDrawMesh } from '../interface/draw/t_draw_mesh';

/**
 * Where a model's placement and the whole way onto the screen are worked out. Never handed out.
 */
const modelScratch = mat.create();
const uprightScratch = mat.create();
const clipScratch = mat.create();

/**
 * A box as a middle and half sizes, which is how one is carried by a matrix.
 */
type TBox = { cx: number; cy: number; cz: number; ex: number; ey: number; ez: number };

/**
 * The box a bending model's pose covers, kept with the pose it was worked out for: a model seen by
 * several views and a shadow in one frame is measured once, not once for each.
 */
type TPosedBox = TBox & { posedOn: number; bounds: object; pad: number };
const posed = new WeakMap<TDrawMesh, TPosedBox>();
const box: TBox = { cx: 0, cy: 0, cz: 0, ex: 0, ey: 0, ez: 0 };

const copyBox = (from: TBox, to: TBox): void => {
    to.cx = from.cx; to.cy = from.cy; to.cz = from.cz;
    to.ex = from.ex; to.ey = from.ey; to.ez = from.ez;
};

/**
 * The box a bending model's corners lie in, in the space its placement is laid over: its own box
 * carried by each of its bones, all of them together. A corner is a blend of where each of its bones
 * would carry it, and a blend of points inside a box is inside it.
 */
const coverPose = (joints: Float32Array, out: TBox): void => {
    const { cx, cy, cz, ex, ey, ez } = out;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let at = 0; at + 16 <= joints.length; at += 16) {
        const wx = joints[at] * cx + joints[at + 4] * cy + joints[at + 8] * cz + joints[at + 12];
        const wy = joints[at + 1] * cx + joints[at + 5] * cy + joints[at + 9] * cz + joints[at + 13];
        const wz = joints[at + 2] * cx + joints[at + 6] * cy + joints[at + 10] * cz + joints[at + 14];
        const hx = Math.abs(joints[at]) * ex + Math.abs(joints[at + 4]) * ey + Math.abs(joints[at + 8]) * ez;
        const hy = Math.abs(joints[at + 1]) * ex + Math.abs(joints[at + 5]) * ey + Math.abs(joints[at + 9]) * ez;
        const hz = Math.abs(joints[at + 2]) * ex + Math.abs(joints[at + 6]) * ey + Math.abs(joints[at + 10]) * ez;
        minX = Math.min(minX, wx - hx); maxX = Math.max(maxX, wx + hx);
        minY = Math.min(minY, wy - hy); maxY = Math.max(maxY, wy + hy);
        minZ = Math.min(minZ, wz - hz); maxZ = Math.max(maxZ, wz + hz);
    }
    out.cx = (minX + maxX) / 2;
    out.cy = (minY + maxY) / 2;
    out.cz = (minZ + maxZ) / 2;
    out.ex = (maxX - minX) / 2;
    out.ey = (maxY - minY) / 2;
    out.ez = (maxZ - minZ) / 2;
};

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
 * A model that bends is measured in the pose it is in, not the one it was made in (`coverPose`). One
 * whose corners land on a coarse grid (`vertexSnap`) can be pulled in from up to half a cell past an
 * edge, so its edges are moved out by that much.
 *
 * @param viewProjection - The way onto the screen it is judged by: its view's, the camera's it skips
 *   by, or a light's for its shadow.
 * @param space - The view it is drawn in, whose 2D world turns a model upright and whose size sets a
 *   snapping grid. `null` for a shadow, drawn with neither.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const meshInView = (mesh: TDrawMesh, viewProjection: Mat4, space: TCameraSpace | null = null): boolean => {
    if (mesh.alwaysDrawn === true) {
        return true;
    }
    const bounds = mesh.geometry?.bounds ?? null;
    if (bounds === null) {
        return true;
    }
    const material = mesh.material;
    const margin = mesh.boundsMargin;
    if (margin === undefined ? material.vertex !== null || material.vertexGlsl !== null : !Number.isFinite(margin)) {
        return true;
    }
    const pad = Math.max(0, margin ?? 0);

    // Its middle and half sizes, in its own space.
    box.cx = (bounds.min.x + bounds.max.x) / 2;
    box.cy = (bounds.min.y + bounds.max.y) / 2;
    box.cz = (bounds.min.z + bounds.max.z) / 2;
    box.ex = (bounds.max.x - bounds.min.x) / 2 + pad;
    box.ey = (bounds.max.y - bounds.min.y) / 2 + pad;
    box.ez = (bounds.max.z - bounds.min.z) / 2 + pad;

    const skeleton = mesh.skeleton;
    if (skeleton !== null && skeleton.jointMatrices.length >= 16) {
        const pose = skeleton.posedOn;
        let kept = posed.get(mesh);
        if (pose === undefined || kept === undefined || kept.posedOn !== pose || kept.bounds !== bounds || kept.pad !== pad) {
            coverPose(skeleton.jointMatrices, box);
            if (pose !== undefined) {
                if (kept === undefined) {
                    kept = { ...box, posedOn: pose, bounds, pad };
                    posed.set(mesh, kept);
                }
                kept.posedOn = pose;
                kept.bounds = bounds;
                kept.pad = pad;
                copyBox(box, kept);
            }
        } else {
            copyBox(kept, box);
        }
    }

    let model = mesh.worldMatrix ?? computeModelMatrix(mesh.transform, modelScratch);
    if (space?.flat === true) model = mat.scale(model, UPRIGHT, uprightScratch);
    const m = mat.multiply(viewProjection, model, clipScratch);

    // How far past each side edge a corner can be and still be pulled onto the screen: half a cell
    // of its grid, which is a cell's whole width in the -1 to 1 the screen spans.
    const [columns, rows] = space !== null ? snapGridOf(material.vertexSnap, space) : [0, 0];
    const sx = rows > 0 ? 1 + 1 / columns : 1;
    const sy = rows > 0 ? 1 + 1 / rows : 1;

    const { cx, cy, cz, ex, ey, ez } = box;
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
        past &= (x < -w * sx ? 1 : 0) | (x > w * sx ? 2 : 0) | (y < -w * sy ? 4 : 0) | (y > w * sy ? 8 : 0) | (z > w ? 16 : 0) | (w <= 0 ? 32 : 0);
    }
    return past === 0;
};

/**
 * The spaces of the cameras some view skips by, kept between frames, and what each view is judged by.
 */
const borrowed: TCameraSpace[] = [];
const judges: Mat4[] = [];

/**
 * What each view of a pass decides what it draws by: its own way onto the screen, or, for one that
 * skips by another camera (`TDrawView3d.cullingCamera`), that camera's, measured on the same size.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const cullingMatricesFor = (
    views: readonly { readonly cullingCamera?: TDrawCamera3d | null }[],
    spaces: readonly TCameraSpace[],
    viewportWidth: number,
    viewportHeight: number,
): readonly Mat4[] => {
    judges.length = views.length;
    let lent = 0;
    for (let i = 0; i < views.length; i++) {
        const other = views[i].cullingCamera ?? null;
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
