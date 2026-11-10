import { getColor } from '../../color';
import { computeModelMatrix } from '../../render/shared/compute_mvp_3d';
import { INSTANCE_FLOATS } from '../../render/shared/mesh_instances';
import * as mat from '../../math/mat4';
import { makeMesh } from './create_mesh';
import type { IRenderer } from '../../render/interface';
import type { TTransform3d } from '../types/t_transform_3d';
import type { TMesh } from './types/t_mesh';
import type { TMeshInstancePlacement, TMeshInstanceRun, TMeshInstances, TMeshInstancesOptions } from './types/t_mesh_instances';

/**
 * Where an instance's placement is worked out before its rows are written. Never handed out.
 */
const placeScratch = mat.create();
const whereScratch: TTransform3d = { x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1, quaternion: null };

/**
 * Writes one instance into its twenty numbers: the three rows of its placement, its colour, and its
 * own four.
 */
const writeInstance = (data: Float32Array, index: number, placement: TMeshInstancePlacement): void => {
    const size = placement.scale ?? 1;
    whereScratch.x = placement.x ?? 0;
    whereScratch.y = placement.y ?? 0;
    whereScratch.z = placement.z ?? 0;
    whereScratch.rotation = placement.rotation ?? 0;
    whereScratch.rotationX = placement.rotationX ?? 0;
    whereScratch.rotationY = placement.rotationY ?? 0;
    whereScratch.quaternion = placement.quaternion ?? null;
    whereScratch.scaleX = placement.scaleX ?? size;
    whereScratch.scaleY = placement.scaleY ?? size;
    whereScratch.scaleZ = placement.scaleZ ?? size;
    const m = computeModelMatrix(whereScratch, placeScratch);

    const at = index * INSTANCE_FLOATS;
    // Row by row, the move last in each: three rows say all a placement can, and the fourth of a
    // matrix that only moves, turns and sizes is always the same.
    for (let row = 0; row < 3; row++) {
        data[at + row * 4] = m[row]!;
        data[at + row * 4 + 1] = m[4 + row]!;
        data[at + row * 4 + 2] = m[8 + row]!;
        data[at + row * 4 + 3] = m[12 + row]!;
    }

    const tint = placement.tint;
    if (tint === undefined) {
        data[at + 12] = 1;
        data[at + 13] = 1;
        data[at + 14] = 1;
        data[at + 15] = 1;
    } else {
        const color = getColor(tint);
        data[at + 12] = color.r;
        data[at + 13] = color.g;
        data[at + 14] = color.b;
        data[at + 15] = color.a;
    }

    const own = placement.data;
    for (let i = 0; i < 4; i++) {
        const value = own?.[i];
        data[at + 16 + i] = value !== undefined && Number.isFinite(value) ? value : 0;
    }
};

/**
 * Puts many of one shape in the scene, drawn in one go: a field of grass, a hillside of rocks, a
 * forest. One shape, one surface and one draw, however many there are, where a `createMesh` each
 * would be a draw each.
 *
 * What comes back is a model like any other: its `transform` moves them all together, its material
 * is the surface of every one, and it is skipped, lit and sorted as one model (so keep a group to
 * what stands together, and make another for what stands elsewhere). Each instance is placed inside
 * it with `set`, with a colour and four numbers of its own; `count` is how many are drawn.
 *
 * A material's corner hook runs after an instance is placed: `pos` is where the corner is in the
 * group's space, `ctx.origin` where its instance stands and `ctx.instance` its four numbers, so wind
 * crossing a meadow is written once for every blade. What the colour hook needs of them is handed on
 * through `carry`.
 *
 * It does not bend around bones, and its instances are not sorted among themselves, so see-through
 * ones blend in the order they were set: cut them out with `alphaCutoff` instead where that shows.
 *
 * @param options The shape, how many there is room for, and anything else `createMesh` takes.
 * @returns The model, with `set`, `count` and `capacity`.
 *
 * @example
 * ```ts
 * const rocks = createMeshInstances({ geometry: useCubeGeometry(), tint: '#8a8f98', capacity: 500 });
 *
 * for (let i = 0; i < 500; i++) {
 *     rocks.set(i, {
 *         x: Math.random() * 40 - 20,
 *         z: Math.random() * 40 - 20,
 *         rotationY: Math.random() * Math.PI,
 *         scale: 0.5 + Math.random(),
 *     });
 * }
 * ```
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createMeshInstances = (options: TMeshInstancesOptions): TMeshInstances => {
    const capacity = options.capacity;
    if (!Number.isInteger(capacity) || capacity < 1) {
        throw new Error(`[NacatamalOn] createMeshInstances: capacity is how many instances there is room for, a whole number from 1 up, and ${String(capacity)} was given.`);
    }

    const mesh = makeMesh('createMeshInstances', options) as TMeshInstances;
    const run: TMeshInstanceRun = {
        buffer: null,
        count: 0,
        bounds: null,
        data: new Float32Array(capacity * INSTANCE_FLOATS),
        capacity,
        dirtyFrom: 0,
        dirtyTo: 0,
        measured: null,
    };
    mesh.instances = run;
    mesh.count = 0;
    (mesh as { capacity: number }).capacity = capacity;
    mesh.set = (index, placement = {}) => {
        if (!Number.isInteger(index) || index < 0 || index >= capacity) {
            throw new Error(`[NacatamalOn] createMeshInstances: set(${String(index)}) is outside the ${capacity} instances there is room for. Give it a bigger capacity.`);
        }
        writeInstance(run.data, index, placement);
        if (run.dirtyFrom === run.dirtyTo) {
            run.dirtyFrom = index;
            run.dirtyTo = index + 1;
        } else {
            run.dirtyFrom = Math.min(run.dirtyFrom, index);
            run.dirtyTo = Math.max(run.dirtyTo, index + 1);
        }
        run.measured = null;
        if (index >= mesh.count) {
            mesh.count = index + 1;
        }
    };
    return mesh;
};

/**
 * The box every drawn instance of `run` fits in: the shape's own box carried by each placement, all
 * of them together.
 */
