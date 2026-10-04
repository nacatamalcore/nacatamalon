import { normalizeActionMap } from '../input';
import { normalizePostChain } from '../post/post_chain';
import { asBoolean, asColor, asInt, asOneOf } from '../utils';
import { DEFAULT_PROJECT_SETTINGS } from './default_project';
import type { TProjectSettings } from './types/t_project_settings';

/**
 * The known formats, so a file from somewhere else is caught rather than half read.
 */
const FORMAT = 'nacatamalon-project';

/**
 * The tag the editor wrote before its settings and the engine's became one type. The same format
 * under an older name, so such a file is read as it is and comes back out with `FORMAT`.
 */
const EDITOR_FORMAT = 'nacatamal-project';

/**
 * Reads a `project.json`, whatever state it is in.
 *
 * Total and never throws: a field that is missing, of the wrong shape or plain nonsense falls back
 * to the default, and the game still runs. A project file is written by tools and edited by hand, so
 * treating it as a promise would mean a typo takes the whole game down.
 *
 * What it does say out loud is a file that is not a project of this engine at all, or one written by
 * a newer version: those are warned about once, because carrying on quietly there would look like
 * the settings simply being ignored.
 *
 * **For editors and other tools.** A game written only in code does not need it: it passes its
 * options straight to `createGame`. This exists so a tool can save those options as a file and a
 * game made with that tool can read them back.
 *
 * @param value Whatever `JSON.parse` gave back.
 * @returns The settings, always: whatever could not be read falls back to its default.
 *
 * @category Project
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const parseProject = (value: unknown): TProjectSettings => {
    if (typeof value !== 'object' || value === null) {
        console.warn('[NacatamalOn] parseProject: that is not a project file. Starting from the defaults.');
        return { ...DEFAULT_PROJECT_SETTINGS };
    }

    const raw = value as Record<string, unknown>;
    if (raw.format !== undefined && raw.format !== FORMAT && raw.format !== EDITOR_FORMAT) {
        console.warn(`[NacatamalOn] parseProject: '${String(raw.format)}' is not a project of this engine. Starting from the defaults.`);
        return { ...DEFAULT_PROJECT_SETTINGS };
    }
    if (typeof raw.version === 'number' && raw.version > DEFAULT_PROJECT_SETTINGS.version) {
        console.warn(`[NacatamalOn] parseProject: this project was written by a newer version (${raw.version}). Anything unknown in it is ignored.`);
    }

    return {
        format: FORMAT,
        version: DEFAULT_PROJECT_SETTINGS.version,
        // A blank name is no name: a card or a window title showing nothing reads as a bug.
        name: typeof raw.name === 'string' && raw.name.trim() !== '' ? raw.name : DEFAULT_PROJECT_SETTINGS.name,
        width: asInt(raw.width, DEFAULT_PROJECT_SETTINGS.width, 1, 16384),
        height: asInt(raw.height, DEFAULT_PROJECT_SETTINGS.height, 1, 16384),
        background: asColor(raw.background, DEFAULT_PROJECT_SETTINGS.background),
        smooth: asBoolean(raw.smooth, DEFAULT_PROJECT_SETTINGS.smooth),
        msaa: asOneOf(String(raw.msaa), ['1', '4'], '1') === '4' ? 4 : 1,
        renderer: asOneOf(raw.renderer, ['AUTO', 'WEBGPU', 'WEBGL2'] as const, DEFAULT_PROJECT_SETTINGS.renderer),
        scaling: asOneOf(raw.scaling, ['none', 'integer', 'contain', 'fill'] as const, DEFAULT_PROJECT_SETTINGS.scaling),
        keep: asOneOf(raw.keep, ['both', 'height', 'width', 'none'] as const, DEFAULT_PROJECT_SETTINGS.keep),
        // `createGame` throws on a ratio that cannot draw; a file falls back instead, like every
        // other field here.
        pixelRatio: raw.pixelRatio === 'device' || (typeof raw.pixelRatio === 'number' && Number.isFinite(raw.pixelRatio) && raw.pixelRatio > 0)
            ? raw.pixelRatio
            : DEFAULT_PROJECT_SETTINGS.pixelRatio,
        pauseOnBlur: asBoolean(raw.pauseOnBlur, DEFAULT_PROJECT_SETTINGS.pauseOnBlur),
        seed: typeof raw.seed === 'number' && Number.isFinite(raw.seed) ? raw.seed : undefined,
        mainScene: typeof raw.mainScene === 'string' ? raw.mainScene : DEFAULT_PROJECT_SETTINGS.mainScene,
        actions: normalizeActionMap(raw.actions),
        actionsPersist: asOneOf(raw.actionsPersist, ['none', 'localStorage', 'indexedDb'] as const, DEFAULT_PROJECT_SETTINGS.actionsPersist),
        post: normalizePostChain(raw.post),
    };
};
