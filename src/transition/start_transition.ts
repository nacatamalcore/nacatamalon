import { newPostEffect } from '../post/new_post_effect';
import { whenLoaded } from '../loaders';
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
export const canDrawTransition = (store: TRuntimeStore, transition: TTransition): boolean => {
    const backend = store.get('screen').renderer.capabilities.backend;
    if (backend !== 'WEBGL2' || transition.fragmentGlsl !== undefined) {
        return true;
    }

    console.warn(
        `[NacatamalOn] useScene().change: the transition '${transition.name ?? 'unnamed'}' has no GLSL half, ` +
        'so it cannot be drawn on WebGL2. The scene was changed without it. Give it a `fragmentGlsl` to ' +
        'have it run on both cards.',
    );
    return false;
};

/**
 * Puts a transition in flight: builds the effect that draws it, holds the scene coming in, and
 * starts watching what that scene asked to load.
 *
 * The effect is made **here and once**, and the record is then kept for the life of the transition:
 * a compiled shader is cached against that object's identity, so building a fresh one each frame
 * would compile each frame and never once find the cache. Its knobs are copied out of the recipe
 * rather than shared with it, so two changes made from the same `fade(300)` cannot write over each
 * other.
 *
 * @param store The runtime store of the game the change belongs to.
 * @param transition What was asked for.
 * @param incoming The scene already started and about to be held back.
 * @param outgoing The scene it replaces, which goes on running until the swap.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const startTransition = (
    store: TRuntimeStore,
    transition: TTransition,
    incoming: TBox,
    outgoing: TBox,
): TTransitionState => {
    const effect = newPostEffect({
        name: transition.name ?? 'transition',
        fragment: transition.fragment,
        fragmentGlsl: transition.fragmentGlsl,
        uniforms: { ...(transition.uniforms ?? {}) },
        uniformSig: transition.uniformSig,
    }, null, 'transition');

    const state: TTransitionState = {
        effect,
        // Half of what the author wrote, and in the other unit: they count the whole thing in
        // milliseconds because that is what a stopwatch says, the loop counts seconds.
        half: Math.max(0, transition.duration) / 2000,
        elapsed: 0,
        progress: 0,
        phase: 'cover',
        incoming,
        outgoing,
        loaded: false,
        done: false,
    };

    // Held from this moment: it exists, and its loading has already started, but it neither
    // updates, nor draws, nor answers the pointer until the swap.
    incoming.held = true;
    store.setState('transition', { active: state });

    // Everything the scene's body asked for, which is the list `useLoader` counts. The body is
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

    return state;
};
