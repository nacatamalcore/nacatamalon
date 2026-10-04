import { conjugate, rotateVec3 } from '../math/quat';
import type { TPose3d } from '../box/world_placement_3d_of';
import type { TTransform2d } from '../gameobjects/types/t_transform_2d';
import type { TSoundZone } from './types/t_sound';

type TPoint3 = { x: number; y: number; z: number };

/**
 * From how far outside to how loud: all of it inside, nothing at `fade` away, and a straight line
 * between the two. A fade of zero is a hard edge.
 */
const byDistance = (outside: number, fade: number): number => {
    if (outside <= 0) {
        return 1;
    }
    return fade <= 0 ? 0 : Math.max(0, 1 - outside / fade);
};

/**
 * How loud a sound that fills an area is for a listener standing at `ear`, in a 3D scene.
 *
 * The listener is brought into the area's own frame (moved and turned back, **not** shrunk), and the
 * shape is grown by the object's size instead. That keeps the distance in the world's units, so a
 * fade of three is three whatever the object's size, while the area still grows with it.
 *
 * `null` for a flat shape, which has no meaning in depth: whoever asked says so once.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const zoneVolume3d = (zone: TSoundZone, place: TPose3d, ear: TPoint3): number | null => {
    const local = rotateVec3(conjugate(place.quaternion), {
        x: ear.x - place.position.x,
        y: ear.y - place.position.y,
        z: ear.z - place.position.z,
    });
    const shape = zone.shape;
    switch (shape.kind) {
        case 'box': {
            const dx = Math.max(Math.abs(local.x) - shape.size[0] / 2 * Math.abs(place.scale.x), 0);
            const dy = Math.max(Math.abs(local.y) - shape.size[1] / 2 * Math.abs(place.scale.y), 0);
            const dz = Math.max(Math.abs(local.z) - shape.size[2] / 2 * Math.abs(place.scale.z), 0);
            return byDistance(Math.hypot(dx, dy, dz), zone.fade);
        }
        case 'sphere': {
            // A stretched ball has one radius, the mean of its stretches, as it does for particles.
            const grow = (Math.abs(place.scale.x) + Math.abs(place.scale.y) + Math.abs(place.scale.z)) / 3;
            return byDistance(Math.hypot(local.x, local.y, local.z) - shape.radius * grow, zone.fade);
        }
        case 'plane':
            // Everything under the object's floor, which is up in this space.
            return byDistance(local.y, zone.fade);
        default:
            return null;
    }
};

/**
 * The same, in a flat scene, where y grows downwards: under an endless floor is further down the
 * screen.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const zoneVolume2d = (zone: TSoundZone, place: TTransform2d, ear: { x: number; y: number }): number | null => {
    const dx = ear.x - place.x;
    const dy = ear.y - place.y;
    const cos = Math.cos(-place.rotation);
    const sin = Math.sin(-place.rotation);
    const x = dx * cos - dy * sin;
    const y = dx * sin + dy * cos;
    const shape = zone.shape;
    switch (shape.kind) {
        case 'rect': {
            const ox = Math.max(Math.abs(x) - shape.width / 2 * Math.abs(place.scaleX), 0);
            const oy = Math.max(Math.abs(y) - shape.height / 2 * Math.abs(place.scaleY), 0);
            return byDistance(Math.hypot(ox, oy), zone.fade);
        }
        case 'circle': {
            const grow = (Math.abs(place.scaleX) + Math.abs(place.scaleY)) / 2;
            return byDistance(Math.hypot(x, y) - shape.radius * grow, zone.fade);
        }
        case 'plane':
            return byDistance(-y, zone.fade);
        default:
            return null;
    }
};
