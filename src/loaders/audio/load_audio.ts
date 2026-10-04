import { bumpVersion } from '../../store/record_version';
import type { TRuntimeStore } from '../../store';
import type { TAudioClip } from './types/t_audio_clip';

/**
 * Fetches and decodes `clip.src`, filling the record in place as it goes.
 *
 * Never rejects. A missing file or one the browser cannot decode ends as `'error'` with a warning,
 * because one bad sound must not take the scene down: everything else keeps playing and that clip
 * is silent.
 *
 * Decoding needs the game's audio engine, so this is where a game that loads a sound opens one. The
 * `store` is the game that asked, captured when the hook ran: by the time the file arrives the scene
 * body is long over. If that game has been destroyed in the meantime, nothing is decoded.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const loadAudio = (store: TRuntimeStore, clip: TAudioClip, decode: (data: ArrayBuffer) => Promise<AudioBuffer>): Promise<void> =>
    fetch(clip.src)
        .then((response) => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.arrayBuffer();
        })
        .then((data) => {
            if (store.get('loop').destroyed) {
                return null;
            }
            return decode(data);
        })
        .then((buffer) => {
            if (buffer === null) {
                return;
            }
            clip.buffer = buffer;
            clip.duration = buffer.duration;
            clip.status = 'ready';
            bumpVersion(clip);
        })
        .catch((error: unknown) => {
            clip.status = 'error';
            bumpVersion(clip);
            console.warn(`[NacatamalOn] useLoadAudio: '${clip.src}' could not be loaded. Playing it does nothing.`, error);
        });
