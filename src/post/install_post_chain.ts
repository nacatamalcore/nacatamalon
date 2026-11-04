import { applyShaderToEffect, rememberPostOverrides } from './apply_shader_to_effect';
import { findPostBuiltin } from './builtin/catalog';
import { loadLut, newLut } from '../loaders/lut';
import { loadPalette, newPalette } from '../loaders/palette';
import { loadShader, newShader } from '../loaders/shader';
import { newPostEffect } from './new_post_effect';
import type { TPostChain, TPostChainEntry } from './types/t_post_chain';
import type { TPostEffect, TPostSource } from './types/t_post_effect';
import type { TRuntimeStore } from '../store';
import { assetKey, findAssetFile } from '../loaders/asset_key';

/**
 * A file already fetched, or one fetched now. Two entries naming the same one share a single load.
 */
const shaderFor = (store: TRuntimeStore, src: string) => {
    const { shaders } = store.get('assets');
    const key = assetKey(src);
    let shader = findAssetFile(shaders, key);
    if (shader === undefined) {
        shader = newShader(src, key);
        shaders.set(key, shader);
        void loadShader(store, shader);
    }
    return shader;
};

const paletteFor = (store: TRuntimeStore, src: string) => {
    const { palettes } = store.get('assets');
    const key = assetKey(src);
    let palette = findAssetFile(palettes, key);
    if (palette === undefined) {
        palette = newPalette(src, key);
        palettes.set(key, palette);
        void loadPalette(store, palette);
    }
    return palette;
};

const lutFor = (store: TRuntimeStore, src: string) => {
    const { luts } = store.get('assets');
    const key = assetKey(src);
    let lut = findAssetFile(luts, key);
    if (lut === undefined) {
        lut = newLut(src, key);
        luts.set(key, lut);
        void loadLut(store, lut);
    }
    return lut;
};

/**
 * The built-in each effect made from an entry was made from, by its key: what a scene's document
 * writes back for it, whatever the entry called it.
 */
const builtinKeys = new WeakMap<TPostEffect, string>();

/**
 * What an entry said of its effect beyond its knobs, the name it gave it and the options it was made
 * with, so a document written back from the effect says them again.
 */
const entryExtras = new WeakMap<TPostEffect, Pick<TPostChainEntry, 'name' | 'options'>>();

