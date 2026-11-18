import { launchOnceShown, systemNameOf, systemsStarting } from '../../game_systems/game_systems';
import { rootOf } from '../../box';
import { findScene, isBeingBuilt, isNameBeingBuilt, isScenePaused, nameTakenBy, inPlaceOf, setScenePaused, startedAs, startedWith, startScene, stopScene } from '../../scene';
import { isSceneStopped } from '../../scene/stopped_scenes';
import { scenePauseTold } from '../../scene/pause_scene';
import type { TBox } from '../../box';
import { getActiveBox, getActiveGame } from '../../store';
import type { TRuntimeStore } from '../../store';
import { onGameMoment } from '../../signal/game_moments';
import { canDrawTransition, startTransition, startTransitionBuilding, startTransitionRestart } from '../../transition';
import type { TSceneChangeOptions, TSceneLaunchOptions, TSceneRestartOptions, TSceneStopOptions, TTransition } from '../../transition';
import type { TSceneFn } from '../../scene/types/t_scene_fn';
import { outsideSceneBody } from '../../utils/outside_scene_body';
import { splashOf } from '../../splash/behind_splash';

/**
 * What a scene can do with the game's scenes, returned by `useScene`. Every name is one of the keys
 * passed to `createGame`. Where the name is optional, leaving it out means the scene that called
 * `useScene`.
 *
 * Called in a game system, which belongs to no scene, every call names the scene it is about:
 * `change`, and the ones with the name left out, throw there.
 *
 * `launch`, `change`, `restart` and `isRunning` take the scene by name or by its function. By the
 * function, TypeScript checks the props: `change(Level, { props: { level: 3 } })`.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSceneHandle = {
    /**
     * Starts another scene **alongside** the running ones, drawn on top of those started before it:
     * a HUD over the level. Throws if the name is not registered or is already running: `isRunning`
     * asks first.
     *
     * Given a transition, it comes in covered, as with `change`: the screen is covered, the scene
     * waits behind it until it has loaded, and it is uncovered with the scene on top. The scenes
     * underneath go on running: pause them first if the game should freeze behind a menu.
     *
     * From a game system before the game has any scene (its body, its `useReady`), it is launched on
     * the first frame the game is shown, so a HUD a system launches goes over the scene the game
     * starts on. Until then `isRunning` says `false`, and a `stop` of it says it is not running and
     * leaves it to come; a scene already running by then is left as it is, and said.
     *
     * @example
     * ```ts
     * scene.pause('Level');
     * scene.launch('PauseMenu', { transition: iris(0.4) });
     * ```
     */
    launch<P extends object>(scene: TSceneFn<P>, options?: TSceneLaunchOptions<P>): void;
    launch(name: string, options?: TSceneLaunchOptions): void;
    /**
     * Stops a scene and runs its `useCleanup` cleanups, in the same frame. With no name, the
     * scene stops itself (a menu closing on its own button). Stopping the last scene is allowed and
     * warned about: the game keeps running with nothing in it.
     *
     * Given a transition, the screen is covered first, the scene is stopped behind the cover, and
     * what is left is uncovered. Its cleanups run then, at the swap.
     *
     * @example
     * ```ts
     * scene.stop('PauseMenu', { transition: iris(0.4) });
     * scene.stop({ transition: iris(0.4) }); // the menu closing itself
     * ```
     *
     * @returns Whether a scene was stopped, or will be once the screen is covered. `false` means it
     * was not running, or a transition was asked for while another one is being covered, both
     * warned.
     */
    stop(name?: string, options?: TSceneStopOptions): boolean;
    stop(options: TSceneStopOptions): boolean;
    /**
     * Replaces the calling scene with `name`: the new one starts, then this one stops. Changing to
     * its own name restarts it.
     *
     * The new one takes this one's place among the running scenes, so a HUD launched over the level
     * stays over the next one, and its style and its clicks still come first. A scene that should
     * cover everything, the HUD too (a game over), is `launch`ed on top and this one stopped.
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
     * A scene restarting itself is covered too, a little differently: the new copy is built only
     * once the screen is covered and the old one has stopped, so the two never run at once.
     *
     * @example
     * ```ts
     * scene.change('Level2');                                  // the hard cut
     * scene.change('Level2', { transition: fade(0.3) });        // covered
     * scene.change('Level2', { transition: iris(0.4, black, { x: 0.2, y: 0.6 }) });
     * scene.change(Level, { props: { level: 3 } });            // its props, checked
     * scene.change('Level', { transition: fade(0.3) });         // a restart, covered
     * ```
     */
    change<P extends object>(scene: TSceneFn<P>, options?: TSceneChangeOptions<P>): void;
    change(name: string, options?: TSceneChangeOptions): void;
    /**
     * Stops a running scene and builds it again, with the props it was started with unless given
     * others: the level started over, from the level itself, from the HUD over it, or from a game
     * system. With no name, the calling scene.
     *
     * Given a transition, the screen is covered first, and the scene is stopped and built again
     * behind the cover: the two copies never run at once.
     *
     * A scene restarting itself: **only the first call does anything**, as with `change`. The
     * condition that asks for it usually stays true for several frames, and the old copy goes on
     * updating until it stops or the screen is covered; the calls after the first return `true`,
     * saying nothing.
     *
     * It goes back to its place among the scenes, under the HUD launched over it, with the scenes its
     * body launches just under it. By its function, it is the scene started from that function; by
     * a name, the one registered under it, running or not, and only for a name no scene is
     * registered under, the one whose document gave its root that name.
     *
     * @example
     * ```ts
     * scene.restart('Level');                                   // the same level, at once
     * scene.restart('Level', { transition: fade(0.3) });          // covered
     * scene.restart(Level, { props: { level: 3 } });             // another level, its props checked
     * ```
     *
     * @returns Whether it was restarted, or will be once the screen is covered. `false` means it
     * was not running, or it is part of a scene change being covered, or it is held behind a cover
     * waiting to be shown, or a transition was asked for while another one is being covered, or
     * another running scene answers to its name too (by the one its document gave it), all warned,
     * with nothing stopped; and, said nothing, that the game has ended. Throws when the name it was
     * started under is no longer one of the game's scenes.
     */
    restart<P extends object>(scene: TSceneFn<P>, options?: TSceneRestartOptions<P>): boolean;
    restart(name?: string, options?: TSceneRestartOptions): boolean;
    restart(options: TSceneRestartOptions): boolean;
    /**
     * Whether a scene is running, by either name it answers to: what `launch` would refuse. Never
     * warns: asking is not an instruction. Given a function that is not one of the game's scenes, it
     * throws, as `launch` does.
     *
     * @example
     * ```ts
     * if (!scene.isRunning('Hud')) scene.launch('Hud');
     * ```
     */
    isRunning<P extends object>(scene: TSceneFn<P>): boolean;
    isRunning(name: string): boolean;
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
    /**
     * Runs `listener` each time a scene is frozen, only when it really changes: pausing what is
     * already paused says nothing.
     *
     * The engine leaves sound and timers alone, because what should stop is the game's decision:
     * the music of a level usually carries on under its pause menu, its footsteps do not. This is
     * how the game hears it. The listener leaves with the scene or piece that set it up.
     *
     * @example
     * ```ts
     * const scene = useScene();
     * scene.onPaused(() => steps.pause());
     * scene.onResumed(() => steps.resume());
     *
     * // From the HUD, about the level under it.
     * scene.onPaused(() => music.setVolume(0.2), 'Level');
     * ```
     *
     * @param name The scene to listen to. Leave it out and it is the one that called `useScene`.
     * @returns What stops it sooner.
     */
    onPaused(listener: () => void, name?: string): () => void;
    /**
     * Runs `listener` each time a scene that was paused runs again. See {@link TSceneHandle.onPaused}.
     *
     * @param name The scene to listen to. Leave it out and it is the one that called `useScene`.
     * @returns What stops it sooner.
     */
    onResumed(listener: () => void, name?: string): () => void;
};

