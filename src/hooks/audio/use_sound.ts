import { getActiveBox, getActiveGame } from '../../store';
import { DEFAULT_CHANNEL, getAudioManager, placeVoice, rampTo } from '../../audio';
import { nanoId } from '../../utils';
import { whenLoaded } from '../../loaders';
import { useLoadAudio } from '../loaders/use_load_audio';
import type { TAudioClip } from '../../loaders';
import type { TAudioManager, TSoundAttachment, TSoundHandle, TSoundOptions, TSoundSource, TVoice } from '../../audio';

/**
 * One sounding voice plus what `pause` needs to start it again where it stopped. A sound node can
 * only be played once and cannot be paused, so pausing really means stopping it and remembering how
 * far in it was.
 */
type TPlaying = {
    voice: TVoice;
    /**
     * When it started, on the audio engine's clock.
     */
    startedAt: number;
    /**
     * How far into the sound it was when it started.
     */
    offset: number;
    paused: boolean;
};

/**
 * A clip, whether it was loaded beforehand or asked for right here.
 */
const resolveSource = (source: TSoundSource): TAudioClip => ('status' in source ? source : useLoadAudio(source));

/**
 * Plays a sound, and hands back the controls for it.
 *
 * Called in the body of a scene, like every hook; the controls are used whenever, from an update, a
 * click, a signal. When the scene stops or the object that asked for it is destroyed, its sound
 * stops: a level's music does not survive the level.
 *
 * A one-off (the default) can sound on top of itself, which is what effects need: two coins picked
 * up at once are heard twice. A looping sound is a single thing that `pause`, `resume` and `stop`
 * act on: music, rain, an engine.
 *
 * With `spatial` it is heard from where the object that asked for it is, and follows it; with `zone`
 * it fills an area around the object instead, the way birds fill a meadow. Starting and stopping
 * can fade, and so can the volume.
 *
 * Pausing the game or the scene does **not** stop a sound, because a menu over a frozen level often
 * wants the music to carry on. To silence something on pause, listen to `scenePaused`/`gamePaused`
 * and decide for each sound.
 *
 * @param source A clip from `useLoadAudio`, or `{ src }` to load it here.
 * @param options Volume, looping, speed, channel, and placing it in the world: at a point, facing a
 * way, or filling an area.
 *
 * @example
 * ```ts
 * export const Level: TSceneFn = () => {
 *     const music = useSound({ src: '/audio/theme.mp3' }, { channel: 'music', loop: true, autoplay: true });
 *     const jump = useSound({ src: '/audio/jump.mp3' }, { volume: 0.6 });
 *     const keys = useKeyboard();
 *
 *     useUpdate(() => {
 *         if (keys.justPressed('Space')) jump.play();
 *     });
 *
 *     useSignal(scenePaused, () => music.setVolume(0.2));
 *     return createScene();
 * };
 * ```
 *
 * @returns Its controls: `play`, `pause`, `resume`, `stop`, `setVolume`, `setLoop` and `setRate`.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useSound = (source: TSoundSource, options: TSoundOptions = {}): TSoundHandle => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw new Error('[NacatamalOn] useSound: call it inside a scene body.');
    }

    const clip = resolveSource(source);
    const audio: TAudioManager = getAudioManager(store);
    const channel = options.channel ?? DEFAULT_CHANNEL;

    let volume = options.volume ?? 1;
    let loop = options.loop ?? false;
    let rate = options.rate ?? 1;

    // What this object carries, which is what a list of it, an editor and a saved scene all read.
    // Written before a single note can be played, so a clip that never arrives is still an
    // attachment somebody can see and fix.
    const attachment: TSoundAttachment = {
        type: 'sound',
        id: options.id ?? nanoId(),
        clip,
        volume,
        loop,
        rate,
        channel,
        autoplay: options.autoplay ?? false,
        spatial: options.spatial ?? false,
        refDistance: options.refDistance ?? null,
        maxDistance: options.maxDistance ?? null,
        cone: options.cone ?? null,
        zone: options.zone ?? null,
    };
    box.sounds.push(attachment);

    /**
     * Everything this handle has started and not forgotten yet.
     */
    let playing: TPlaying[] = [];

    const forget = (entry: TPlaying): void => {
        playing = playing.filter((existing) => existing !== entry);
        audio.voices.delete(entry.voice);
    };

    /**
     * Wires one voice and starts it: sound, then the placing if it has one, then its own volume, then
     * the channel's, then the master. Every step is a knob something else can turn later.
     */
    const start = (offset: number, fade = 0): void => {
        if (clip.status !== 'ready' || clip.buffer === null) {
            return;
        }

        const node = audio.context.createBufferSource();
        node.buffer = clip.buffer;
        node.loop = loop;
        node.playbackRate.value = rate;

        const gain = audio.context.createGain();
        gain.gain.value = volume;
        gain.connect(audio.channelGain(channel));
        if (fade > 0) {
            gain.gain.value = 0;
            rampTo(gain.gain, volume, audio.context.currentTime, fade);
        }

        // An area wins over a point: a sound is heard from one place or all around, never both.
        const zoned = attachment.zone !== null;
        let panner: PannerNode | null = null;
        let area: GainNode | null = null;
        if (zoned) {
            area = audio.context.createGain();
            node.connect(area);
            area.connect(gain);
        } else if (attachment.spatial) {
            panner = audio.context.createPanner();
            // Quieter with distance, measured the way its scene measures, and in a straight line
            // down to silence at the far distance: the way the games of the era did it, and the
            // only way "past here it is not heard" can be true. The browser's natural curve never
            // reaches silence. The distances are set when it is placed, just below.
            panner.distanceModel = 'linear';
            node.connect(panner);
            panner.connect(gain);
        } else {
            node.connect(gain);
        }

        const placed = zoned || attachment.spatial;
        const voice: TVoice = {
            node,
            gain,
            channel,
            panner,
            area,
            box: placed ? box : null,
            sound: placed ? attachment : null,
        };
        placeVoice(store, audio, voice);
        const entry: TPlaying = { voice, startedAt: audio.context.currentTime, offset, paused: false };

        // A one-off clears itself up when it finishes; a looping one never finishes on its own.
        node.onended = () => {
            if (!entry.paused) {
                forget(entry);
            }
        };

        audio.voices.add(voice);
        playing.push(entry);
        node.start(0, offset);
    };

    const stopVoice = (entry: TPlaying): void => {
        entry.voice.node.onended = null;
        try { entry.voice.node.stop(); } catch { /* never started */ }
        entry.voice.node.disconnect();
        forget(entry);
    };

    const stop = (fade = 0): void => {
        if (fade <= 0) {
            for (const entry of [...playing]) {
                stopVoice(entry);
            }
            return;
        }
        // Faded out and then stopped by the browser, which clears it up the way it clears up a
        // one-off that ran out. A paused one is silent already, so it just goes.
        const now = audio.context.currentTime;
        for (const entry of [...playing]) {
            if (entry.paused) {
                forget(entry);
                continue;
            }
            rampTo(entry.voice.gain.gain, 0, now, fade);
            entry.voice.node.stop(now + fade);
        }
    };

    const handle: TSoundHandle = {
        play: (play) => {
            // A looping sound is one thing, not a choir of itself.
            if (loop) {
                stop();
            }
            start(0, play?.fade ?? 0);
        },
        stop: (fading) => stop(fading?.fade ?? 0),
        pause: () => {
            for (const entry of [...playing]) {
                if (entry.paused) {
                    continue;
                }
                // Where it had got to: a sound node cannot be paused, so it is stopped and started
                // again from here.
                const played = (audio.context.currentTime - entry.startedAt) * entry.voice.node.playbackRate.value;
                const position = entry.offset + played;
                entry.offset = clip.duration > 0 && loop ? position % clip.duration : position;
                entry.paused = true;
                entry.voice.node.onended = null;
                try { entry.voice.node.stop(); } catch { /* never started */ }
                entry.voice.node.disconnect();
                audio.voices.delete(entry.voice);
            }
        },
        resume: () => {
            const paused = playing.filter((entry) => entry.paused);
            for (const entry of paused) {
                playing = playing.filter((existing) => existing !== entry);
                start(entry.offset);
            }
        },
        // The three knobs write through to what the object carries, so a scene saved after the
        // options screen turned the music down comes back turned down. Where a voice had got to
        // does not, because that is a fact about this run and not about the level.
        setVolume: (next, fade = 0) => {
            volume = next;
            attachment.volume = next;
            for (const entry of playing) {
                rampTo(entry.voice.gain.gain, next, audio.context.currentTime, fade);
            }
        },
        setLoop: (next) => {
            loop = next;
            attachment.loop = next;
            for (const entry of playing) {
                entry.voice.node.loop = next;
            }
        },
        setRate: (next) => {
            rate = next;
            attachment.rate = next;
            for (const entry of playing) {
                entry.voice.node.playbackRate.value = next;
            }
        },
        get playing() {
            return playing.some((entry) => !entry.paused);
        },
    };

    if (options.autoplay === true) {
        // The file may already be there (a loading scene did it) or be on its way: either way this
        // starts it the moment it can, and never if the file failed.
        void whenLoaded(clip).then(() => {
            if (!box.destroyed) {
                handle.play();
            }
        });
    }

    // Leaves with whatever asked for it: a scene that stops takes its music along.
    box.cleanups.push(() => stop());

    return handle;
};
