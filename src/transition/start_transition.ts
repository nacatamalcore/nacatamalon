import { newPostEffect } from '../post/new_post_effect';
import { whenLoaded } from '../loaders';
import { stopScene } from '../scene/stop_scene';
import { startedAs } from '../scene/start_scene';
import { endTransition } from './end_transition';
import type { TBox } from '../box';
import type { TRuntimeStore } from '../store';
import type { TTransition } from './types/t_transition';
import type { TTransitionState } from './types/t_transition_state';

/**
 * Whether this card can draw this transition, warning once if it cannot.
 *
 * Asked **before** anything is started, because the answer changes what `change` does rather than
 * how it looks. A transition nobody can draw is not a transition with the picture missing: the
 * scene coming in would be held back, unseen and unticking, for the whole duration and then appear
 * all at once. That is worse than the hard cut, so the hard cut is what it falls back to.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const canDrawTransition = (store: TRuntimeStore, transition: TTransition, who = 'useScene().change'): boolean => {
    const backend = store.get('screen').renderer.capabilities.backend;
    if (backend !== 'WEBGL2' || transition.fragmentGlsl !== undefined) {
        return true;
    }

    console.warn(
        `[NacatamalOn] ${who}: the transition '${transition.name ?? 'unnamed'}' has no GLSL half, ` +
        'so it cannot be drawn on WebGL2. It was done as a cut instead. Give it a `fragmentGlsl` to ' +
        'have it run on both cards.',
    );
    return false;
};

/**
 * Seconds past which a transition is taken to be a mistake, and said so.
 */
const LONG_TRANSITION = 10;

/**
 * Puts a transition in flight: builds the effect that draws it, holds the scene coming in, and
 * starts watching what that scene asked to load.
 *
 * Either end may be missing, never both: a scene launched has nothing going out, and a scene
 * stopped has nothing coming in.
 *
 * The effect is made **here and once**, and the record is then kept for the life of the transition:
 * a compiled shader is cached against that object's identity, so building a fresh one each frame
 * would compile each frame and never once find the cache. Its knobs are copied out of the recipe
 * rather than shared with it, so two changes made from the same `fade(0.3)` cannot write over each
 * other.
 *
 * @param store The runtime store of the game the change belongs to.
 * @param transition What was asked for.
 * @param incoming The scene already started and about to be held back, or `null` when one is only
 * being stopped.
 * @param outgoing The scene going away, which goes on running until the swap, or `null` when one is
 * only being launched.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const startTransition = (
    store: TRuntimeStore,
    transition: TTransition,
    incoming: TBox | null,
    outgoing: TBox | null,
): TTransitionState => {
    const state = cover(store, transition, outgoing);
    if (incoming !== null) {
        bringIn(state, incoming);
    }
    return state;
};

/**
 * Puts a transition in flight **before** the scene it brings in is built, and hands it that scene
 * once it is.
 *
 * Building a scene runs its body and its `useReady`, and either may ask for a covered change of its
 * own. Asked while this one is not in flight yet, that one would be taken, and then written over by
 * this one: its scene held for ever, with nothing left to let it go. In flight first, this one is
 * what that one finds, and that one is refused.
 *
 * A scene that fails to build takes the cover with it. One whose cover was dropped while it was
 * being built (the scene going out stopped from in there) is simply shown: holding it would leave it
 * held with nothing to let it go.
 *
 * @param store The runtime store of the game the change belongs to.
 * @param transition What was asked for.
 * @param outgoing The scene going away, or `null` when one is only being launched.
 * @param build Starts the scene coming in and gives it back.
 * @returns The scene built.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const startTransitionBuilding = (
    store: TRuntimeStore,
    transition: TTransition,
    outgoing: TBox | null,
    build: () => TBox,
): TBox => {
    const state = cover(store, transition, outgoing);
    // Not loaded until it is here: nothing has asked for anything yet.
    state.loaded = false;
    let incoming: TBox;
    try {
        incoming = build();
    } catch (error) {
        endTransition(store, state);
        throw error;
    }
    if (store.get('transition').active === state) {
        bringIn(state, incoming);
    }
    return incoming;
};

/**
 * Puts in flight a scene restarting itself: the screen is covered over the old copy, still running,
 * and the new one is built at the swap, by `rebuildBehindCover`, once the old one has stopped.
 *
 * Not built first like any other scene coming in, because then both copies would run at once under
 * one name, and both would reach for what the scene keeps under a key (a picture painted in code, a
 * pause heard by name) while the player still sees the old one.
 *
 * @param store The runtime store of the game the restart belongs to.
 * @param transition What was asked for.
 * @param outgoing The old copy.
 * @param build Starts the new copy and gives it back.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const startTransitionRestart = (
    store: TRuntimeStore,
    transition: TTransition,
    outgoing: TBox,
    build: () => TBox,
): void => {
    cover(store, transition, outgoing).rebuild = build;
};

/**
 * The swap of a restart: stops the old copy and builds the new one behind the cover.
 *
 * Usually the new copy has nothing left to load, being the same scene, and is uncovered at once. One
 * that asks for something new is held, and the screen stays covered until it lands, as any other
 * scene coming in would. A body that throws takes the cover with it and is said in the console,
 * every time and not only the first like a script that throws: the old copy has already stopped,
 * so the game is left as a restart without a transition that throws leaves it.
 *
 * @param store The runtime store of the game being stepped.
 * @param state The transition, at its swap.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const rebuildBehindCover = (store: TRuntimeStore, state: TTransitionState): void => {
    const build = state.rebuild!;
    state.rebuild = null;
    // Let go of before it is stopped, as at any swap: see `stepGameTransition`.
    const leaving = state.outgoing;
    state.outgoing = null;
    // By its root: another running scene may answer to the same name.
    if (leaving !== null) {
        stopScene(store, leaving);
    }

    let incoming: TBox;
    try {
        incoming = build();
    } catch (error) {
        endTransition(store, state);
        const failure = error instanceof Error ? error : new Error(String(error));
        console.error(
            `[NacatamalOn] useScene().change: ${leaving === null ? 'a scene' : `'${startedAs(leaving)}'`} threw while it was being restarted, ` +
            'with the old copy already stopped behind the cover. Fix what throws in its body or its useReady.',
            failure,
        );
        // What the editor and a headless run read to know the game failed.
        if (store.get('loop').failure === null) {
            store.setState('loop', { failure });
        }
        return;
    }
    // As in `startTransitionBuilding`: a cover dropped while the scene was being built has nothing
    // left to hold it for.
    if (store.get('transition').active !== state) {
        return;
    }
    // Stopped from its own `useReady`: nothing to hold, and the screen uncovers onto what is left.
    if (!store.get('world').scenes.includes(incoming)) {
        return;
    }

    // Named as the scene coming in even when nothing holds it, so its `useSceneTransitionEnd`
    // waits for the uncover, as the scene coming in of any change does.
    bringIn(state, incoming);
    if (state.loaded) {
        incoming.held = false;
        return;
    }
    // Back to fully covered, to wait: the next step swaps again once it has landed, and that swap
    // lets it go as any other.
    state.phase = 'cover';
    if (state.cross) {
        // Covered, for one that crosses, is the old copy's last picture, which is what the run
        // starting from nothing shows. It has stopped, so the picture is kept and not taken again.
        // A swap that was a cut left the clock at its end, and it stays there, so the next one is a
        // cut too. Told by the clock and not by `progress`, which a curve can put at 1 from the start.
        if (state.elapsed < state.half) {
            state.elapsed = 0;
            state.progress = 0;
        }
        return;
    }
    state.elapsed = state.half;
    state.progress = 1;
};

/**
 * The transition in flight with nothing coming in yet: the effect, the clock, and the scene going
 * out.
 */
