import type { TAudioMeasure } from './types/t_song';

/**
 * Decibels below full scale, with silence as far down as a 16-bit file goes rather than minus
 * infinity, which no JSON can carry.
 */
const toDb = (level: number): number => (level > 0 ? Math.max(-96, 20 * Math.log10(level)) : -96);

/**
 * Measures a piece of sound: how long, how loud at its loudest and on average, and how many samples
 * hit full scale, which is where it distorts.
 *
 * For whoever cannot listen to what they made: a peak under `-1 dB` with nothing clipped is safe, and
 * an RMS far below the rest of a game's sounds is a sound nobody will hear.
 *
 * @param channels - One track, or one per channel.
 * @param sampleRate - Samples per second.
 * @returns The measures.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const analyzeAudio = (channels: Float32Array | Float32Array[], sampleRate: number): TAudioMeasure => {
    const tracks = Array.isArray(channels) ? channels : [channels];
    let peak = 0;
    let squares = 0;
    let count = 0;
    let clipped = 0;
    for (const track of tracks) {
        for (const sample of track) {
            const level = Math.abs(sample);
            if (level > peak) {
                peak = level;
            }
            if (level >= 1) {
                clipped += 1;
            }
            squares += sample * sample;
        }
        count += track.length;
    }
    const rms = count > 0 ? Math.sqrt(squares / count) : 0;
    const length = tracks.reduce((longest, track) => Math.max(longest, track.length), 0);
    return {
        duration: length / sampleRate,
        peak,
        peakDb: toDb(peak),
        rms,
        rmsDb: toDb(rms),
        clipped,
    };
};
