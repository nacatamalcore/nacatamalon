import * as mat from '../../math/mat4';
import { killParticle } from './particle_pool';
import type { TParticleCollision } from '../../loaders/particles/types/t_particles_doc';
import type { TParticleCollider2d, TParticleCollider3d } from './colliders/t_particle_collider';
import type { TParticlePool } from './types/t_particle_pool';
import type { TTransform2d } from '../types/t_transform_2d';

/**
 * A flat collider where its object ended up this frame, with what every particle test needs worked
 * out once instead of once per particle.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPlacedCollider2d = {
    collider: TParticleCollider2d;
    x: number;
    y: number;
    cos: number;
    sin: number;
    scaleX: number;
    scaleY: number;
    /**
     * The box it fits in on screen, so most particles are turned away with four comparisons.
     */
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
};

/**
 * A collider in three dimensions where its object ended up this frame: its matrix, the inverse that
 * brings a particle into its own space, how much each of its axes is stretched, and the box it fits
 * in, all worked out once.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPlacedCollider3d = {
    collider: TParticleCollider3d;
    matrix: Float32Array;
    inverse: Float32Array;
    stretch: [number, number, number];
    min: [number, number, number];
    max: [number, number, number];
};

/**
 * Everything solid in one scene this frame, flat and in depth, gathered on the walk that places its
 * drawables. Kept and emptied each frame rather than made anew.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSceneColliders = { flat: TPlacedCollider2d[]; deep: TPlacedCollider3d[] };

/**
 * Places a flat collider from where its object ended up. Written into `into` when there is one, so a
 * scene that does not change allocates nothing.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const placeCollider2d = (collider: TParticleCollider2d, place: TTransform2d, into?: TPlacedCollider2d): TPlacedCollider2d => {
    const out = into ?? { collider, x: 0, y: 0, cos: 1, sin: 0, scaleX: 1, scaleY: 1, minX: 0, maxX: 0, minY: 0, maxY: 0 };
    out.collider = collider;
    out.x = place.x;
    out.y = place.y;
    out.cos = Math.cos(place.rotation);
    out.sin = Math.sin(place.rotation);
    out.scaleX = place.scaleX;
    out.scaleY = place.scaleY;

    const shape = collider.shape;
    if (shape.kind === 'plane') {
        out.minX = -Infinity; out.maxX = Infinity; out.minY = -Infinity; out.maxY = Infinity;
        return out;
    }
    // Half of how far it reaches along each of the screen's axes, turned and stretched.
    const halfX = shape.kind === 'rect' ? shape.width / 2 * Math.abs(place.scaleX) : shape.radius * meanOf2(place);
    const halfY = shape.kind === 'rect' ? shape.height / 2 * Math.abs(place.scaleY) : shape.radius * meanOf2(place);
    const reachX = Math.abs(out.cos) * halfX + Math.abs(out.sin) * halfY;
    const reachY = Math.abs(out.sin) * halfX + Math.abs(out.cos) * halfY;
    out.minX = place.x - reachX; out.maxX = place.x + reachX;
    out.minY = place.y - reachY; out.maxY = place.y + reachY;
    return out;
};

/**
 * A ball or a disc has one radius, so a stretched one takes the mean of its stretches.
 */
const meanOf2 = (place: { scaleX: number; scaleY: number }): number => (Math.abs(place.scaleX) + Math.abs(place.scaleY)) / 2;

/**
 * Places a collider in three dimensions from its object's matrix, into `into` when there is one.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const placeCollider3d = (collider: TParticleCollider3d, matrix: Float32Array, into?: TPlacedCollider3d): TPlacedCollider3d => {
    const out = into ?? {
        collider, matrix: mat.create(), inverse: mat.create(), stretch: [1, 1, 1], min: [0, 0, 0], max: [0, 0, 0],
    };
    out.collider = collider;
    out.matrix.set(matrix);
    mat.invert(out.matrix, out.inverse);
    out.stretch[0] = Math.hypot(matrix[0]!, matrix[1]!, matrix[2]!);
    out.stretch[1] = Math.hypot(matrix[4]!, matrix[5]!, matrix[6]!);
    out.stretch[2] = Math.hypot(matrix[8]!, matrix[9]!, matrix[10]!);

    const shape = collider.shape;
    if (shape.kind === 'plane') {
        out.min.fill(-Infinity);
        out.max.fill(Infinity);
        return out;
    }
    for (let axis = 0; axis < 3; axis++) {
        let reach: number;
        if (shape.kind === 'sphere') {
            reach = shape.radius * (out.stretch[0] + out.stretch[1] + out.stretch[2]) / 3;
        } else {
            // How far a box turned and stretched by the matrix reaches along this axis of the world:
            // each of its three half-sizes, carried by its column.
            reach = Math.abs(matrix[axis]!) * shape.size[0] / 2
                + Math.abs(matrix[4 + axis]!) * shape.size[1] / 2
                + Math.abs(matrix[8 + axis]!) * shape.size[2] / 2;
        }
        out.min[axis] = matrix[12 + axis]! - reach;
        out.max[axis] = matrix[12 + axis]! + reach;
    }
    return out;
};

/**
 * Sends a velocity back off a surface whose outward normal is `(nx, ny, nz)`, one unit long.
 *
 * Only when it is heading **into** the surface: one already leaving, after an earlier push, is left
 * alone, or a particle resting on a floor would be kicked up every frame. The part into the surface
 * comes back scaled by `bounce`, and the part along it loses `friction`.
 */