const cover = (store: TRuntimeStore, transition: TTransition, outgoing: TBox | null): TTransitionState => {
    // Ten seconds of cover is no transition anyone meant: it is almost always a number written in
    // milliseconds, which is what transitions took before.
    if (transition.duration > LONG_TRANSITION) {
        console.warn(`[NacatamalOn] ${transition.name ?? 'transition'}: it takes ${transition.duration} seconds. Durations are in seconds: did you mean ${transition.duration / 1000}?`);
    }
    const effect = newPostEffect({
        name: transition.name ?? 'transition',
        fragment: transition.fragment,
        fragmentGlsl: transition.fragmentGlsl,
        uniforms: { ...(transition.uniforms ?? {}) },
        uniformSig: transition.uniformSig,
    }, null, 'transition');
    if (transition.mask !== undefined) {
        effect.mask = transition.mask;
    }
    const cross = transition.cross === true;
    // Taken from the next frame drawn, which still shows the scene going out.
    if (cross) {
        effect.outgoing = 'take';
    }

    const state: TTransitionState = {
        effect,
        // Half of what the author wrote: they count the whole thing, covering and uncovering. One
        // that crosses has a single run, and it is the whole thing.
        half: Math.max(0, transition.duration) / (cross ? 1 : 2),
        elapsed: 0,
        progress: 0,
        ease: transition.ease ?? null,
        cross,
        phase: 'cover',
        incoming: null,
        outgoing,
        rebuild: null,
        // Nothing to wait for while nothing is coming in: the swap comes as soon as the screen is
        // covered.
        loaded: true,
        done: false,
    };
    store.setState('transition', { active: state });
    return state;
};

/**
 * Hands a transition in flight the scene it brings in: held, and waited for.
 */
const bringIn = (state: TTransitionState, incoming: TBox): void => {
    state.incoming = incoming;
    // Held from this moment: it exists, and its loading has already started, but it neither
    // updates, nor draws, nor answers the pointer until the swap.
    incoming.held = true;

    // Everything the scene's body asked for, which is the list `useLoadProgress` counts. The body is
    // over, so nothing can be added to it: a held scene does not run, so it cannot ask for more.
    const settled = (): boolean => incoming.loads.every((asset) => asset.status !== 'loading');
    state.loaded = settled();
    if (!state.loaded) {
        for (const asset of incoming.loads) {
            // Recounted rather than counted down, so an asset that settles twice cannot finish the
            // wait early. `whenLoaded` resolves for a failure too: a missing file should cost you
            // the file, not leave the screen covered forever.
            void whenLoaded(asset).then(() => { state.loaded = settled(); });
        }
    }
};