/**
 * The name and the options the entry an effect was made from gave it, or nothing for one made in
 * code.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const entryExtrasOf = (effect: TPostEffect): Pick<TPostChainEntry, 'name' | 'options'> => entryExtras.get(effect) ?? {};

/**
 * The key of the built-in an effect is, or `null` for one written in code or read from a file:
 * one made from an entry naming it, or one of the engine's own spread in as it is.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const builtinKeyOf = (effect: TPostEffect): string | null => {
    const known = builtinKeys.get(effect);
    if (known !== undefined) {
        return known;
    }
    if (effect.effect !== null || effect.name === null) {
        return null;
    }
    const builtin = findPostBuiltin(effect.name);
    // Its name alone could be anybody's: it is the engine's when it says what the engine's says.
    return builtin !== null && builtin.build().fragment === effect.fragment ? builtin.key : null;
};

/**
 * Makes the effect one written-down entry names: a built-in, laid over with the entry's values, or a
 * file, fetched now if nobody has yet. `null`, said, for a built-in this version does not have.
 *
 * @returns The effect, and what lets go of its file again when it leaves.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const effectFromEntry = (
    store: TRuntimeStore,
    entry: TPostChainEntry,
    source: TPostSource,
): { effect: TPostEffect; unbind: () => void } | null => {
    const asked = entry.uniforms ?? {};
    let effect: TPostEffect;
    let unbind = (): void => undefined;

    if (entry.builtin !== undefined) {
        const builtin = findPostBuiltin(entry.builtin);
        if (builtin === null) {
            console.warn(
                `[NacatamalOn] post: this version has no built-in effect called '${entry.builtin}', ` +
                'so that entry is skipped.',
            );
            return null;
        }
        const built = builtin.build(entry.options);
        effect = newPostEffect({
            name: entry.name ?? built.name,
            fragment: built.fragment,
            fragmentGlsl: built.fragmentGlsl,
            // The entry's values laid over what the built-in starts them at.
            uniforms: { ...built.uniforms, ...asked },
            uniformSig: built.uniformSig,
            passes: built.passes,
            history: built.history,
            ...(built.reach !== undefined ? { reach: built.reach } : {}),
            enabled: entry.enabled ?? true,
        }, null, source);
        builtinKeys.set(effect, builtin.key);
    } else if (entry.effect !== undefined) {
        const shader = shaderFor(store, entry.effect);
        const made = newPostEffect({
            name: entry.name ?? entry.effect,
            uniforms: asked,
            enabled: entry.enabled ?? true,
        }, shader, source);
        effect = made;
        rememberPostOverrides(made, asked);
        shader.bound.push(made);
        if (shader.status === 'ready') {
            applyShaderToEffect(made, shader);
        }
        unbind = () => {
            const at = shader.bound.indexOf(made);
            if (at !== -1) {
                shader.bound.splice(at, 1);
            }
        };
    } else {
        // Neither a built-in nor a file: `normalizePostChain` never lets one through.
        return null;
    }

    if (entry.palette !== undefined) {
        effect.palette = paletteFor(store, entry.palette);
    } else if (entry.lut !== undefined) {
        effect.lut = lutFor(store, entry.lut);
    }
    if (entry.name !== undefined || entry.options !== undefined) {
        entryExtras.set(effect, {
            ...(entry.name !== undefined ? { name: entry.name } : {}),
            ...(entry.options !== undefined ? { options: { ...entry.options } } : {}),
        });
    }
    return { effect, unbind };
};

/**
 * Turns a project's written-down chain into running effects.
 *
 * **Nothing is waited for.** Every effect goes in at once with no source, and the chain skips the
 * ones that have none yet, so the first frames come out unaffected and each effect starts the moment
 * its own file lands. Waiting instead would mean the game's first seconds are a blank screen because
 * a palette is slow.
 *
 * Deliberately not counted among any scene's loads either: the chain belongs to the game, so there
 * is no scene whose readiness it should hold up.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const installPostChain = (store: TRuntimeStore, chain: TPostChain): void => {
    const { effects } = store.get('post');

    for (const [index, entry] of chain.entries()) {
        const made = effectFromEntry(store, entry, 'project');
        if (made === null) {
            continue;
        }
        entryOf.set(made.effect, index);
        effects.push(made.effect);
    }
};

/**
 * Which entry of the project's chain made each effect: an entry the engine skipped (a built-in this
 * version does not have) makes none, so the place in the list and the place in the chain can differ.
 */
const entryOf = new WeakMap<TPostEffect, number>();

/**
 * Lays values over the knobs of the effect the project's chain made from entry `index`, in place:
 * read by the next frame, with nothing made again. Says whether there was such an effect.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const tuneProjectPostEffect = (store: TRuntimeStore, index: number, values: Readonly<Record<string, unknown>>): boolean => {
    const effect = store.get('post').effects.find((candidate) => candidate.source === 'project' && entryOf.get(candidate) === index);
    if (effect === undefined) {
        return false;
    }
    const uniforms = effect.uniforms as Record<string, unknown>;
    for (const [name, value] of Object.entries(values)) {
        // Only knobs it has: its shape was fixed when it was made.
        if (uniforms[name] !== undefined) {
            uniforms[name] = Array.isArray(value) ? [...value] : value;
        }
    }
    return true;
};

/**
 * Swaps the project's effects for a new set, leaving every scene's own alone.
 *
 * What a host editing the look of a game while it runs calls. The project's go back **in front**,
 * which is where they were: a scene's effect is something that scene is doing, and the project's are
 * the screen it is being shown on.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const replaceProjectPostChain = (store: TRuntimeStore, chain: TPostChain): void => {
    const state = store.get('post');
    const scenes = state.effects.filter((effect) => effect.source === 'scene');

    // Off the file each one came from too, or that file would go on holding effects that are gone,
    // one more for every change made while the game runs.
    for (const effect of state.effects) {
        if (effect.source === 'project' && effect.effect !== null) {
            const { bound } = effect.effect;
            const at = bound.indexOf(effect);
            if (at !== -1) {
                bound.splice(at, 1);
            }
        }
    }

    state.effects.length = 0;
    installPostChain(store, chain);
    state.effects.push(...scenes);
    store.setState('post', { chain: state.chain + 1 });
};
