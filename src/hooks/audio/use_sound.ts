import { getActiveBox, getActiveGame } from '../../store';
import { whenReleased } from '../../scene/when_released';
import { applyDucking, clipFromSamples, DEFAULT_CHANNEL, getAudioManager, logVoice, placeVoice, rampTo, wrapPosition } from '../../audio';
import { setAttachmentHandle } from '../../audio/attachment_players';
import { isShowingOnly } from '../physics/is_showing_only';
import { renderSfx } from '../../audio/synth';
import { nanoId } from '../../utils';
import { clampPan, stereoPannerOf } from '../../audio/stereo';
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
     * When it started, on the clock the music counts by (`audio.now()`).
     */
    startedAt: number;
    /**
     * How far into the sound it was when it started.
     */
    offset: number;
    paused: boolean;
    /**
     * Stopping with a fade: going, whatever else happens to it.
     */
    fading: boolean;
    /**
     * Puts it right when an editor that ran the game a frame at a time lets it play again.
     */
    resync: () => () => void;
};

/**
 * A clip, whether it was loaded beforehand, asked for right here, made from a preset or made in code.
 */
const resolveSource = (audio: TAudioManager, source: TSoundSource): TAudioClip => {
    if ('status' in source) {
        return source;
    }
    if ('sfx' in source) {
        const sampleRate = audio.context.sampleRate;
        return clipFromSamples(audio, renderSfx(source.sfx, sampleRate), sampleRate, `sfx:${source.sfx.preset}:${source.sfx.seed ?? 1}`);
    }
    if ('samples' in source) {
        // The range every browser's audio engine takes; outside it the browser throws something
        // that does not say which sound or why.
        if (!(source.sampleRate >= 3000 && source.sampleRate <= 768000)) {
            throw new Error(`[NacatamalOn] useSound: a sampleRate of ${source.sampleRate} cannot be played. Use one from 3000 to 768000, such as 22050 or 44100.`);
        }
        return clipFromSamples(audio, source.samples, source.sampleRate, source.key ?? 'samples');
    }
    return useLoadAudio(source);
};

