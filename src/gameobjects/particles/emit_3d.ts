import { takeSlot } from './particle_pool';
import type { TEmitShape3d, TParticlesDoc3d, TParticleRange } from '../../loaders/particles/types/t_particles_doc';
import type { TParticleOverrides } from './types/t_particles';
import type { TParticleState } from './types/t_particle_pool';

/**
 * One value out of a pair, or the pair's value when both ends are the same.
 */
const pick = (rand: () => number, range: TParticleRange): number =>
    range[0] + (range[1] - range[0]) * rand();

/**
 * Two directions square to `n` and to each other, so something can be aimed around `n`.
 *
 * The branchless form (Duff and others, 2017) and not "cross it with up", because that one comes
 * out as nothing for an axis pointing straight up, and straight up is what most effects point.
 */
const basisAround = (nx: number, ny: number, nz: number): { tx: number; ty: number; tz: number; bx: number; by: number; bz: number } => {
    const sign = nz >= 0 ? 1 : -1;
    const a = -1 / (sign + nz);
    const b = nx * ny * a;
    return {
        tx: 1 + sign * nx * nx * a, ty: sign * b, tz: -sign * nx,
        bx: b, by: sign + ny * ny * a, bz: -ny,
    };
};

/**
 * Where one particle appears and, for a cone only, which way the cone sends it.
 */
type TBirth = { x: number; y: number; z: number; aim: { x: number; y: number; z: number } | null };

/**
 * Where inside its birth volume one particle appears, in the emitter's own space.
 *
 * Only **where**, like the flat shapes, except the cone: its particles are sent out along its wall,
 * because a cone that ignored that would be a disc.
 */
const bornAt = (rand: () => number, shape: TEmitShape3d, direction: TParticlesDoc3d['direction']): TBirth => {
    switch (shape.kind) {
        case 'point':
            return { x: 0, y: 0, z: 0, aim: null };
        case 'sphere': {
            // A point spread evenly over the surface, pulled in by the cube root so they are spread
            // evenly through the volume too. Without it they bunch in the middle, the same mistake
            // the square root prevents on a disc.
            const u = rand() * 2 - 1;
            const phi = rand() * Math.PI * 2;
            const ring = Math.sqrt(1 - u * u);
            const radius = shape.edge ? shape.radius : shape.radius * Math.cbrt(rand());
            return { x: Math.cos(phi) * ring * radius, y: Math.sin(phi) * ring * radius, z: u * radius, aim: null };
        }
        case 'box':
            return {
                x: (rand() - 0.5) * shape.size[0],
                y: (rand() - 0.5) * shape.size[1],
                z: (rand() - 0.5) * shape.size[2],
                aim: null,
            };
        case 'cone': {
            // Born on the disc across the cone's axis, then aimed along the wall: the axis, leaned
            // out by the cone's angle towards wherever on the disc this one was born.
            const { tx, ty, tz, bx, by, bz } = basisAround(direction.x, direction.y, direction.z);
            const angle = rand() * Math.PI * 2;
            const radius = shape.radius * Math.sqrt(rand());
            const outX = tx * Math.cos(angle) + bx * Math.sin(angle);
            const outY = ty * Math.cos(angle) + by * Math.sin(angle);
            const outZ = tz * Math.cos(angle) + bz * Math.sin(angle);
            const wall = Math.tan(shape.angle);
            return {
                x: outX * radius,
                y: outY * radius,
                z: outZ * radius,
                aim: { x: direction.x + outX * wall, y: direction.y + outY * wall, z: direction.z + outZ * wall },
            };
        }
    }
};

/**
 * A direction within `spread` of the effect's own, spread **evenly over the cap** it allows.
 *
 * Evenly over the cap means the cosine of the angle is drawn evenly, not the angle. Drawing the angle
 * evenly bunches them along the axis, and the fountain comes out as a beam with a halo.
 */
const aimedWithin = (rand: () => number, direction: TParticlesDoc3d['direction'], spread: number): { x: number; y: number; z: number } => {
    const half = Math.min(Math.PI, spread / 2);
    const cosTheta = 1 - rand() * (1 - Math.cos(half));
    const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
    const phi = rand() * Math.PI * 2;
    const { tx, ty, tz, bx, by, bz } = basisAround(direction.x, direction.y, direction.z);
    const across = Math.cos(phi) * sinTheta;
    const along = Math.sin(phi) * sinTheta;
    return {
        x: tx * across + bx * along + direction.x * cosTheta,
        y: ty * across + by * along + direction.y * cosTheta,
        z: tz * across + bz * along + direction.z * cosTheta,
    };
};

