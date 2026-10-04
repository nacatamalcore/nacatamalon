export { ALL_LAYERS, PHYSICS_LAYERS } from './layers';
export { createPhysicsBody2d, createPhysicsBody3d } from './new_physics_body';
export { registerPhysicsProvider, getPhysicsProviders, warnMissingPhysicsProvider } from './physics_provider';

export type { TPhysicsProvider } from './physics_provider';
export type {
    TCollider2d, TCollider3d, TPhysicsBody, TPhysicsBody2d, TPhysicsBody3d, TPhysicsBodyType,
    TPhysicsSurface, TPhysicsWorld, TPhysicsWorld2d, TPhysicsWorld3d,
} from './types/t_physics';