const reflect = (
    v: [number, number, number], nx: number, ny: number, nz: number, collision: TParticleCollision,
): void => {
    const into = v[0] * nx + v[1] * ny + v[2] * nz;
    if (into >= 0) {
        return;
    }
    const keep = 1 - collision.friction;
    // Split into the part along the normal and the part along the surface.
    const tx = v[0] - into * nx;
    const ty = v[1] - into * ny;
    const tz = v[2] - into * nz;
    const back = -into * collision.bounce;
    v[0] = tx * keep + back * nx;
    v[1] = ty * keep + back * ny;
    v[2] = tz * keep + back * nz;
};

/**
 * Reused by every test, so colliding allocates nothing.
 */
const velocity: [number, number, number] = [0, 0, 0];

/**
 * Where a flat particle comes out of one collider, and the way out, or `false` when it is not
 * inside it. Writes the new place and the outward normal into `hit`.
 */
const outOf2d = (placed: TPlacedCollider2d, px: number, py: number, hit: { x: number; y: number; nx: number; ny: number }): boolean => {
    const shape = placed.collider.shape;
    const dx = px - placed.x;
    const dy = py - placed.y;

    if (shape.kind === 'circle') {
        const radius = shape.radius * meanOf2(placed);
        const distance = Math.hypot(dx, dy);
        if (distance >= radius) {
            return false;
        }
        // Dead in the middle has no way out of its own, so it takes the way up.
        const nx = distance > 0 ? dx / distance : 0;
        const ny = distance > 0 ? dy / distance : -1;
        hit.x = placed.x + nx * radius;
        hit.y = placed.y + ny * radius;
        hit.nx = nx;
        hit.ny = ny;
        return true;
    }

    // Into the collider's turned frame, still in the world's units.
    const u = dx * placed.cos + dy * placed.sin;
    const w = -dx * placed.sin + dy * placed.cos;

    if (shape.kind === 'plane') {
        // Solid below on screen, which with y down is where the turned y is positive.
        if (w <= 0) {
            return false;
        }
        hit.x = px - (-placed.sin) * w;
        hit.y = py - placed.cos * w;
        hit.nx = placed.sin;
        hit.ny = -placed.cos;
        return true;
    }

    const halfU = shape.width / 2 * Math.abs(placed.scaleX);
    const halfW = shape.height / 2 * Math.abs(placed.scaleY);
    const deepU = halfU - Math.abs(u);
    const deepW = halfW - Math.abs(w);
    if (deepU <= 0 || deepW <= 0) {
        return false;
    }
    // Out through the nearest face, measured in the world's units so a stretched one does not lie.
    let outU = 0;
    let outW = 0;
    if (deepU < deepW) {
        outU = u >= 0 ? 1 : -1;
        const pushed = outU * halfU;
        hit.x = placed.x + pushed * placed.cos - w * placed.sin;
        hit.y = placed.y + pushed * placed.sin + w * placed.cos;
    } else {
        outW = w >= 0 ? 1 : -1;
        const pushed = outW * halfW;
        hit.x = placed.x + u * placed.cos - pushed * placed.sin;
        hit.y = placed.y + u * placed.sin + pushed * placed.cos;
    }
    hit.nx = outU * placed.cos - outW * placed.sin;
    hit.ny = outU * placed.sin + outW * placed.cos;
    return true;
};

const hit2d = { x: 0, y: 0, nx: 0, ny: 0 };

/**
 * Pushes every flat particle that ended up inside a collider back out, and sends it off the surface
 * or ends it, as its effect says.
 *
 * A function of what it is given, like the birth, so the whole thing is tested with no game.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const collide2d = (pool: TParticlePool, collision: TParticleCollision, colliders: readonly TPlacedCollider2d[]): void => {
    // Backwards, because a particle that dies here takes the last one into its slot.
    for (let i = pool.live - 1; i >= 0; i--) {
        for (const placed of colliders) {
            if (!placed.collider.enabled) {
                continue;
            }
            const px = pool.x[i]!;
            const py = pool.y[i]!;
            if (px < placed.minX || px > placed.maxX || py < placed.minY || py > placed.maxY) {
                continue;
            }
            if (!outOf2d(placed, px, py, hit2d)) {
                continue;
            }
            if (collision.mode === 'die') {
                killParticle(pool, i);
                break;
            }
            pool.x[i] = hit2d.x;
            pool.y[i] = hit2d.y;
            velocity[0] = pool.vx[i]!;
            velocity[1] = pool.vy[i]!;
            velocity[2] = 0;
            reflect(velocity, hit2d.nx, hit2d.ny, 0, collision);
            pool.vx[i] = velocity[0];
            pool.vy[i] = velocity[1];
        }
    }
};

const hit3d = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0 };

/**
 * Where a particle in space comes out of one collider, and the way out, or `false` when it is not
 * inside it.
 */
