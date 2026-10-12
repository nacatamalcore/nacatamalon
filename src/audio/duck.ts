import { rampTo } from './ramp';
import type { TAudioManager } from './types/t_audio';

/**
 * How long a channel takes to go down when the sound holding it does not say.
 */
export const DEFAULT_DUCK_FADE = 0.15;

/**
 * Sets every channel's second volume to what the sounds playing right now ask of it: the quietest
 * any of them wants, or untouched when none holds it down.
 *
 * Worked out from the voices sounding, never kept as a rule somebody has to take back. A sound that
 * ends, is stopped, or leaves with its object stops being a voice, and on the next call its channel
 * comes back up on its own. A ramp is only asked for when where a channel is headed changes, so this
 * can run every frame.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const applyDucking = (audio: TAudioManager): void => {
    const wanted = new Map<string, { to: number; fade: number; release: number }>();
    for (const voice of audio.voices) {
        const duck = voice.from?.duck ?? null;
        if (duck === null) {
            continue;
        }
        const to = Math.min(1, Math.max(0, duck.to));
        const current = wanted.get(duck.channel);
        if (current === undefined || to < current.to) {
            const fade = duck.fade ?? DEFAULT_DUCK_FADE;
            wanted.set(duck.channel, { to, fade, release: duck.release ?? fade });
        }
    }

    const now = audio.context.currentTime;
    for (const [channel, held] of wanted) {
        const before = audio.duckTargets.get(channel);
        if (before === undefined || before.to !== held.to) {
            rampTo(audio.duckGain(channel).gain, held.to, now, held.fade);
        }
        // The release kept is the one of whoever holds it down now, which is who lets it go.
        audio.duckTargets.set(channel, { to: held.to, release: held.release });
    }
    for (const [channel, held] of [...audio.duckTargets]) {
        if (wanted.has(channel)) {
            continue;
        }
        rampTo(audio.duckGain(channel).gain, 1, now, held.release);
        audio.duckTargets.delete(channel);
    }
};
