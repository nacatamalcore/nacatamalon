import { indexedDbAdapter, localStorageAdapter } from '../game_store';
import type { TGameOptions } from '../game/types/t_game_options';
import type { TProjectSettings } from './types/t_project_settings';

/**
 * Turns a project's settings into what `createGame` takes.
 *
 * The **one** place that translation happens, so that the day there is an editor with a play button
 * and an exported build, both start the game down the same path and cannot drift apart.
 *
 * `mainScene` is not part of it: which scene starts is `createGame`'s second call, not an option.
 *
 * **For editors and other tools.** A game written only in code does not need it: it passes its
 * options straight to `createGame`. This exists so a tool can save those options as a file and a
 * game made with that tool can read them back.
 *
 * @example
 * ```ts
 * declare const scenes: Record<string, TSceneFn>;
 *
 * const settings = parseProject(await (await fetch('/project.json')).json());
 * createGame('#app', gameOptionsFromProject(settings))(scenes, settings.mainScene || undefined);
 * ```
 * @param settings - The project's settings, from `parseProject`.
 * @returns What `createGame` takes.
 *
 * @category Project
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const gameOptionsFromProject = (settings: TProjectSettings): TGameOptions => ({
    width: settings.width,
    height: settings.height,
    background: settings.background,
    renderer: settings.renderer,
    seed: settings.seed,
    smooth: settings.smooth,
    msaa: settings.msaa,
    scaling: settings.scaling,
    keep: settings.keep,
    pixelRatio: settings.pixelRatio,
    pauseOnBlur: settings.pauseOnBlur,
    actions: settings.actions,
    // The project says where to keep the player's controls; the engine picks the adapter, so a
    // project file never has to name one and can be read anywhere.
    actionsPersist: settings.actionsPersist === 'none'
        ? undefined
        : { adapter: settings.actionsPersist === 'localStorage' ? localStorageAdapter() : indexedDbAdapter('nacatamalon') },
    post: settings.post,
});