const measure = (run: TMeshInstanceRun, box: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }): TMeshInstanceRun['bounds'] => {
    if (run.count === 0) {
        return null;
    }
    const cx = (box.min.x + box.max.x) / 2;
    const cy = (box.min.y + box.max.y) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    const ex = (box.max.x - box.min.x) / 2;
    const ey = (box.max.y - box.min.y) / 2;
    const ez = (box.max.z - box.min.z) / 2;
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    const data = run.data;
    for (let i = 0; i < run.count; i++) {
        const at = i * INSTANCE_FLOATS;
        for (let row = 0; row < 3; row++) {
            const a = data[at + row * 4]!;
            const b = data[at + row * 4 + 1]!;
            const c = data[at + row * 4 + 2]!;
            const middle = a * cx + b * cy + c * cz + data[at + row * 4 + 3]!;
            const half = Math.abs(a) * ex + Math.abs(b) * ey + Math.abs(c) * ez;
            if (middle - half < lo[row]!) lo[row] = middle - half;
            if (middle + half > hi[row]!) hi[row] = middle + half;
        }
    }
    // A placement that is not a number has no box: never skipped, rather than skipped wrongly.
    if (!lo.every(Number.isFinite) || !hi.every(Number.isFinite)) {
        return null;
    }
    return { min: { x: lo[0]!, y: lo[1]!, z: lo[2]! }, max: { x: hi[0]!, y: hi[1]!, z: hi[2]! } };
};

/**
 * Gets a model's instances ready to be drawn this frame: how many, the stretch of them that changed
 * sent to the card, and the box they fit in measured again if any moved. A group nobody touched
 * costs nothing here.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const syncMeshInstances = (renderer: IRenderer, mesh: TMesh): void => {
    const run = mesh.instances ?? null;
    if (run === null) {
        return;
    }
    const wanted = (mesh as TMeshInstances).count;
    run.count = Number.isFinite(wanted) ? Math.min(Math.max(Math.floor(wanted), 0), run.capacity) : 0;

    if (run.buffer === null) {
        run.buffer = renderer.createBuffer(run.data, 'vertex');
        run.dirtyFrom = 0;
        run.dirtyTo = 0;
    } else if (run.dirtyTo > run.dirtyFrom) {
        renderer.updateBuffer(run.buffer, run.data.subarray(run.dirtyFrom * INSTANCE_FLOATS, run.dirtyTo * INSTANCE_FLOATS), run.dirtyFrom * INSTANCE_FLOATS * 4);
        run.dirtyFrom = 0;
        run.dirtyTo = 0;
    }

    const box = mesh.geometry?.bounds ?? null;
    if (box === null) {
        run.bounds = null;
        run.measured = null;
    } else if (run.measured === null || run.measured.box !== box || run.measured.count !== run.count) {
        run.bounds = measure(run, box);
        run.measured = { box, count: run.count };
    }
};

/**
 * Lets go of what a model's instances put on the card.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const releaseMeshInstances = (renderer: IRenderer | null, mesh: TMesh): void => {
    const run = mesh.instances ?? null;
    if (run === null || run.buffer === null) {
        return;
    }
    renderer?.destroyBuffer(run.buffer);
    run.buffer = null;
    run.count = 0;
};
