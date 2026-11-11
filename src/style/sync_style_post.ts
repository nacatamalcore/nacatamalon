import { effectFromEntry } from '../post/install_post_chain';
import { normalizePostChain } from '../post/post_chain';
import type { TPostEffect } from '../post/types/t_post_effect';
import type { TRuntimeStore } from '../store';
import type { TRenderStyle } from './t_render_style';

/**
 * The style whose effects are in a game's chain now, and the effects themselves, to take off when
 * another comes in.
 */
const installed = new WeakMap<TRuntimeStore, { style: TRenderStyle | null; made: { effect: TPostEffect; unbind: () => void }[] }>();

/**
 * Whether the effects a style made are the last of the chain, in their order.
 */
const lastInChain = (effects: readonly TPostEffect[], made: readonly { effect: TPostEffect }[]): boolean => {
    const from = effects.length - made.length;
    return from >= 0 && made.every((one, i) => effects[from + i] === one.effect);
};

/**
 * Puts the effects of the style a game is drawn with now in its chain, taking off those of the one
 * before: once, when the style changes (another scene, `set`, the game's coming back). They go after
 * every other effect and stay there: one a scene adds later is put before them. Otherwise a frame
 * touches nothing. They are told apart by the style they came with, so a style is changed by giving
 * another, not by editing its `post` in place.
 *
 * Its entries are read as `createGame({ post })` reads them: an old name for a built-in or one of
 * its numbers still works, and what cannot run is left out.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const syncStylePost = (store: TRuntimeStore, style: TRenderStyle | null): void => {
    const current = installed.get(store);
    const { effects } = store.get('post');
    if ((current?.style ?? null) === style) {
        // The same style: only put its effects back at the end if a scene added one after them.
        if (current !== undefined && current.made.length > 0 && !lastInChain(effects, current.made)) {
            for (const { effect } of current.made) {
                const at = effects.indexOf(effect);
                if (at !== -1) {
                    effects.splice(at, 1);
                }
            }
            effects.push(...current.made.map((one) => one.effect));
        }
        return;
    }
    for (const { effect, unbind } of current?.made ?? []) {
        const at = effects.indexOf(effect);
        if (at !== -1) {
            effects.splice(at, 1);
        }
        unbind();
    }
    const made: { effect: TPostEffect; unbind: () => void }[] = [];
    for (const entry of normalizePostChain(style?.post ?? [])) {
        // A copy of its numbers, rows included: the effect turns them while the game runs, and a
        // style is shared (the engine's own are frozen).
        const uniforms = entry.uniforms === undefined
            ? undefined
            : Object.fromEntries(Object.entries(entry.uniforms).map(([name, value]) => [name, Array.isArray(value) ? [...value] : value]));
        const one = effectFromEntry(store, { ...entry, ...(uniforms !== undefined ? { uniforms } : {}) }, 'scene');
        if (one !== null) {
            effects.push(one.effect);
            made.push(one);
        }
    }
    installed.set(store, { style, made });
    // The chain is not the one it was: what holds one of its effects by name (a motion's track)
    // finds them again.
    if ((current?.made.length ?? 0) > 0 || made.length > 0) {
        store.setState('post', { chain: store.get('post').chain + 1 });
    }
};
