import { addPluginPostEffect, allPostEffects } from './builtin/catalog';
import type { TPostBuiltinInfo } from './builtin/types/t_builtin';

/**
 * The effects plugins registered, so the same one registered again is known.
 */
const registered = new Set<TPostBuiltinInfo>();

/**
 * Gives a plugin's screen effect a name the game's data can use, as the engine's own effects have:
 * `createGame({ post: [{ builtin: 'nacatamalon-vhs' }] })`, a render style's `post`, a scene
 * document, a motion moving its uniforms, and a tool's list of effects (`allPostEffects()`). Without
 * it, a plugin's effect can only be put on in code (`usePostProcess(vhs())`).
 *
 * `info` has the shape of the engine's own (`POST_BUILTINS`): its `key` (start it with the plugin's
 * name, so it never meets the engine's or another plugin's), a `label` and a `description` for a
 * list, its `fields` (what the editor shows, and what a motion can move), whether it `binds` a palette
 * or a grading table, `forObjects` for one made for a filter, and `build`, which makes it. Registered,
 * `allPostEffects()` lists it after the engine's own.
 *
 * Registered before the data that names it is read, so in a plugin's install function, called before
 * `createGame`. The same `info` again does nothing; another one under a key already taken throws.
 *
 * @param info The effect, as the engine describes its own.
 *
 * @example
 * ```ts
 * import { registerPostEffect } from 'nacatamalon/extend';
 * import type { TPostBuiltinInfo } from 'nacatamalon/extend';
 *
 * // The plugin's own effect, made as the engine's are: a name, its shader, its uniforms.
 * declare const vhs: TPostBuiltinInfo['build'];
 *
 * registerPostEffect({
 *     key: 'nacatamalon-vhs',
 *     label: 'VHS',
 *     description: 'A tape played once too often: the colours bleed and the picture wobbles.',
 *     binds: null,
 *     fields: [{ key: 'amount', label: 'Amount', type: 'number', min: 0, max: 1, step: 0.05, default: 0.5 }],
 *     build: vhs,
 * });
 * ```
 *
 * @category Extending
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const registerPostEffect = (info: TPostBuiltinInfo): void => {
    if (typeof info?.key !== 'string' || info.key === '') {
        throw new Error('[NacatamalOn] registerPostEffect: an effect needs a key. Start it with the plugin\'s own name, as in \'nacatamalon-vhs\'.');
    }
    if (registered.has(info)) {
        return;
    }
    if (typeof info.build !== 'function') {
        throw new Error(`[NacatamalOn] registerPostEffect: '${info.key}' has no build. Give it the function that makes the effect.`);
    }
    if (!Array.isArray(info.fields)) {
        throw new Error(`[NacatamalOn] registerPostEffect: '${info.key}' has no fields. Give it a list, empty for an effect with nothing to tune.`);
    }
    const names = [info.key, ...(info.formerKeys ?? [])];
    const taken = allPostEffects().find((known) => names.some((name) => name === known.key || known.formerKeys?.includes(name)));
    if (taken !== undefined) {
        throw new Error(`[NacatamalOn] registerPostEffect: '${taken.key}' is already an effect's name${registered.has(taken) ? ', another plugin\'s' : ', the engine\'s own'}. Give this one a name of its own, starting with the plugin's.`);
    }
    registered.add(info);
    // Found from now on wherever the engine's are: chains, styles, documents, motions, a tool's list.
    addPluginPostEffect(info);
};
