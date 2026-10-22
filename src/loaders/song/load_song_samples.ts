import { getAudioManager } from '../../audio/create_audio_manager';
import type { TRuntimeStore } from '../../store';
import type { TSongFile } from './types/t_song_file';

/**
 * The sound files a song's instruments name as their `sample` that are not read yet.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const missingSongSamples = (file: TSongFile): string[] => {
    const wanted = new Set<string>();
    for (const instrument of Object.values(file.doc?.instruments ?? {})) {
        const key = instrument.sample;
        if (key !== undefined && !key.startsWith('nacatamalon:') && !file.samples.has(key)) {
            wanted.add(key);
        }
    }
    return [...wanted];
};

/**
 * Every sound file a song's instruments name as their `sample` that is not read yet, fetched and
 * read into the song's record, each as one channel.
 *
 * Never rejects. A file that cannot be had is said once and left out, and the notes that play it
 * are silent: a missing drum costs the drum, not the song. The engine's own samples
 * (`nacatamalon:kick`) are not fetched: they are made when they are played.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const loadSongSamples = async (store: TRuntimeStore, file: TSongFile): Promise<void> => {
    const wanted = missingSongSamples(file);
    if (wanted.length === 0) {
        return;
    }
    const { context } = getAudioManager(store);
    await Promise.all(wanted.map(async (src) => {
        try {
            const response = await fetch(src);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const buffer = await context.decodeAudioData(await response.arrayBuffer());
            const samples = new Float32Array(buffer.length);
            for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
                const data = buffer.getChannelData(channel);
                for (let i = 0; i < samples.length; i += 1) {
                    samples[i]! += data[i]! / buffer.numberOfChannels;
                }
            }
            file.samples.set(src, { samples, sampleRate: buffer.sampleRate });
        } catch (error: unknown) {
            console.warn(`[NacatamalOn] useSong: the sample '${src}' of '${file.src || file.key}' could not be loaded. The notes that play it are silent.`, error);
        }
    }));
};