/**
 * Returns the controls for the game's scenes: `launch`, `stop`, `change`, `restart`, `pause`,
 * `resume`, `isPaused` and `isRunning`.
 *
 * Call it in the scene body, keep the handle, and use it later from `useUpdate`: it holds the game
 * and the scene it was called in, so it keeps working after the body is over.
 *
 * A game system calls it too, for the scenes it names: a system that pauses the level when the pad
 * is unplugged, or launches the HUD. It has no scene of its own, so `change`, and the calls with no
 * name, throw there.
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
 * @returns The controls: `change`, `launch`, `stop`, `restart`, `pause`, `resume`, `isPaused`,
 * `isRunning`, and `onPaused` and `onResumed` to hear a scene freeze.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
/**
 * The scenes a change without a transition is replacing right now: the scene coming in is being
 * built while the one going out still runs. Neither stopped nor started over from inside that build,
 * as neither end of a covered change is.
 */
const beingReplaced = new WeakSet<TBox>();


/**
 * Replaces the running scene `outgoing` with the one registered as `name`, as `useScene().change`
 * does once it has decided to: covered with `transition` if given (one this card can draw), in
 * `outgoing`'s place among the scenes, and a restart when `name` is the one `outgoing` was started
 * under. What calls it has checked that nothing else is being covered.
 *
 * Throws what building the new scene threw, with the old one still running, except in a covered
 * restart, which builds at the swap: there `restartFailed`, if given, hears what threw and the cover
 * goes quietly, and without it the swap says it, as ever.
 *
 * @returns The new scene's root, or `null` for a covered restart, built later.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const replaceScene = (
    store: TRuntimeStore,
    outgoing: TBox,
    name: string,
    props: object | undefined,
    transition: TTransition | undefined,
    restartFailed?: (error: unknown) => void,
): TBox | null => {
    // By the name it was started under, which a scene built from a document does not answer to.
    const restarting = name === startedAs(outgoing) && store.get('world').names.has(name);
    if (transition !== undefined && restarting) {
        // Restarting under the cover: the old copy stays on screen until it is covered, and the new
        // one is built then, once the old one has stopped. Never both at once, since a name means
        // one scene.
        startTransitionRestart(store, transition, outgoing, (restart) => {
            if (restartFailed === undefined) return startScene(store, name, props, restart);
            try {
                return startScene(store, name, props, restart);
            } catch (error) {
                restartFailed(error);
                return null;
            }
        });
        return null;
    }
    if (transition !== undefined) {
        // In flight before the new scene is built, so a covered change its body or its `useReady`
        // asks for is refused rather than written over; a name that is not there throws and takes
        // the cover with it. Nothing stops yet: the scene going out is what the screen is still
        // showing, and it is stopped at the swap. Built in its place among the scenes, so the next
        // level comes in under the HUD.
        return startTransitionBuilding(store, transition, outgoing, () => startScene(store, name, props, inPlaceOf(store, outgoing)));
    }
    if (restarting) {
        // Restarting: the old copy has to be gone before the name can start again, and the new one
        // takes its place among the scenes, under a HUD launched over it.
        const restart = inPlaceOf(store, outgoing);
        stopScene(store, outgoing);
        // Its cleanups may have ended the game: nothing is built into it then.
        if (store.get('loop').destroyed) {
            return null;
        }
        return startScene(store, name, props, restart);
    }
    // The new scene first, so a name that does not exist throws before anything stops, in this
    // one's place among the scenes, so the next level is under the HUD.
    beingReplaced.add(outgoing);
    let built: TBox;
    try {
        built = startScene(store, name, props, inPlaceOf(store, outgoing));
    } finally {
        beingReplaced.delete(outgoing);
    }
    stopScene(store, outgoing);
    return built;
};

export const useScene = (): TSceneHandle => {
    const store = getActiveGame();
    const active = getActiveBox();
    if (store === null || active === null) {
        throw outsideSceneBody('useScene');
    }
    // A game system belongs to no scene: its handle reaches the scenes it names, and has none of its
    // own. Its root is the system itself, which a `change` would stop.
    const system = systemNameOf(active);
    const owner: TBox | null = system === undefined ? rootOf(active) : null;
    let leaving = false;
    /**
     * Inside a `change` of this handle: a hard cut builds the scene coming in before it stops this
     * one, and that body may reach back here.
     */
    let changing = false;
    /**
     * Whether this scene asked to restart itself. Only the first call does anything, as with
     * `change`: the condition that asks for it usually stays true for several frames, and the old
     * copy goes on updating until it stops, or until the screen is covered.
     */
    let restartedSelf = false;
    /**
     * The copy this scene's own restart built: the latch on `restartedSelf` holds while it runs, and
     * lets go once it is gone, so a later restart of the same name builds again.
     */
    let restartedCopy: TBox | null = null;

    /** How many of the game's own scenes are running: the splash, while it is up, is not one. */
    const gameScenes = (): number => {
        const splash = splashOf(store);
        return store.get('world').scenes.filter((scene) => scene !== splash).length;
    };

    /** Whether the game has ended: nothing is started, changed or restarted in it any more. */
    const ended = (): boolean => store.get('loop').destroyed;

    /**
     * The running scene a call is about: the one named, or, with no name, the calling scene as long
     * as it is still running. Its root and not its name, so a handle kept from a scene that was
     * restarted cannot reach the new copy that took its name, and a scene built from a document
     * reaches itself even when another running scene answers to the name its document gave it.
     */
    const running = (name: string | undefined, action: string): TBox | undefined => {
        if (name !== undefined) {
            return runningAs(name, false);
        }
        const self = ownScene(action);
        return store.get('world').scenes.includes(self) ? self : undefined;
    };

    /**
     * The running scene `name` means. A name one of the game's scenes is registered under means that
     * scene, and no other, running or not: what a scene's function names too (`restart(Level)`). Any
     * other name, unless `registeredOnly`, means the scene whose document gave its root that name.
     * The two can differ: a scene registered as 'Room', and another scene's document that calls its
     * own root 'Room'.
     */
    const runningAs = (name: string, registeredOnly: boolean): TBox | undefined => {
        const scenes = store.get('world').scenes;
        const registered = scenes.find((root) => startedAs(root) === name);
        if (registered !== undefined || registeredOnly || store.get('world').names.has(name)) {
            return registered;
        }
        return findScene(store, name);
    };

    /**
     * Whether `name` means this handle's own scene, as `runningAs` would take it even with the scene
     * gone: the name it was registered under, or, unless only that is meant or another scene is
     * registered under it, the name its document gave its root.
     */
    const namesOwner = (name: string, registeredOnly: boolean): boolean => {
        if (owner === null) {
            return false;
        }
        if (startedAs(owner) === name) {
            return true;
        }
        return !registeredOnly && owner.name === name && !store.get('world').names.has(name);
    };

    /**
     * A listener that hears a pause or a resume of the scene `name` means, and not of another
     * answering to it: told under a name by the scene its document called so, it is heard only when
     * that is the scene `pause(name)` would pause.
     */
    const heardAs = (name: string, listener: () => void) => (): void => {
        if (scenePauseTold() === runningAs(name, false)) listener();
    };

    /**
     * The calling scene, for a call that left the name out. Thrown in a game system, which has none:
     * the call was written for a scene, and guessing one would act on something nobody named.
     */
    const ownScene = (action: string): TBox => {
        if (owner === null) {
            throw new Error(`[NacatamalOn] useScene().${action}: '${system}' is a game system, which belongs to no scene. Name the scene it is about: useScene().${action}('Level').`);
        }
        return owner;
    };

    /**
     * The name a scene was registered under, given that name or its function.
     */
    const nameOf = (scene: string | TSceneFn<never>, action: string): string => {
        if (typeof scene === 'string') {
            return scene;
        }
        for (const [name, body] of store.get('world').names) {
            if (body === scene) {
                return name;
            }
        }
        throw new Error(`[NacatamalOn] useScene().${action}: this function is not one of the game's scenes. Add it to the object passed to createGame.`);
    };

    /**
     * A listener that hears a pause or a resume of this scene only, and not of another answering
     * to its name.
     */
    const own = (listener: () => void) => (): void => {
        if (scenePauseTold() === owner) listener();
    };

    const warnNotRunning = (action: string, name: string | undefined): void => {
        const which = name === undefined ? `its own scene '${owner?.name}'` : `scene '${name}'`;
        console.warn(`[NacatamalOn] useScene().${action}: ${which} is not running.`);
    };

    /**
     * Whether another covered change is on screen now, warned. The new one is refused rather than
     * cut over, since the one on screen would be left with an end nobody moves, and rather than
     * queued: asked while another is covering, it is nearly always late (the timer running out
     * after the goal was reached), and played afterwards it would undo the change that won.
     */
    const busy = (action: string, name: string): boolean => {
        if (store.get('transition').active === null) {
            return false;
        }
        console.warn(`[NacatamalOn] useScene().${action}: '${name}' was ignored because a scene change is already being covered, and the first one wins. To ${action} once the scene coming in is on screen, call it from useSceneTransitionEnd.`);
        return true;
    };

    /**
     * The transition a call goes ahead with: the one asked for, or none when this card cannot draw
     * it, which `canDrawTransition` says.
     */
    const drawable = (transition: TTransition | undefined, action: string): TTransition | undefined => {
        if (transition === undefined) {
            return undefined;
        }
        return canDrawTransition(store, transition, `useScene().${action}`) ? transition : undefined;
    };

    const launchNow = (name: string, options: TSceneLaunchOptions<object> | undefined): void => {
        // A handle kept past the game's end, or a cleanup run as it ends: nothing starts in it.
        if (ended()) {
            return;
        }
        if (options?.transition !== undefined && busy('launch', name)) {
            return;
        }
        const transition = drawable(options?.transition, 'launch');
        if (transition === undefined) {
            startScene(store, name, options?.props);
            return;
        }
        // In flight before the scene is built, so a covered change its body or its `useReady`
        // asks for is refused rather than written over.
        startTransitionBuilding(store, transition, null, () => startScene(store, name, options?.props));
    };

    const handle: TSceneHandle = {
        launch: (scene: string | TSceneFn<never>, options?: TSceneLaunchOptions<object>) => {
            const name = nameOf(scene, 'launch');
            // A system launching before the game has any scene (its body, its `useReady`): kept for
            // the first frame the game is shown, so it goes over the scene the game starts on. A name
            // that is not one of the game's scenes is said now, as ever.
            // Only while the systems start: a game left with no scene later on launches at once, as
            // a scene would.
            if (owner === null && systemsStarting(store) && store.get('world').scenes.length === 0 && store.get('world').names.has(name)) {
                launchOnceShown(store, system!, name, () => {
                    // By either name, as `launch` would refuse it.
                    if (store.get('world').scenes.some((root) => root.name === name || startedAs(root) === name)) {
                        console.warn(`[NacatamalOn] useScene().launch: '${name}', launched by game system '${system}' before the game had a scene, was already running once it was shown, so it was left as it is. Launch it from one place only: before the first frame, isRunning does not see what waits.`);
                        return;
                    }
                    launchNow(name, options);
                });
                return;
            }
            launchNow(name, options);
        },
        stop: (nameOrOptions?: string | TSceneStopOptions, given?: TSceneStopOptions) => {
            const name = typeof nameOrOptions === 'string' ? nameOrOptions : undefined;
            const options = typeof nameOrOptions === 'object' && nameOrOptions !== null ? nameOrOptions : given;
            const root = running(name, 'stop');
            if (root === undefined) {
                warnNotRunning('stop', name);
                return false;
            }
            const target = root.name;
            // Neither end of a change being covered can be taken out from under it: stopping the
            // one going out would uncover onto nothing, and stopping the one coming in would leave
            // the screen covered with nothing behind it to show.
            const covering = store.get('transition').active;
            if ((covering !== null && (covering.incoming === root || covering.outgoing === root)) || beingReplaced.has(root)) {
                console.warn(`[NacatamalOn] useScene().stop: '${target}' is part of a scene change being covered right now, so it was left alone. Wait for the change to finish.`);
                return false;
            }
            if (options?.transition !== undefined && busy('stop', target)) {
                return false;
            }

            if (root === owner) {
                // A scene that closed itself must not `change` afterwards: it would start the next
                // scene and stop nothing, quietly behaving as a `launch`.
                leaving = true;
            }

            const transition = drawable(options?.transition, 'stop');
            if (transition !== undefined) {
                // Stopped at the swap, behind the cover. Said now rather than then: by then the
                // call that did it is long gone from anybody's mind.
                if (gameScenes() === 1) {
                    console.warn(`[NacatamalOn] useScene().stop: '${target}' is the last scene, so the game will be running with nothing in it. Use change() to replace a scene, or launch() the next one first.`);
                }
                startTransition(store, transition, null, root);
                return true;
            }

            stopScene(store, root);
            if (gameScenes() === 0) {
                console.warn(`[NacatamalOn] useScene().stop: '${target}' was the last scene, so the game is running with nothing in it. Use change() to replace a scene, or launch() the next one first.`);
            }
            return true;
        },
        change: (scene: string | TSceneFn<never>, options?: TSceneChangeOptions<object>) => {
            if (owner === null) {
                throw new Error(`[NacatamalOn] useScene().change: '${system}' is a game system, which has no scene to replace. Start the next one with launch() and stop the one it replaces by its name.`);
            }
            if (ended()) {
                return;
            }
            // Leaving holds while the change is being made, while the scene is gone, and while it is
            // still being covered on its way out. A change can also be called off behind the cover,
            // when the scene it was bringing in is stopped from elsewhere: the cover goes with it,
            // this scene is left on screen, and it has to be able to move on again.
            if (leaving && (changing || isSceneStopped(owner) || store.get('transition').active?.outgoing === owner)) {
                return;
            }
            leaving = false;
            // A handle kept by a copy someone else stopped, called later from a promise, or by one
            // whose body threw and so never ran: there is nothing of it to replace.
            if (isSceneStopped(owner) || (!store.get('world').scenes.includes(owner) && !isBeingBuilt(owner))) {
                warnNotRunning('change', undefined);
                return;
            }
            const name = nameOf(scene, 'change');
            const props = options?.props;

            // Refused outright, not quietly downgraded to a cut. The latch above only stops the
            // scene that asked; a HUD launched alongside it holds its own handle and knows nothing
            // about the change already running. Cutting now would leave that change with neither of
            // its ends: its outgoing scene would never be stopped and would sit in the list for the
            // rest of the game, and the screen would be left covered by a transition nobody moves.
            if (busy('change', name)) {
                return;
            }

            // A card that cannot draw it makes it a cut, and says so: see `canDrawTransition`.
            const transition = drawable(options?.transition, 'change');
            // From its own body, cut: it is not listed yet, so it could not be stopped, and both
            // would run. Covered, it is stopped at the swap, long after its body.
            if (transition === undefined && isBeingBuilt(owner)) {
                console.warn(`[NacatamalOn] useScene().change: '${owner.name}' is still being built, so it was left as it is. Change from its useReady, or with a transition.`);
                return;
            }
            // By the name it was started under, which a scene built from a document does not answer
            // to. Registered still, or the restart would only find out behind the cover.
            const restarting = name === startedAs(owner) && store.get('world').names.has(name);
            // Another running scene answering to its name, by the one its document gave it, would
            // make the new copy refuse to start once this one had stopped: said before anything stops.
            const taken = restarting ? nameTakenBy(store, name, owner) : undefined;
            if (taken !== undefined) {
                throw new Error(`[NacatamalOn] useScene().change: '${name}' cannot be started again while scene '${taken.name}' (started as '${startedAs(taken)}') answers to that name too, and a name means one scene. Stop that one first, or give its document's root another name.`);
            }

            leaving = true;
            changing = true;

            try {
                replaceScene(store, owner, name, props, transition);
            } catch (error) {
                leaving = false;
                throw error;
            } finally {
                changing = false;
            }
        },
        restart: (sceneOrOptions?: string | TSceneFn<never> | TSceneRestartOptions<object>, given?: TSceneRestartOptions<object>) => {
            const named = typeof sceneOrOptions === 'string' || typeof sceneOrOptions === 'function' ? nameOf(sceneOrOptions, 'restart') : undefined;
            const options = typeof sceneOrOptions === 'object' && sceneOrOptions !== null ? sceneOrOptions : given;
            if (ended()) {
                return false;
            }
            // This scene already restarting itself: the copy that asked on its way out behind the
            // cover, or gone with the copy it built still running. It will be, or it was, so nothing
            // more is done and nothing is said.
            if (owner !== null && restartedSelf && (named === undefined || namesOwner(named, typeof sceneOrOptions === 'function'))
                && (store.get('transition').active?.outgoing === owner
                    || (isSceneStopped(owner) && restartedCopy !== null && store.get('world').scenes.includes(restartedCopy)))) {
                return true;
            }
            // By its function, only the scene started from it; by a name, the one registered under it
            // before one whose document calls it so.
            const root = named !== undefined ? runningAs(named, typeof sceneOrOptions === 'function') : running(undefined, 'restart');
            if (root === undefined) {
                warnNotRunning('restart', named);
                return false;
            }
            const target = root.name;
            // Neither end of a change being covered can be taken out from under it, as with `stop`.
            const covering = store.get('transition').active;
            if ((covering !== null && (covering.incoming === root || covering.outgoing === root)) || beingReplaced.has(root)) {
                console.warn(`[NacatamalOn] useScene().restart: '${target}' is part of a scene change being covered right now, so it was left alone. Wait for the change to finish.`);
                return false;
            }
            // Nor one held behind a cover, waiting to be shown.
            if (root.held) {
                console.warn(`[NacatamalOn] useScene().restart: '${target}' is waiting to be shown behind a cover, so it was left alone. Restart it once it is shown.`);
                return false;
            }
            if (options?.transition !== undefined && busy('restart', target)) {
                return false;
            }
            // By the name it was started under, which a scene built from a document does not answer
            // to. Checked before anything stops, so a scene that cannot be built again stays.
            const name = startedAs(root);
            if (!store.get('world').names.has(name)) {
                throw new Error(`[NacatamalOn] useScene().restart: '${target}' was started as '${name}', which is no longer one of the game's scenes, so it cannot be built again. Register it again before restarting it.`);
            }
            // Another running scene answering to that name, by the one its document gave it, would
            // make `startScene` refuse the new copy once the old one had already stopped.
            const taken = nameTakenBy(store, name, root);
            if (taken !== undefined) {
                console.warn(`[NacatamalOn] useScene().restart: '${name}' was left running, because scene '${taken.name}' (started as '${startedAs(taken)}') answers to that name too, and a name means one scene. Stop that one first, or give its document's root another name.`);
                return false;
            }
            const props = options?.props ?? startedWith(root);

            if (root === owner) {
                // A scene that restarted itself must not `change` afterwards: the copy that asked is
                // on its way out. Nor restart again: see `restartedSelf`.
                leaving = true;
                restartedSelf = true;
            }

            const transition = drawable(options?.transition, 'restart');
            if (transition !== undefined) {
                // The old copy stays on screen until it is covered, and the new one is built then.
                startTransitionRestart(store, transition, root, (restart) => {
                    const built = startScene(store, name, props, restart);
                    if (root === owner) restartedCopy = built;
                    return built;
                });
                return true;
            }
            // The old copy has to be gone before the name can start again, and the new one takes
            // its place among the scenes.
            const restart = inPlaceOf(store, root);
            stopScene(store, root);
            // Its cleanups may have ended the game: nothing is built into it then.
            if (ended()) {
                return false;
            }
            const built = startScene(store, name, props, restart);
            if (root === owner) restartedCopy = built;
            return true;
        },
        isRunning: (scene: string | TSceneFn<never>) => {
            // By either name, as `launch` refuses one: true whenever a launch of it would throw,
            // its body running now included.
            const name = nameOf(scene, 'isRunning');
            return store.get('world').scenes.some((root) => root.name === name || startedAs(root) === name) || isNameBeingBuilt(store, name);
        },
        pause: (name) => {
            const target = running(name, 'pause');
            if (target === undefined) {
                warnNotRunning('pause', name);
                return false;
            }
            return setScenePaused(store, target, true);
        },
        resume: (name) => {
            const target = running(name, 'resume');
            if (target === undefined) {
                warnNotRunning('resume', name);
                return false;
            }
            return setScenePaused(store, target, false);
        },
        isPaused: (name) => {
            const target = running(name, 'isPaused');
            return target === undefined ? false : isScenePaused(store, target);
        },
        // By name, so a HUD listening to 'Level' still hears it after the level restarts. With no
        // name, about this scene only: another running scene can answer to the same name.
        onPaused: (listener, name) => onGameMoment(store, `scene paused: ${name ?? ownScene('onPaused').name}`, active, name === undefined ? own(listener) : heardAs(name, listener)),
        onResumed: (listener, name) => onGameMoment(store, `scene resumed: ${name ?? ownScene('onResumed').name}`, active, name === undefined ? own(listener) : heardAs(name, listener)),
    };
    return handle;
};
