import type { TVoiceSettings } from './voice';
import type { TSpeechVoice } from './types/t_speech';

/**
 * A voice's settings with their defaults filled in.
 *
 * @internal
 */
export const voiceSettingsOf = (voice: TSpeechVoice): TVoiceSettings => ({
    sampleRate: voice.sampleRate ?? 22050,
    throat: voice.throat ?? 1,
    breath: Math.max(0, Math.min(1, voice.breath ?? 0.1)),
    volume: Math.max(0, Math.min(1, voice.volume ?? 0.8)),
    seed: voice.seed ?? 1,
});

/**
 * A MIDI pitch as Hz.
 *
 * @internal
 */
export const hertzOf = (pitch: number): number => 440 * 2 ** ((pitch - 69) / 12);

/**
 * A pitch track sampled every few milliseconds, as a function of time in Hz.
 *
 * @internal
 */
export const pitchTrack = (frames: Float32Array, frameLength: number): ((time: number) => number) => (time) => {
    const at = time / frameLength;
    const i = Math.min(frames.length - 1, Math.floor(at));
    const a = frames[i]!;
    const b = frames[Math.min(frames.length - 1, i + 1)]!;
    return hertzOf(a + (b - a) * (at - i));
};
