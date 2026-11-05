// The arithmetic a game would otherwise write by hand, its random numbers and the curves things move
// along. Nothing here draws.

// A turn as a whole, and the one way of building one that a scene written by hand needs: an object
// tilted off the axes (a ramp, a banked corner) is authored with three angles and stored as this.
// The four that turn something about an axis come out too, for a rotate gizmo.
// The rest of the quaternion arithmetic stays inside, where the renderer and the rigs use it.
export { fromEuler as quatFromEuler } from '../math/quat';
export {
    fromAxisAngle as quatFromAxisAngle, multiply as quatMultiply, normalize as quatNormalize,
    rotateVec3 as quatRotateVec3, slerp as quatSlerp,
} from '../math/quat';
export type { TQuat } from '../math/quat';
// The everyday arithmetic of a game: keeping a number in range, blending two of them, turning
// degrees into the radians every rotation uses, and points and directions. Prefixed (`vec2Add`, not
// a `Vec2` namespace) so a game that only uses `clamp` bundles only `clamp`, the same rule as the
// easing curves below. Vectors are plain `{ x, y }` objects, so a transform can be passed as one.
// The 4x4 matrices stay inside: they are the renderer's, and they would tie the API to wgpu-matrix.
export { clamp } from '../math/clamp';
export { lerp } from '../math/lerp';
export { TAU, degToRad, radToDeg, lerpAngle, wrap as wrapAngle } from '../math/angle';
export {
    add as vec2Add, sub as vec2Sub, scale as vec2Scale, negate as vec2Negate, lerp as vec2Lerp,
    dot as vec2Dot, len as vec2Length, dist as vec2Distance, normalize as vec2Normalize,
    equals as vec2Equals, angle as vec2Angle,
} from '../math/vec2';
export type { TVec2 } from '../math/vec2';
export {
    add as vec3Add, sub as vec3Sub, scale as vec3Scale, negate as vec3Negate, lerp as vec3Lerp,
    dot as vec3Dot, cross as vec3Cross, len as vec3Length, dist as vec3Distance,
    normalize as vec3Normalize, equals as vec3Equals,
} from '../math/vec3';
export type { TVec3 } from '../math/vec3';
export { useRandom } from '../hooks';
export type { TRandomHandle } from '../math/random';
// The easing curves and the `TEaseFn` type they share. A bare `export *`, never `export * as`:
// each curve comes out under its own name, so a game that only uses `easeOutBounce` leaves the
// other thirty-two behind when it is bundled.
export * from '../math/easing';
