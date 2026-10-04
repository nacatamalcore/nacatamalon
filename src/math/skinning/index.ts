// @ai internal skinning math module: barrel for the engine's animation/skinning
// runtime. Not re-exported from src/index.ts: this is engine-internal math (like the
// renderer's use of Mat4), consumed by parse_gltf, the skinned pipeline, and
// use_skeletal_animation, not part of the public API surface.

export { trsToMat4 } from './trs';
export { slerp, lerp3 } from './quat';
export type { TQuat, Vec3Tuple } from './quat';
export { sampleClip } from './pose';
export { blendPoses } from './blend';
export { computeJointMatrices } from './palette';
