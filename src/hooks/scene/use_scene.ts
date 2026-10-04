import { rootOf } from '../../box';
import { findScene, isScenePaused, setScenePaused, startScene, stopScene } from '../../scene';
import { getActiveBox, getActiveGame } from '../../store';
import { canDrawTransition, startTransition } from '../../transition';
import type { TSceneChangeOptions } from '../../transition';

/**
 * What a scene can do with the game's scenes, returned by `useScene`. Every name is one of the keys
 * passed to `createGame`. Where the name is optional, leaving it out means the scene that called
 * `useScene`.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSceneHandle = {
    /**
     * Starts another scene **alongside** the running ones, drawn on top of those started before it:
     * a HUD over the level. Throws if the name is not registered or is already running.
     */
    launch(name: string): void;
    /**
     * Stops a scene and runs its `useSceneUnmount` cleanups, in the same frame. With no name, the
     * scene stops itself (a menu closing on its own button). Stopping the last scene is allowed and
     * warned about: the game keeps running with nothing in it.
     *
     * @returns Whether a scene was stopped. `false` means it was not running, which is also warned.
     */
    stop(name?: string): boolean;
    /**
     * Replaces the calling scene with `name`: the new one starts, then this one stops. Changing to
     * its own name restarts it.
     *
     * **Only the first call does anything.** The condition that triggers a change usually stays
     * true for several frames, and each of them would otherwise start another copy. A change that
     * throws (an unknown name) releases the latch, so a typo costs one error and not a stuck scene.
     *
     * Given a transition, the swap is covered instead of instant: the screen is covered, the scenes
     * are swapped behind it, and it is uncovered. While that happens the scene coming in **exists
     * without being seen, updated, or clicked on**, so its loading has already started but it
     * cannot arrive late or act on a frame nobody saw. And the swap waits for the later of the two:
     * the screen being covered, and everything the new scene asked for having landed. That is what
     * makes a transition worth having twice over, hiding the cut and hiding the load.
     *
     * @example
     * ```ts
     * scene.change('Level2');                                  // the hard cut
     * scene.change('Level2', { transition: fade(300) });        // covered
     * scene.change('Level2', { transition: iris(400, black, { x: 0.2, y: 0.6 }) });
     * ```
     */
    change(name: string, options?: TSceneChangeOptions): void;
    /**
     * Freezes a scene: its `useUpdate` callbacks stop, and it keeps drawing.
     *
     * @returns Whether the scene is paused now. `false` means it is not running, which is warned.
     */
    pause(name?: string): boolean;
    /**
     * Unfreezes a scene. Its first frame back gets an ordinary delta: the loop never stopped, so
     * nothing piled up.
     *
     * @returns Whether the scene is paused now, so `false` both when resumed and when not running.
     */
    resume(name?: string): boolean;
    /**
     * Whether a scene is running and paused. Never warns: asking is not an instruction.
     */
    isPaused(name?: string): boolean;
};

