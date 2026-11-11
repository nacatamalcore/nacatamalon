import { getColor } from '../color';
import { DEFAULT_GAME_OPTIONS } from '../DEFAULTS';
import type { TProjectSettings } from './types/t_project_settings';

/**
 * What a project says about what its file leaves out: what `createGame` does when it is not told, so
 * a game reads the same from a file as from code.
 *
 * Not what a new project looks like. An editor starts one from a template, whose `project.json` says
 * its own frame: that is where a retro size belongs, written where it can be seen and changed.
 *
 * **For editors and other tools.** A game written only in code does not need it: it passes its
 * options straight to `createGame`. This exists so a tool can save those options as a file and a
 * game made with that tool can read them back.
 *
 * @category Project
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const DEFAULT_PROJECT_SETTINGS: TProjectSettings = {
    format: 'nacatamalon-project',
    version: 1,
    name: 'Untitled',
    width: DEFAULT_GAME_OPTIONS.width!,
    height: DEFAULT_GAME_OPTIONS.height!,
    background: getColor(DEFAULT_GAME_OPTIONS.background!),
    smooth: DEFAULT_GAME_OPTIONS.smooth!,
    msaa: DEFAULT_GAME_OPTIONS.msaa!,
    renderer: DEFAULT_GAME_OPTIONS.renderer!,
    scaling: DEFAULT_GAME_OPTIONS.scaling!,
    keep: DEFAULT_GAME_OPTIONS.keep!,
    fullscreenScaling: DEFAULT_GAME_OPTIONS.fullscreenScaling!,
    pixelRatio: DEFAULT_GAME_OPTIONS.pixelRatio!,
    pauseOnBlur: DEFAULT_GAME_OPTIONS.pauseOnBlur!,
    contextMenu: DEFAULT_GAME_OPTIONS.contextMenu!,
    banner: DEFAULT_GAME_OPTIONS.banner!,
    splash: DEFAULT_GAME_OPTIONS.splash!,
    step: DEFAULT_GAME_OPTIONS.step!,
    mainScene: '',
    actions: [...DEFAULT_GAME_OPTIONS.actions!],
    physicsLayers: [],
    actionsPersist: 'none',
    post: [],
};