/**
 * Plays **one audio file** (`.wav`, `.mp3`, `.ogg`), or an effect made from a preset, and hands back
 * the controls for it.
 *
 * **What it is for:** sound effects (a jump, a coin, a bat hitting the ball), an ambience that loops
 * (rain, a crowd, an engine), and music that is a single recording. **Not for:** music in layers that
 * come in and out (that is `useMusic`), or a tune written as notes in a `.song` (that is `useSong`).
 *
 * It loads the file itself when given `{ src }`, so one line is enough:
 * `useSound({ src: '/sfx/jump.wav' })`.
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
 * wants the music to carry on. To silence something on pause, listen with `useScene().onPaused` or
 * `useGame().onPaused` and decide for each sound.
 *
 * A sound laid out in a scene document (a `sound` component, chosen in an editor) is made by this same
 * hook; a behaviour gets its controls with `soundOf(box, name)`. In a scene shown rather than played
 * (an editor's viewport), `autoplay` waits for the game to play.
 *
 * @param source A clip from `useLoadAudio`, `{ src }` to load it here, `{ sfx }` to make an
 * effect from a preset, or `{ samples, sampleRate }` for a sound worked out in code.
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
 *     useScene().onPaused(() => music.setVolume(0.2));
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

    const audio: TAudioManager = getAudioManager(store);
    const clip = resolveSource(audio, source);
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
        loopStart: options.loopStart ?? 0,
        loopEnd: options.loopEnd ?? 0,
        rate,
        pan: clampPan(options.pan ?? 0),
        channel,
        autoplay: options.autoplay ?? false,
        spatial: options.spatial ?? false,
        refDistance: options.refDistance ?? null,
        maxDistance: options.maxDistance ?? null,
        cone: options.cone ?? null,
        zone: options.zone ?? null,
        duck: options.duck ?? null,
    };
    box.sounds.push(attachment);

    /**
     * Everything this handle has started and not forgotten yet.
     */
    let playing: TPlaying[] = [];

    const forget = (entry: TPlaying): void => {
        playing = playing.filter((existing) => existing !== entry);
        audio.voices.delete(entry.voice);
        audio.resyncs.delete(entry.resync);
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
        node.loopStart = attachment.loopStart;
        node.loopEnd = attachment.loopEnd;
        node.playbackRate.value = rate;

        const gain = audio.context.createGain();
        // Faded in once it has started (below), so a log of the game's sound hears the fade.
        gain.gain.value = fade > 0 ? 0 : volume;
        // An area wins over a point: a sound is heard from one place or all around, never both.
        const zoned = attachment.zone !== null;
        // Where between left and right, when the audio engine can say it. A sound placed in space
        // comes out of its placing in stereo; any other is as many channels as its file.
        const inSpace = attachment.spatial && !zoned;
        const pans = stereoPannerOf(audio.context, attachment.pan, !inSpace && clip.buffer.numberOfChannels === 1);
        const stereo = pans?.stereo ?? null;
        if (pans !== null) {
            gain.connect(pans.input);
            pans.stereo.connect(audio.channelGain(channel));
        } else {
            gain.connect(audio.channelGain(channel));
        }

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
            stereo,
            area,
            box: placed ? box : null,
            sound: placed ? attachment : null,
            from: attachment,
        };
        placeVoice(store, audio, voice);
        // On the clock the music counts by, so where it had got to is right when an editor steps it.
        const entry: TPlaying = { voice, startedAt: audio.now(), offset, paused: false, fading: false, resync: () => () => {} };
        const position = (): number => {
            const at = entry.offset + (audio.now() - entry.startedAt) * node.playbackRate.value;
            return node.loop ? wrapPosition(at, clip.duration, attachment.loopStart, attachment.loopEnd) : at;
        };
        voice.track = { position, gains: [gain.gain] };
        // Heard again after an editor ran the game a frame at a time: from where the frames got it
        // to, or not at all if it ran out (or was fading out) meanwhile.
        entry.resync = () => {
            if (entry.paused) {
                return () => {};
            }
            const at = position();
            return () => {
                if (!playing.includes(entry)) {
                    return;
                }
                stopVoice(entry);
                if (!entry.fading && (node.loop || at < clip.duration)) {
                    start(at);
                }
            };
        };
        audio.resyncs.add(entry.resync);

        // A one-off clears itself up when it finishes; a looping one never finishes on its own.
        node.onended = () => {
            if (!entry.paused) {
                forget(entry);
            }
        };

        audio.voices.add(voice);
        playing.push(entry);
        node.start(0, offset);
        logVoice(audio, voice);
        if (fade > 0) {
            rampTo(gain.gain, volume, audio.context.currentTime, fade);
        }
        // On the same moment as the sound, not a frame later.
        applyDucking(audio);
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
            applyDucking(audio);
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
            entry.fading = true;
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
                const played = (audio.now() - entry.startedAt) * entry.voice.node.playbackRate.value;
                const position = entry.offset + played;
                entry.offset = loop ? wrapPosition(position, clip.duration, attachment.loopStart, attachment.loopEnd) : position;
                entry.paused = true;
                entry.voice.node.onended = null;
                try { entry.voice.node.stop(); } catch { /* never started */ }
                entry.voice.node.disconnect();
                audio.voices.delete(entry.voice);
            }
            applyDucking(audio);
        },
        resume: () => {
            const paused = playing.filter((entry) => entry.paused);
            for (const entry of paused) {
                playing = playing.filter((existing) => existing !== entry);
                audio.resyncs.delete(entry.resync);
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
        setPan: (next, fade = 0) => {
            attachment.pan = clampPan(next);
            for (const entry of playing) {
                if (entry.voice.stereo) rampTo(entry.voice.stereo.pan, attachment.pan, audio.context.currentTime, fade);
            }
        },
        get pan() {
            return attachment.pan;
        },
        set pan(next) {
            handle.setPan(next);
        },
        get playing() {
            return playing.some((entry) => !entry.paused);
        },
    };

    // A scene shown rather than played (an editor's viewport) keeps it quiet: it still says it starts on
    // its own, and saves so, but nothing sounds until the game plays.
    const showingOnly = isShowingOnly();
    if (options.autoplay === true && !showingOnly) {
        // The file may already be there (a loading scene did it) or be on its way: either way this
        // starts it the moment it can, and never if the file failed.
        void whenLoaded(clip).then(() => {
            if (!box.destroyed) {
                // Not under the cover of a transition: see `whenReleased`.
                whenReleased(store, box, () => handle.play());
            }
        });
    }

    // Leaves with whatever asked for it: a scene that stops takes its music along.
    box.cleanups.push(() => stop());

    setAttachmentHandle(attachment, handle);

    return handle;
};
