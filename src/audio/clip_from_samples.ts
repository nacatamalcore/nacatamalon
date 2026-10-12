import { markWatchable } from '../store/record_version';
import type { TAudioClip } from '../loaders/audio/types/t_audio_clip';
import type { TAudioManager } from './types/t_audio';

/**
 * A sound made in code, as a clip the audio engine plays like any loaded one. Its `src` is empty:
 * there is no file a saved scene could name.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const clipFromSamples = (audio: TAudioManager, samples: Float32Array, sampleRate: number, key: string): TAudioClip => {
    const buffer = audio.context.createBuffer(1, Math.max(1, samples.length), sampleRate);
    buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
    return markWatchable<TAudioClip>({ type: 'audio', key, src: '', duration: samples.length / sampleRate, status: 'ready', buffer });
};
