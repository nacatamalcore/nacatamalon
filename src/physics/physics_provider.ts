import type { TBox } from '../box';
import type { TPhysicsBody, TPhysicsWorld } from './types/t_physics';

/**
 * What something has to supply for a scene's colliders to actually move.
 *
 * **The engine knows the *format* of physics and none of its *behaviour*.** It keeps the records,
 * writes them down and hands them here. Simulating lives in a door you opt into
 * (`nacatamalon/physics2d`), so a game that never simulates never pays for the WebAssembly, and a
 * tool can draw a collider's outline without loading a physics engine at all.
 *
 * It is the same relation a behaviour already has with its code: the document names what it wants,
 * and what does it is registered from outside.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPhysicsProvider = {
    /**
     * Called once for the world a scene declares, and always before any body of that scene: the
     * world lives on the scene's root, and a root is built before what is under it.
     */
    createWorld: (world: TPhysicsWorld) => void;
    /**
     * Called for each object carrying a collider. `box` is the object that owns it: where it starts
     * and where the simulation writes back to.
     */
    createBody: (box: TBox, body: TPhysicsBody) => void;
};

/**
 * Everything installed to simulate, in the order it was installed.
 *
 * **A list and not one slot**, because the two halves of physics are separate packages and a game
 * with both a flat and a solid world installs both. With one slot the second install replaced the
 * first and every collider of the other dimension went inert without a word: the provider that won
 * simply ignored what was not its own, and the engine had already handed it over, so nothing was
 * left to complain. Holding a list is what makes the rule each adapter already states true, that
 * each one answers for its own dimension and leaves the rest alone.
 */
let providers: TPhysicsProvider[] = [];
let warned = false;

/**
 * Installs something to simulate the physics a scene declares. `null` uninstalls **everything**,
 * which is what a tool does when it leaves play mode, so an editing session never simulates.
 *
 * Installing the same one twice does nothing the second time, so a scene that is rebuilt does not
 * end up simulated twice over.
 *
 * Installing clears the "nothing is simulating" warning, so a newly installed adapter reports its
 * own problems instead of staying quiet because an earlier one already complained.
 *
 * Most games never call this: an adapter offers one call that does it, and that is the line to
 * write (`installPhysics2d()`, `installPhysics3d()`). This is the door underneath, for a host that
 * decides for itself when simulation is on, which is what a tool with a play button is.
 *
 * @example
 * ```ts
 * import { installPhysics2d } from 'nacatamalon/physics2d';
 *
 * installPhysics2d();
 * ```
 * @param next - The provider to install, or `null` to uninstall every one.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const registerPhysicsProvider = (next: TPhysicsProvider | null): void => {
    if (next === null) {
        providers = [];
    } else if (!providers.includes(next)) {
        providers.push(next);
    }
    warned = false;
};

/**
 * Everything simulating, which is empty when nothing is.
 *
 * @internal
 */
export const getPhysicsProviders = (): readonly TPhysicsProvider[] => providers;

/**
 * Says **once per registration** that a scene declares physics nothing can simulate.
 *
 * Once, because the alternative is a line per collider: a scene with two hundred crates would bury
 * every other message, and the two-hundredth says nothing the first did not.
 *
 * Deliberately not an error. A scene with no adapter still opens, still draws and still writes back
 * out without losing anything; it just sits still. That is exactly what a tool wants while somebody
 * is building the level, so making it fatal would break the main use.
 *
 * @internal
 */
export const warnMissingPhysicsProvider = (): void => {
    if (warned) {
        return;
    }
    warned = true;
    console.warn('[NacatamalOn] This scene declares physics and nothing is installed to simulate it, so its colliders sit still. Install an adapter and call installPhysics2d() or installPhysics3d().');
};
