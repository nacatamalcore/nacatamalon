import { applyShaderToEffect, rememberPostOverrides } from './apply_shader_to_effect';
import { findPostBuiltin } from './builtin/catalog';
import { loadLut, newLut } from '../loaders/lut';
import { loadPalette, newPalette } from '../loaders/palette';
import { loadShader, newShader } from '../loaders/shader';
import { newPostEffect } from './new_post_effect';
import type { TPostChain } from './types/t_post_chain';
import type { TPostEffect } from './types/t_post_effect';
import type { TRuntimeStore } from '../store';

/**
 * A file already fetched, or one fetched now. Two entries naming the same one share a single load.
 */
const shaderFor = (store: TRuntimeStore, src: string) => {
    const { shaders } = store.get('assets');
    let shader = shaders.get(src);
    if (shader === undefined) {
        shader = newShader(src, src);
        shaders.set(src, shader);
        void loadShader(store, shader);
    }
    return shader;
};

const paletteFor = (store: TRuntimeStore, src: string) => {
    const { palettes } = store.get('assets');
    let palette = palettes.get(src);
    if (palette === undefined) {
        palette = newPalette(src, src);
        palettes.set(src, palette);
        void loadPalette(store, palette);
    }
    return palette;
};

const lutFor = (store: TRuntimeStore, src: string) => {
    const { luts } = store.get('assets');
    let lut = luts.get(src);
    if (lut === undefined) {
        lut = newLut(src, src);
        luts.set(src, lut);
        void loadLut(store, lut);
    }
    return lut;
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

    for (const entry of chain) {
        const asked = entry.uniforms ?? {};
        let effect: TPostEffect;

        if (entry.builtin !== undefined) {
            const builtin = findPostBuiltin(entry.builtin);
            if (builtin === null) {
                console.warn(
                    `[NacatamalOn] post: this version has no built-in effect called '${entry.builtin}', ` +
                    'so that entry is skipped.',
                );
                continue;
            }
            const built = builtin.build();
            effect = newPostEffect({
                name: entry.name ?? built.name,
                fragment: built.fragment,
                fragmentGlsl: built.fragmentGlsl,
                // The entry's values laid over what the built-in starts them at.
                uniforms: { ...built.uniforms, ...asked },
                uniformSig: built.uniformSig,
                passes: built.passes,
                history: built.history,
                enabled: entry.enabled ?? true,
            }, null, 'project');
        } else {
            const shader = shaderFor(store, entry.shader);
            effect = newPostEffect({
                name: entry.name ?? entry.shader,
                uniforms: asked,
                enabled: entry.enabled ?? true,
            }, shader, 'project');
            rememberPostOverrides(effect, asked);
            shader.bound.push(effect);
            if (shader.status === 'ready') {
                applyShaderToEffect(effect, shader);
            }
        }

        if (entry.palette !== undefined) {
            effect.palette = paletteFor(store, entry.palette);
        } else if (entry.lut !== undefined) {
            effect.lut = lutFor(store, entry.lut);
        }

        effects.push(effect);
    }
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

    state.effects.length = 0;
    installPostChain(store, chain);
    state.effects.push(...scenes);
};