/**
 * Puts one particle into space, or does nothing if the emitter is full. Hands back the slot it went
 * into, or `-1`.
 *
 * `matrix` is where the emitter ended up this frame, everything above it taken into account. As in
 * the flat birth, it is passed in rather than read off the record, so this is a function of what it
 * is given and nothing else.
 *
 * **Where it is born takes the whole matrix**: turned, stretched along each axis and moved, so a box
 * squashed flat squashes the volume particles appear in. **Which way it flies takes only the turn**,
 * and how fast and how big take one number, the mean of the three stretches: stretching a direction
 * one axis at a time would bend it, and a square facing the camera stretched that way would lean as
 * the camera moved.
 *
 * With `local` set the particle is kept in the emitter's own space instead, unplaced and unscaled,
 * and the emitter's placement is laid over it every frame when it is drawn. That is what makes the
 * cloud travel with the emitter.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const emitOne3d = (
    state: TParticleState,
    doc: TParticlesDoc3d,
    matrix: Float32Array,
    overrides: TParticleOverrides | undefined,
): number => {
    const slot = takeSlot(state.pool);
    if (slot === -1) {
        return -1;
    }

    const { pool } = state;
    const rand = (): number => state.random.rand();
    const local = !doc.worldSpace;

    // The three columns of the matrix are the emitter's own axes, each as long as its stretch.
    const stretchX = Math.hypot(matrix[0]!, matrix[1]!, matrix[2]!);
    const stretchY = Math.hypot(matrix[4]!, matrix[5]!, matrix[6]!);
    const stretchZ = Math.hypot(matrix[8]!, matrix[9]!, matrix[10]!);
    const magnitude = (stretchX + stretchY + stretchZ) / 3;

    const born = bornAt(rand, doc.shape, doc.direction);
    let heading = born.aim ?? aimedWithin(rand, doc.direction, doc.spread);
    const length = Math.hypot(heading.x, heading.y, heading.z) || 1;
    heading = { x: heading.x / length, y: heading.y / length, z: heading.z / length };
    const speed = pick(rand, doc.speed) * (overrides?.speedScale ?? 1);

    if (local) {
        pool.x[slot] = born.x;
        pool.y[slot] = born.y;
        pool.z[slot] = born.z;
        pool.vx[slot] = heading.x * speed;
        pool.vy[slot] = heading.y * speed;
        pool.vz[slot] = heading.z * speed;
    } else {
        pool.x[slot] = matrix[0]! * born.x + matrix[4]! * born.y + matrix[8]! * born.z + matrix[12]!;
        pool.y[slot] = matrix[1]! * born.x + matrix[5]! * born.y + matrix[9]! * born.z + matrix[13]!;
        pool.z[slot] = matrix[2]! * born.x + matrix[6]! * born.y + matrix[10]! * born.z + matrix[14]!;

        // The turn alone: each column divided by its own stretch. A zero stretch turns nothing
        // rather than dividing by it.
        const ix = stretchX > 0 ? 1 / stretchX : 0;
        const iy = stretchY > 0 ? 1 / stretchY : 0;
        const iz = stretchZ > 0 ? 1 / stretchZ : 0;
        const moving = speed * magnitude;
        pool.vx[slot] = (matrix[0]! * ix * heading.x + matrix[4]! * iy * heading.y + matrix[8]! * iz * heading.z) * moving;
        pool.vy[slot] = (matrix[1]! * ix * heading.x + matrix[5]! * iy * heading.y + matrix[9]! * iz * heading.z) * moving;
        pool.vz[slot] = (matrix[2]! * ix * heading.x + matrix[6]! * iy * heading.y + matrix[10]! * iz * heading.z) * moving;
    }

    pool.age[slot] = 0;
    pool.life[slot] = Math.max(0.0001, pick(rand, doc.life) * (overrides?.lifeScale ?? 1));
    pool.size[slot] = pick(rand, doc.size) * magnitude * (overrides?.sizeScale ?? 1);
    pool.spin[slot] = pick(rand, doc.spin);
    pool.rotation[slot] = 0;
    return slot;
};
