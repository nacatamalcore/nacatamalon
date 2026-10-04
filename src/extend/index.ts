/**
 * `nacatamalon/extend`: the part of the public surface for a package that **extends** the engine,
 * such as a physics adapter, and never for a game.
 *
 * An extension is handed objects by the engine and has to reach where they really are, tell which
 * game it is working for and hang its own work on both. None of it is secret, and none of it is
 * where a game starts: a game installs an extension with the function that extension exports
 * (`installPhysics2d()`), and that function is what calls in here.
 *
 * It is its own door rather than part of the front one so that what a game sees when it types
 * `import { } from 'nacatamalon'` is only what a game uses, and rather than part of
 * `nacatamalon/authoring` because an extension runs inside a published game, which a tool never
 * does.
 *
 * Some of these types name WebGPU's own (the running game carries its device). TypeScript 6 has
 * them; on TypeScript 5 an extension adds `@webgpu/types` to its own project.
 *
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */

// Installing what simulates physics, and the shape of one. `null` uninstalls it.
export { registerPhysicsProvider } from '../physics';
export type { TPhysicsProvider } from '../physics';

// Which game is being built right now, and which of its objects: what an extension asks while a
// scene is put together, so its own work belongs to the right one.
export { getActiveGame } from '../store';
export { getActiveBox as getActiveGameObject } from '../store';
export type { TRuntimeStore } from '../store';

// Where an object really is. Its placement as written, its placement in the world with every
// parent applied, and the way back: a position in the world turned into one relative to a parent.
export { placementOf, worldPlacementOf, localPositionFrom } from '../box';
// The same for a world with depth in it. Kept apart from the flat set: a body in space needs a
// place, a full turn and a size on three axes, and a flat scene would carry all of that for nothing.
export { placement3dOf, worldPlacement3dOf, localPosition3dFrom, localQuaternionFrom } from '../box';
export type { TPose3d } from '../box';