/**
 * Returns the controls for the game's scenes: `launch`, `stop`, `change`, `pause`, `resume` and
 * `isPaused`.
 *
 * Call it in the scene body, keep the handle, and use it later from `useUpdate`: it holds the game
 * and the scene it was called in, so it keeps working after the body is over.
 *
 * @example
 * ```ts
 * export const Intro: TSceneFn = () => {
 *     const scene = useScene();
 *     let elapsed = 0;
 *     useUpdate((dt) => {
 *         elapsed += dt;
 *         if (elapsed > 3) scene.change('Level');
 *     });
 *     return createScene();
 * };
 * ```
 *
 * @returns The controls: `change`, `launch`, `stop`, `pause`, `resume` and `isPaused`.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useScene = (): TSceneHandle => {
    const store = getActiveGame();
    const active = getActiveBox();
    if (store === null || active === null) {
        throw new Error('[NacatamalOn] useScene: call it inside a scene body.');
    }

    const owner = rootOf(active);
    let leaving = false;

    /**
     * The running scene a call is about: the one named, or, with no name, the calling scene as long
     * as it is still running. Checked by root and not by name, so a handle kept from a scene that
     * was restarted cannot reach the new copy that took its name.
     */
    const running = (name: string | undefined): string | undefined => {
        if (name !== undefined) {
            return findScene(store, name) === undefined ? undefined : name;
        }
        return store.get('world').scenes.includes(owner) ? owner.name : undefined;
    };

    const warnNotRunning = (action: string, name: string | undefined): void => {
        const which = name === undefined ? `its own scene '${owner.name}'` : `scene '${name}'`;
        console.warn(`[NacatamalOn] useScene().${action}: ${which} is not running.`);
    };

    return {
        launch: (name) => {
            startScene(store, name);
        },
        stop: (name) => {
            const target = running(name);
            if (target === undefined) {
                warnNotRunning('stop', name);
                return false;
            }
            // Neither end of a change being covered can be taken out from under it: stopping the
            // one going out would uncover onto nothing, and stopping the one coming in would leave
            // the screen covered with nothing behind it to show.
            const covering = store.get('transition').active;
            const root = findScene(store, target);
            if (covering !== null && root !== undefined && (covering.incoming === root || covering.outgoing === root)) {
                console.warn(`[NacatamalOn] useScene().stop: '${target}' is part of a scene change being covered right now, so it was left alone. Wait for the change to finish.`);
                return false;
            }

            if (findScene(store, target) === owner) {
                // A scene that closed itself must not `change` afterwards: it would start the next
                // scene and stop nothing, quietly behaving as a `launch`.
                leaving = true;
            }

            stopScene(store, target);
            if (store.get('world').scenes.length === 0) {
                console.warn(`[NacatamalOn] useScene().stop: '${target}' was the last scene, so the game is running with nothing in it. Use change() to replace a scene, or launch() the next one first.`);
            }
            return true;
        },
        change: (name, options) => {
            if (leaving) {
                return;
            }

            // Refused outright, not quietly downgraded to a cut. The latch above only stops the
            // scene that asked; a HUD launched alongside it holds its own handle and knows nothing
            // about the change already running. Cutting now would leave that change with neither of
            // its ends: its outgoing scene would never be stopped and would sit in the list for the
            // rest of the game, and the screen would be left covered by a transition nobody moves.
            if (store.get('transition').active !== null) {
                console.warn(`[NacatamalOn] useScene().change: '${name}' was ignored because a scene change is already being covered. Wait for it to finish.`);
                return;
            }

            let transition = options?.transition;
            if (transition !== undefined && name === owner.name) {
                // Both copies would have to run at once for the old one to stay on screen, and a
                // name means one scene. Said rather than swallowed, because a restart that silently
                // lost its fade looks like the transition is broken.
                console.warn(`[NacatamalOn] useScene().change: '${name}' is restarting itself, which cannot be covered because both copies would have to run at once. It was changed without the transition.`);
                transition = undefined;
            }
            // A card that cannot draw it makes it a cut too, and says so: see `canDrawTransition`.
            if (transition !== undefined && !canDrawTransition(store, transition)) {
                transition = undefined;
            }

            leaving = true;

            try {
                if (transition !== undefined) {
                    // The new scene first here as well, so an unknown name throws before anything
                    // is held or covered. Nothing stops yet: the scene going out is what the screen
                    // is still showing, and it is stopped at the swap.
                    startTransition(store, transition, startScene(store, name), owner);
                } else if (name === owner.name) {
                    // Restarting: the old copy has to be gone before the name can start again.
                    stopScene(store, owner.name);
                    startScene(store, name);
                } else {
                    // The new scene first, so a name that does not exist throws before anything stops.
                    startScene(store, name);
                    stopScene(store, owner.name);
                }
            } catch (error) {
                leaving = false;
                throw error;
            }
        },
        pause: (name) => {
            const target = running(name);
            if (target === undefined) {
                warnNotRunning('pause', name);
                return false;
            }
            return setScenePaused(store, target, true);
        },
        resume: (name) => {
            const target = running(name);
            if (target === undefined) {
                warnNotRunning('resume', name);
                return false;
            }
            return setScenePaused(store, target, false);
        },
        isPaused: (name) => {
            const target = running(name);
            return target === undefined ? false : isScenePaused(store, target);
        },
    };
};
