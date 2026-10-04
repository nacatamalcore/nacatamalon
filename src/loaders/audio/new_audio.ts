import { markWatchable } from '../../store/record_version';
import type { TAudioClip } from './types/t_audio_clip';

/**
 * A sound record that has not loaded yet: no length, no sound, `'loading'`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const newAudio = (src: string, key: string): TAudioClip => markWatchable({
    type: 'audio',
    key,
    src,
    duration: 0,
    status: 'loading',
    buffer: null,
});
