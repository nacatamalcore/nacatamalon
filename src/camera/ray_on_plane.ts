import type { TRay } from './screen_to_ray';

/**
 * A flat plane without end, by a point on it and the way it faces.
 *
 * @category Camera
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPlane = {
    /**
     * A point on it. Default the origin.
     */
    point?: { x: number; y: number; z: number };
    /**
     * Which way it faces; any length but 0. Default up, `{ x: 0, y: 1, z: 0 }`: a floor.
     */
    normal?: { x: number; y: number; z: number };
};

/**
 * Where a ray meets a flat plane, a floor or a table top that goes on for ever, and how far along it:
 * the point of the floor under the pointer, with nothing built to be met. `null` when the ray runs
 * alongside the plane or away from it.
 *
 * Met from either side. Left out, the plane is the floor, `y = 0`; one at another height is
 * `{ point: { x: 0, y: 0.8, z: 0 } }`, and a wall `{ normal: { x: 0, y: 0, z: 1 } }`. To know which
 * model is under the pointer rather than where a plane is, `castRay`.
 *
 * @param ray Where it starts and which way it goes: from `screenToRay`, or made by hand.
 * @param plane A point on the plane and the way it faces. Left out, the floor.
 * @returns Where it meets the plane and how far along the ray, in the world's units, or `null`.
 *
 * @example
 * ```ts
 * const camera = useCamera3d({ projection: 'perspective', transform: { y: 6, z: 6, rotationX: -0.8 } });
 * const game = useGame();
 * declare const marker: TTransform3d;
 *
 * usePointer().onMove((info) => {
 *     const ray = screenToRay(camera, game.getWidth(), game.getHeight(), info.screenX, info.screenY);
 *     // The table's top, 0.8 up.
 *     const at = rayOnPlane(ray, { point: { x: 0, y: 0.8, z: 0 } });
 *     if (at !== null) {
 *         marker.x = at.point.x;
 *         marker.z = at.point.z;
 *     }
 * });
 * ```
 *
 * @category Camera
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const rayOnPlane = (ray: TRay, plane: TPlane = {}): { point: { x: number; y: number; z: number }; distance: number } | null => {
    const { origin: O, direction: D } = ray;
    const p = plane.point ?? { x: 0, y: 0, z: 0 };
    const n = plane.normal ?? { x: 0, y: 1, z: 0 };
    const facing = Math.hypot(n.x, n.y, n.z);
    if (!(facing > 0) || !Number.isFinite(facing)) {
        throw new Error(`[NacatamalOn] rayOnPlane: the plane's normal is (${n.x}, ${n.y}, ${n.z}), and it takes which way the plane faces, any length but 0.`);
    }
    const length = Math.hypot(D.x, D.y, D.z);
    if (!(length > 0)) {
        throw new Error('[NacatamalOn] rayOnPlane: the ray\'s direction is (0, 0, 0), and it takes which way it goes.');
    }
    // How fast the ray closes on the plane, per unit along it; nothing when it runs alongside.
    const closing = (n.x * D.x + n.y * D.y + n.z * D.z) / length;
    if (closing === 0) {
        return null;
    }
    const gap = n.x * (p.x - O.x) + n.y * (p.y - O.y) + n.z * (p.z - O.z);
    const distance = gap / closing;
    if (!(distance >= 0) || !Number.isFinite(distance)) {
        return null;
    }
    const k = distance / length;
    return { point: { x: O.x + D.x * k, y: O.y + D.y * k, z: O.z + D.z * k }, distance };
};
