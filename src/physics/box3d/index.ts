/**
 * The 3D half of physics for NacatamalOn, backed by box3d.
 *
 * **The engine keeps the format and this moves it.** A scene says what its objects are made of and
 * how hard things fall; registering this is what makes any of that happen. Nothing here is needed
 * to *author* physics: a scene opens, edits and saves with none of it installed, which is what lets
 * a tool show a collider without loading a physics engine.
 *
 * There is no way to open a world here on purpose. The scene declares one with the engine's
 * `usePhysicsWorld3d` and this opens it when asked; `getPhysicsWorld3d()` is how a game reaches that
 * one to push, ask and listen. Opening a second world would be a second gravity and a second set of
 * bodies, colliding with nothing.
 *
 * **The character is the exception, and says why it is one.** A walking character is a capsule
 * moved by asking the world what is in the way, never by the solver, so there is nothing for a
 * scene to write down about it and no component that could hold it. It lives here, reached through
 * the world, for the same reason an impulse does.
 *
 * It is the door `nacatamalon/physics3d`, apart from the front one so that a game with no physics
 * never bundles what it runs on, `box3d.js`, which installs with the engine.
 *
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export { installPhysics3d, box3dProvider, getPhysicsWorld3d } from './provider';
export { loadBox3D } from './load_box3d';
export { useCharacterBody } from './use_character_body';

export type {
    TPhysicsWorldHandle3d, TPhysicsBodyHandle3d, TPhysicsWorldOptions3d, TColliderSurface3d, TColliderOptions3d,
    TRaycastOptions, TRaycastHit,
} from './types';
export { DEFAULT_RAY_DISTANCE } from './types';
export type { TCharacterBody, TCharacterOptions } from './character_body';
export type { TBox3dModule } from './load_box3d';
