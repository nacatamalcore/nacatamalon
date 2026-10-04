/**
 * The 2D half of physics for NacatamalOn, backed by Rapier2D.
 *
 * **The engine keeps the format and this moves it.** A scene says what its objects are made of and
 * how hard things fall; registering this is what makes any of that happen. Nothing here is needed
 * to *author* physics: a scene opens, edits and saves with none of it installed, which is what lets
 * a tool show a collider without loading a physics engine.
 *
 * There is no way to open a world here on purpose. The scene declares one with the engine's
 * `usePhysicsWorld2d` and this opens it when asked; `getPhysicsWorld2d()` is how a game reaches that
 * one to push, ask and listen. Opening a second world would be a second gravity and a second set of
 * bodies, colliding with nothing.
 *
 * It is the door `nacatamalon/physics2d`, apart from the front one so that a game with no physics
 * never bundles what it runs on, `@dimforge/rapier2d-compat`, which installs with the engine.
 *
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export { installPhysics2d, rapier2dProvider, getPhysicsWorld2d } from './provider';
export { loadRapier2D } from './load_rapier';

export type { TPhysicsWorldHandle2d, TPhysicsBodyHandle2d, TPhysicsWorldOptions2d, TColliderSurface2d } from './types';
export type { TRapierModule } from './load_rapier';
