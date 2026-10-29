import { getActiveBox, getActiveGame } from '../store';
import { rootOf } from '../box';
import { trackLoad } from '../loaders/track_load';
import { parseVocalDoc } from './parse_vocal_doc';
import type { TRuntimeStore } from '../store';
import type { TVocalFile } from './types/t_vocal';
import { outsideSceneBody } from '../utils/outside_scene_body';

/**
 * What `useLoadVocal` takes.
 *
 * @category Speech
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TUseLoadVocalOptions = {
    /**
     * Where the `.vocal` file is.
     */
    src: string;
    /**
     * What to keep it under, so another scene can reach the same one. Defaults to `src`.
     */
    key?: string;
};

/**
 * The parts loaded in each game, by key: a game's own, gone with it.
 */
const loaded = new WeakMap<TRuntimeStore, Map<string, TVocalFile>>();

const loadVocal = async (store: TRuntimeStore, file: TVocalFile): Promise<void> => {
    try {
        const response = await fetch(file.src);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const doc = parseVocalDoc(await response.json(), file.src);
        if (store.get('loop').destroyed) {
            return;
        }
        file.doc = doc;
        file.status = 'ready';
    } catch (error: unknown) {
        file.status = 'error';
        console.warn(`[NacatamalOn] useLoadVocal: '${file.src}' could not be loaded. A song it is sung over plays without it.`, error);
    }
};

/**
 * Loads a `.vocal` file: a vocal part, the notes and words of a song's voice, to sing over a song
 * with `accompany`.
 *
 * It hands the file back at once and fills it in when it arrives, like every loader; it counts in
 * the scene's loading (`useLoader`), and `accompany` waits for it before the song plays. Asked for
 * again, in this scene or another, it is the same file and is not fetched again.
 *
 * @param options - Where the file is, and what to keep it under.
 * @returns The file: `doc` is the part once `status` is `'ready'`.
 *
 * @example
 * ```ts
 * import { createScene, useLoadSong, useSong } from 'nacatamalon';
 * import { accompany, useLoadVocal } from 'nacatamalon/speech';
 *
 * const Title = () => {
 *     const vocal = useLoadVocal({ src: '/music/title.vocal' });
 *     useSong(accompany(vocal, useLoadSong({ src: '/music/title.song' })), { autoplay: true });
 *     return createScene();
 * };
 * ```
 *
 * @category Speech
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useLoadVocal = ({ src, key }: TUseLoadVocalOptions): TVocalFile => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw outsideSceneBody('useLoadVocal');
    }

    const cacheKey = key ?? src;
    let files = loaded.get(store);
    if (files === undefined) {
        files = new Map();
        loaded.set(store, files);
    }
    let file = files.get(cacheKey);
    if (file === undefined) {
        file = { type: 'vocal-file', src, key: cacheKey, status: 'loading', doc: null };
        files.set(cacheKey, file);
        trackLoad(file, loadVocal(store, file));
    }

    const { loads } = rootOf(box);
    if (!loads.includes(file)) {
        loads.push(file);
    }

    return file;
};
