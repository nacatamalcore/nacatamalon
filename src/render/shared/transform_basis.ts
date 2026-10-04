import type { TTransform3d } from '../../gameobjects/types/t_transform_3d';

/**
 * Which way something is facing.
 *
 * Forward is **-Z**, which is the convention every model format and every camera in this engine
 * already uses: a camera at the origin looks that way, and a model exported facing the viewer faces
 * that way. A light shines along it, so a light is aimed by turning it, exactly like a camera.
 *
 * A `quaternion`, when the transform has one, decides the answer, as it decides the turn everywhere
 * else. The lights and cameras of a frame pass theirs as `null` on purpose and are aimed by their
 * angles. What comes back is always one unit long, and the roll never changes it.
 *
 * @param transform - Where something is and how it is turned.
 * @returns The way it faces, one unit long.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const transformForward = (transform: TTransform3d): { x: number; y: number; z: number } => {
    const q = transform.quaternion;
    if (q !== undefined && q !== null) {
        // (0, 0, -1) turned by the quaternion, written out.
        const [qx, qy, qz, qw] = q;
        return {
            x: -2 * (qw * qy + qx * qz),
            y: 2 * (qw * qx - qy * qz),
            z: 2 * (qx * qx + qy * qy) - 1,
        };
    }
    const cx = Math.cos(transform.rotationX);
    return {
        x: -Math.sin(transform.rotationY) * cx,
        y: Math.sin(transform.rotationX),
        z: -Math.cos(transform.rotationY) * cx,
    };
};

/**
 * The two angles that turn something so it faces along `dir`: the other way round from
 * `transformForward`.
 *
 * It is how a camera is pointed at a place and a light at the floor without working out the angles
 * by hand. The roll is not touched, since facing somewhere says nothing about it, and the length of
 * `dir` does not matter. A `dir` of nothing gives `0, 0` instead of numbers that are not numbers.
 *
 * @param dir - The way it should face. Any length.
 * @returns The two turns, in radians, for its `transform`.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const eulerAim = (dir: { x: number; y: number; z: number }): { rotationX: number; rotationY: number } => {
    if (dir.x === 0 && dir.y === 0 && dir.z === 0) {
        return { rotationX: 0, rotationY: 0 };
    }
    return {
        rotationX: Math.atan2(dir.y, Math.hypot(dir.x, dir.z)),
        rotationY: Math.atan2(-dir.x, -dir.z),
    };
};
