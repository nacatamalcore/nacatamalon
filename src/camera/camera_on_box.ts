import { placement3dInView, worldPlacement3dOf } from '../box/world_placement_3d_of';
import { fromEuler, multiply, rotateVec3 } from '../math/quat';
import type { TBox } from '../box';
import type { TCamera3d } from './types/t_camera_3d';

/**
 * The camera a picture that looks at the world is drawn from, kept per camera, so what reads it
 * frame after frame (the frame's own caches of cameras) meets the same one.
 */
const placed = new WeakMap<TCamera3d, TCamera3d>();

/**
 * Where the 3D camera of a picture that looks at the world (`sees: '3d'` or `'world'`) is, seen from
 * the world: on its box, as anything else on the box is. Its own `transform` is where it is from the
 * box, so a camera at its defaults looks out of the box, along the box's -Z, and moving or turning the
 * box, or anything above it, moves and turns the camera with it: a security camera on a wall, a
 * camera on a car's roof.
 *
 * A copy, never the camera itself, which keeps what it was told: what reads `camera.transform`
 * reads its own numbers. The camera itself when the box is at the world's origin and unturned, as a
 * scene's root is, so nothing is copied for it.
 *
 * In the world it looks at. A picture of the 3D around it (`'3d'`) inside another picture is placed
 * in that picture's world, which starts at the other picture's object (`placement3dInView`), the
 * world its models are in. A view of the world (`'world'`) films the whole of its scene, wherever it
 * is, so it is placed from the top, as that world is.
 *
 * Not for a picture that is a world of its own (`'inside'`): what it draws is already placed from
 * its box, and its camera with it. Nor for what a picture that looks at the world draws itself, on
 * top (a REC mark): that is the picture's own, in its own world, as an `'inside'` picture's is.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const cameraOnBox = (camera: TCamera3d, box: TBox, sees: '3d' | 'world'): TCamera3d => {
    // A view of the world films the whole of its scene, placed from the top; one of the 3D around
    // it, the world its models are in.
    const frame = sees === 'world' ? worldPlacement3dOf(box) : placement3dInView(box);
    const [qx, qy, qz, qw] = frame.quaternion;
    const p = frame.position;
    const s = frame.scale;
    if (p.x === 0 && p.y === 0 && p.z === 0 && qx === 0 && qy === 0 && qz === 0 && qw === 1 && s.x === 1 && s.y === 1 && s.z === 1) {
        return camera;
    }
    let copy = placed.get(camera);
    if (copy === undefined) {
        copy = { ...camera, transform: { ...camera.transform } };
        placed.set(camera, copy);
    }
    // Everything the camera says, this frame, and a placement of its own.
    const transform = copy.transform;
    Object.assign(copy, camera);
    copy.transform = transform;
    const own = camera.transform;
    const turn = own.quaternion ?? fromEuler(own.rotationX, own.rotationY, own.rotation);
    // Its place from the box, through the box's size and turn; its size is not the camera's.
    const from = rotateVec3(frame.quaternion, { x: own.x * frame.scale.x, y: own.y * frame.scale.y, z: own.z * frame.scale.z });
    Object.assign(transform, own);
    transform.x = p.x + from.x;
    transform.y = p.y + from.y;
    transform.z = p.z + from.z;
    // As three angles, never a quaternion: a camera is drawn by its angles (`TDrawCamera3d`), and
    // what aims the shadows at where it looks reads only those.
    const angles = anglesOf(multiply(frame.quaternion, turn));
    transform.rotationX = angles.x;
    transform.rotationY = angles.y;
    transform.rotation = angles.z;
    transform.quaternion = null;
    return copy;
};

/**
 * A turn as the three angles a placement is read in: left and right (`y`), then up and down (`x`),
 * then in the plane (`z`), the order `fromEuler` and the renderer use. Looking straight up or down,
 * where left and right and the turn in the plane are one, it is all left and right.
 */
const anglesOf = ([x, y, z, w]: readonly [number, number, number, number]): { x: number; y: number; z: number } => {
    const m11 = 1 - 2 * (y * y + z * z);
    const m13 = 2 * (x * z + y * w);
    const m21 = 2 * (x * y + z * w);
    const m22 = 1 - 2 * (x * x + z * z);
    const m23 = 2 * (y * z - x * w);
    const m31 = 2 * (x * z - y * w);
    const m33 = 1 - 2 * (x * x + y * y);
    const pitch = Math.asin(Math.max(-1, Math.min(1, -m23)));
    if (Math.abs(m23) < 0.9999999) {
        return { x: pitch, y: Math.atan2(m13, m33), z: Math.atan2(m21, m22) };
    }
    return { x: pitch, y: Math.atan2(-m31, m11), z: 0 };
};
