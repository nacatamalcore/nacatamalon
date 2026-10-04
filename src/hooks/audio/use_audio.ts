import { getActiveGame } from '../../store';
import { getAudioManager, rampTo } from '../../audio';
import type { TAudioHandle } from '../../audio';

/**
 * The game's volumes: the general one and one per channel, plus a way to silence everything.
 *
 * A channel is a group of sounds that share a volume. `'sfx'` and `'music'` are there from the
 * start, and any other name works the moment a sound uses it. This is what the sliders of an
 * options screen move, and the numbers a game saves in its store so they are still there next time.
 *
 * Volumes go from `0` (silent) to `1` (as recorded); above `1` is allowed and can distort.
 *
 * @example
 * ```ts
 * declare const settings: TGameStore<{ music: number }>;
 * declare const quieter: TText;
 *
 * export const Options: TSceneFn = () => {
 *     const audio = useAudio();
 *     audio.setVolume(settings.state.music, 'music');
 *
 *     listen(quieter, { onClick: () => audio.setVolume(audio.getVolume('music') - 0.1, 'music') });
 *     return createScene();
 * };
 * ```
 *
 * @returns The volumes: `setVolume`, `getVolume`, and `stopAll`.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useAudio = (): TAudioHandle => {
    const store = getActiveGame();
    if (store === null) {
        throw new Error('[NacatamalOn] useAudio: call it inside a scene body.');
    }
    const audio = getAudioManager(store);

    return {
        setVolume: (volume, channel, fade = 0) => {
            const gain = channel === undefined ? audio.master : audio.channelGain(channel);
            rampTo(gain.gain, volume, audio.context.currentTime, fade);
        },
        getVolume: (channel) => (channel === undefined ? audio.master.gain.value : audio.channelGain(channel).gain.value),
        stopAll: (channel) => {
            for (const voice of [...audio.voices]) {
                if (channel !== undefined && voice.channel !== channel) {
                    continue;
                }
                try { voice.node.stop(); } catch { /* never started */ }
                voice.node.disconnect();
                audio.voices.delete(voice);
            }
        },
    };
};
