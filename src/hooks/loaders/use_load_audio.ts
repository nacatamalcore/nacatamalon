import { rootOf } from '../../box';
import { getActiveBox, getActiveGame } from '../../store';
import { getAudioManager } from '../../audio';
import { loadAudio, newAudio, trackLoad } from '../../loaders';
import type { TAudioClip } from '../../loaders';

/**
 * What `useLoadAudio` is asked for. Named fields rather than two bare strings, which would be too
 * easy to swap.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TUseLoadAudioOptions = {
    /**
     * Where the sound file is. Anything the browser can play: `.mp3`, `.ogg`, `.wav`.
     */
    src: string;
    /**
     * What to cache it under, so another scene can reach the same sound. Defaults to `src`.
     */
    key?: string;
};

/**
 * Loads a sound, and hands it back at once, still loading, for `useSound` to play.
 *
 * It comes back straight away, empty, and fills itself in when the file arrives. Playing it before
 * then does nothing, so nothing has to check whether it is ready. Asking twice for the same key
 * gives the same sound, already loaded: load it once in a loading scene and use it in the level.
 *
 * It can be watched with `useLoader` to show a loading bar.
 *
 * This is also what opens the game's sound, so a game that never loads or plays anything never does.
 *
 * @example
 * ```ts
 * declare const chest: TSprite;
 *
 * export const Level: TSceneFn = () => {
 *     const coin = useLoadAudio({ src: '/audio/coin.mp3', key: 'coin' });
 *     const pickup = useSound(coin);
 *     listen(chest, { onClick: () => pickup.play() });
 *     return createScene();
 * };
 * ```
 *
 * @param options - Where the file is, and the name to keep it under.
 * @returns The sound, still loading, to hand to `useSound`.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useLoadAudio = ({ src, key }: TUseLoadAudioOptions): TAudioClip => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw new Error('[NacatamalOn] useLoadAudio: call it inside a scene body.');
    }

    const cacheKey = key ?? src;
    const { sounds } = store.get('assets');

    let clip = sounds.get(cacheKey);
    if (clip === undefined) {
        clip = newAudio(src, cacheKey);
        sounds.set(cacheKey, clip);
        // Decoding is the audio engine's job, so this is the moment a game with sound opens one.
        const { context } = getAudioManager(store);
        trackLoad(clip, loadAudio(store, clip, (data) => context.decodeAudioData(data)));
    }

    // Listed on the scene even when it came from the cache: `useLoader()` counts everything the
    // scene asked for, and one already loaded counts as done.
    const { loads } = rootOf(box);
    if (!loads.includes(clip)) {
        loads.push(clip);
    }

    return clip;
};