const outOf3d = (placed: TPlacedCollider3d, px: number, py: number, pz: number, hit: typeof hit3d): boolean => {
    const { matrix: m, inverse: k, stretch } = placed;
    const shape = placed.collider.shape;

    if (shape.kind === 'sphere') {
        const radius = shape.radius * (stretch[0] + stretch[1] + stretch[2]) / 3;
        const dx = px - m[12]!;
        const dy = py - m[13]!;
        const dz = pz - m[14]!;
        const distance = Math.hypot(dx, dy, dz);
        if (distance >= radius) {
            return false;
        }
        const nx = distance > 0 ? dx / distance : 0;
        const ny = distance > 0 ? dy / distance : 1;
        const nz = distance > 0 ? dz / distance : 0;
        hit.x = m[12]! + nx * radius;
        hit.y = m[13]! + ny * radius;
        hit.z = m[14]! + nz * radius;
        hit.nx = nx; hit.ny = ny; hit.nz = nz;
        return true;
    }

    if (shape.kind === 'plane') {
        // The object's own up is the floor's normal; below it, measured along it, is solid.
        const nx = m[4]! / (stretch[1] || 1);
        const ny = m[5]! / (stretch[1] || 1);
        const nz = m[6]! / (stretch[1] || 1);
        const above = (px - m[12]!) * nx + (py - m[13]!) * ny + (pz - m[14]!) * nz;
        if (above >= 0) {
            return false;
        }
        hit.x = px - above * nx;
        hit.y = py - above * ny;
        hit.z = pz - above * nz;
        hit.nx = nx; hit.ny = ny; hit.nz = nz;
        return true;
    }

    // Into the box's own space, where it is a plain box of `size` around the origin.
    const lx = k[0]! * px + k[4]! * py + k[8]! * pz + k[12]!;
    const ly = k[1]! * px + k[5]! * py + k[9]! * pz + k[13]!;
    const lz = k[2]! * px + k[6]! * py + k[10]! * pz + k[14]!;
    const local = [lx, ly, lz];
    let nearest = -1;
    let shallowest = Infinity;
    for (let axis = 0; axis < 3; axis++) {
        const half = shape.size[axis]! / 2;
        const deep = half - Math.abs(local[axis]!);
        if (deep <= 0) {
            return false;
        }
        // Compared in the world's units, so a box stretched long does not seem shallow along it.
        const inWorld = deep * stretch[axis]!;
        if (inWorld < shallowest) {
            shallowest = inWorld;
            nearest = axis;
        }
    }

    const side = local[nearest]! >= 0 ? 1 : -1;
    local[nearest] = side * shape.size[nearest]! / 2;
    hit.x = m[0]! * local[0]! + m[4]! * local[1]! + m[8]! * local[2]! + m[12]!;
    hit.y = m[1]! * local[0]! + m[5]! * local[1]! + m[9]! * local[2]! + m[13]!;
    hit.z = m[2]! * local[0]! + m[6]! * local[1]! + m[10]! * local[2]! + m[14]!;
    // The face's normal is that axis of the box, turned into the world and made one unit long.
    const length = stretch[nearest] || 1;
    hit.nx = side * m[nearest * 4]! / length;
    hit.ny = side * m[nearest * 4 + 1]! / length;
    hit.nz = side * m[nearest * 4 + 2]! / length;
    return true;
};

/**
 * The same as `collide2d`, for particles in space.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const collide3d = (pool: TParticlePool, collision: TParticleCollision, colliders: readonly TPlacedCollider3d[]): void => {
    for (let i = pool.live - 1; i >= 0; i--) {
        for (const placed of colliders) {
            if (!placed.collider.enabled) {
                continue;
            }
            const px = pool.x[i]!;
            const py = pool.y[i]!;
            const pz = pool.z[i]!;
            if (px < placed.min[0] || px > placed.max[0] || py < placed.min[1] || py > placed.max[1] || pz < placed.min[2] || pz > placed.max[2]) {
                continue;
            }
            if (!outOf3d(placed, px, py, pz, hit3d)) {
                continue;
            }
            if (collision.mode === 'die') {
                killParticle(pool, i);
                break;
            }
            pool.x[i] = hit3d.x;
            pool.y[i] = hit3d.y;
            pool.z[i] = hit3d.z;
            velocity[0] = pool.vx[i]!;
            velocity[1] = pool.vy[i]!;
            velocity[2] = pool.vz[i]!;
            reflect(velocity, hit3d.nx, hit3d.ny, hit3d.nz, collision);
            pool.vx[i] = velocity[0];
            pool.vy[i] = velocity[1];
            pool.vz[i] = velocity[2];
        }
    }
};
