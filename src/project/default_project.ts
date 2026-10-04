import { getColor } from '../color';
import type { TProjectSettings } from './types/t_project_settings';

/**
 * What a project says before anyone has changed anything: a Mega Drive frame (320 by 224), crisp
 * pixels, no anti-aliasing.
 *
 * A retro default rather than a neutral one, on purpose: a blank 640 by 480 would quietly push every
 * new project out of the era this engine is for.
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
    width: 320,
    height: 224,
    background: getColor('#0f1119'),
    smooth: false,
    msaa: 1,
    renderer: 'AUTO',
    scaling: 'contain',
    keep: 'both',
    pixelRatio: 1,
    pauseOnBlur: true,
    mainScene: '',
    actions: [],
    actionsPersist: 'none',
    post: [],
};
