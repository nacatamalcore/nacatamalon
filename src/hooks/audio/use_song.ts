import { getActiveBox, getActiveGame } from '../../store';
import { clipFromSamples, createBeatClock, createLayeredPlayer, getAudioManager, heardPositionOf } from '../../audio';
import { setAttachmentHandle } from '../../audio/attachment_players';
import { isShowingOnly } from '../physics/is_showing_only';
import { renderSong, SONG_VOICES } from '../../audio/synth';
import { nanoId } from '../../utils';
import { clampPan } from '../../audio/stereo';
import { wrapPosition } from '../../audio/loop_position';
import { whenLoaded } from '../../loaders';
import { getVersion } from '../../store/record_version';
import { loadSongSamples, missingSongSamples, songFileOf } from '../../loaders/song';
import type { TLayeredPiece, TMusicLayer, TSongAttachment, TSongHandle, TSongOptions } from '../../audio';
import type { TSongDoc, TSongError, TSongVoiceName } from '../../audio/synth';
import type { TSongFile } from '../../loaders/song';

/**
 * Plays **a song written as notes** (a `.song` file, or one written in code) with the engine's 8-bit
 * synthesizer, and hands back the controls.
 *
 * **What it is for:** chiptune music the game can change while it plays: faster for the last inning,
 * in another key, with a voice dropped. **Not for:** a recorded file (that is `useSound`, or
 * `useMusic` for one recorded in layers).
 *
 * It does not load the file: `useLoadSong({ src })` does, and its result is given here,
 * `useSong(useLoadSong({ src: '/music/title.song' }))`.
 *
 * The song is turned into sound here, in the game, one track per voice of an 8-bit console, and the
 * tracks play together like the layers of `useMusic`. So a whole tune weighs a few kilobytes instead
 * of megabytes, and what a recording cannot do, this can: it can **speed up** for the last inning,
 * **change key** to build tension and come back, and **drop a voice** without a file per voice. Each
 * change carries on from the beat it was on.
 *
 * The file says where the loop goes back to, so a song can have an intro that plays once. It is in
 * the channel `'music'` unless it says otherwise, and it stops with the scene or the object that
 * asked for it.
 *
 * A song laid out in a scene document (a `song` component, chosen in an editor) is made by this same
 * hook; a behaviour gets its controls with `soundOf(box, name)`. In a scene shown rather than played
 * (an editor's viewport), `autoplay` waits for the game to play.
 *
 * @param song A song from `useLoadSong`, or a `TSongDoc` written in code.
 * @param options Its volume, channel, each voice's volume, tempo and key, and whether it starts on
 * its own.
 * @returns The controls: play, stop and pause it, move a voice, the tempo and the key, and follow
 * its beat.
 *
 * @example
 * ```ts
 * declare const crowd: TSprite;
 * declare const lastInning: TGameSignal;
 *
 * const Ballpark = () => {
 *     const song = useSong(useLoadSong({ src: '/music/minuet.song' }), { autoplay: true });
 *
 *     song.onBeat((beat) => {
 *         crowd.transform.y = beat === 1 ? 118 : 120;
 *     });
 *     useSignal(lastInning, () => song.setTempo(song.tempo * 1.2));
 *     return createScene();
 * };
 * ```
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useSong = (song: TSongFile | TSongDoc, options: TSongOptions = {}): TSongHandle => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw new Error('[NacatamalOn] useSong: call it inside a scene body.');
    }
    const audio = getAudioManager(store);
    const id = options.id ?? nanoId();
    const file = 'type' in song && song.type === 'song-file' ? song : songFileOf(song as TSongDoc, `song:${id}`);

    const attachment: TSongAttachment = {
        type: 'song',
        id,
        file,
        volume: options.volume ?? 1,
        channel: options.channel ?? 'music',
        autoplay: options.autoplay ?? false,
        voices: { ...options.voices },
        pan: { ...options.pan },
        tempo: options.tempo ?? null,
        transpose: options.transpose ?? 0,
    };
    box.sounds.push(attachment);

    const piece: TLayeredPiece = {
        layers: [],
        get volume() { return attachment.volume; },
        channel: attachment.channel,
        loopStart: 0,
        loopEnd: 0,
    };
    const player = createLayeredPlayer(audio, piece);
    let errors: TSongError[] = [];
    /**
     * The tempo the tracks were last made at, to carry a change on from the same beat.
     */
    let madeAt = 0;
    /**
     * Which version of the file the tracks were made from: a newer one is the file changed (saved
     * again in the editor), and is made again from the same beat.
     */
    let madeFrom = -1;

    const tempoNow = (): number => attachment.tempo ?? file.doc?.tempo ?? 120;

    /**
     * Where a voice is heard: as it was set here, or as its file puts it.
     */
    const panOf = (voice: TSongVoiceName): number => attachment.pan[voice] ?? file.doc?.voices[voice]?.pan ?? 0;

    /**
     * Each voice's place between left and right, to read and to write, so a tween can move it.
     */
    const pan = {} as Record<TSongVoiceName, number>;
    for (const voice of SONG_VOICES) {
        Object.defineProperty(pan, voice, {
            enumerable: true,
            get: () => panOf(voice),
            set: (next: number) => handle.setPan(voice, next),
        });
    }

    /**
     * Turns the song into tracks at the tempo and key asked for now. Said once if the notes have
     * mistakes: what can be read is still played.
     */
    const make = (): boolean => {
        const doc = file.doc;
        if (doc === null) {
            return false;
        }
        const sampleRate = audio.context.sampleRate;
        const rendered = renderSong({ ...doc, tempo: tempoNow() }, sampleRate, { transpose: attachment.transpose, samples: file.samples });
        if (errors.length === 0 && rendered.errors.length > 0) {
            const first = rendered.errors[0]!;
            console.warn(
                `[NacatamalOn] useSong: '${file.src}' has ${rendered.errors.length} mistake(s) in its notes, played without them. ` +
                `The first, in ${first.voice} at ${first.line}:${first.column}: ${first.message}`,
            );
        }
        errors = rendered.errors;
        piece.layers = SONG_VOICES.flatMap((voice): TMusicLayer[] => {
            const track = rendered.voices[voice];
            return track === undefined ? [] : [{ name: voice, clip: clipFromSamples(audio, track, sampleRate, `${file.key}#${voice}`), volume: attachment.voices[voice] ?? 1, pan: panOf(voice) }];
        });
        // The SNES's echo plays beside its voices, a track of its own.
        if (rendered.echo !== undefined) {
            piece.layers.push({ name: 'echo', clip: clipFromSamples(audio, rendered.echo, sampleRate, `${file.key}#echo`), volume: 1 });
        }
        piece.loopStart = rendered.loopStart;
        madeAt = tempoNow();
        madeFrom = getVersion(file);
        return true;
    };

    /**
     * Makes the tracks again and carries on from the same beat, which at a new tempo is a new
     * number of seconds.
     */
    const remake = (): void => {
        const before = player.position();
        const askedAt = audio.now();
        const oldTempo = madeAt;
        // The old tracks, which go on sounding while the new ones are made.
        const { loopStart, loopEnd } = piece;
        const duration = piece.layers[0]?.clip.duration ?? 0;
        if (!make() || before === null) {
            return;
        }
        // Where it is now, not where it was when asked: making the tracks takes a while, and the old
        // ones played on meanwhile. Starting from `before` would hear that while twice.
        const now = wrapPosition(before + (audio.now() - askedAt), duration, loopStart, loopEnd);
        player.restart(now * (oldTempo / tempoNow()));
    };

    // The beat heard, not the one played: it comes as late as the sound does.
    const beats = createBeatClock(audio, () => (file.doc === null ? null : {
        position: player.position(audio.heardDelay()),
        secondsPerBeat: 60 / madeAt,
        firstBeat: 0,
        beatsPerBar: file.doc.meter[0],
    }));

    const heard = heardPositionOf(audio, player.position);

    const layerOf = (voice: TSongVoiceName): TMusicLayer | undefined => piece.layers.find((layer) => layer.name === voice);

    const handle: TSongHandle = {
        play: (play) => {
            player.stop(0);
            if (piece.layers.length === 0) {
                make();
            }
            player.start(0, play?.fade ?? 0);
        },
        stop: (fading) => player.stop(fading?.fade ?? 0),
        pause: () => player.pause(),
        resume: () => player.resume(),
        // Every knob writes through to what the object carries, so a scene saved after the song
        // changed comes back changed.
        setVolume: (volume, fade = 0) => {
            attachment.volume = volume;
            player.setVolume(volume, fade);
        },
        setVoice: (voice, volume, fade = 0) => {
            attachment.voices[voice] = volume;
            const layer = layerOf(voice);
            if (layer !== undefined) {
                layer.volume = volume;
                player.setLayer(layer, volume, fade);
            }
        },
        getVoice: (voice) => attachment.voices[voice] ?? 1,
        setPan: (voice, next, fade = 0) => {
            attachment.pan[voice] = clampPan(next);
            const layer = layerOf(voice);
            if (layer !== undefined) {
                player.setLayerPan(layer, attachment.pan[voice]!, fade);
            }
        },
        pan,
        setTempo: (bpm) => {
            if (!(bpm > 0) || bpm === tempoNow()) {
                return;
            }
            attachment.tempo = bpm;
            remake();
        },
        setTranspose: (semitones) => {
            if (semitones === attachment.transpose) {
                return;
            }
            attachment.transpose = semitones;
            remake();
        },
        get tempo() {
            return tempoNow();
        },
        get position() {
            return heard.now();
        },
        // In beats of the tempo its sound was made at, which is the tempo `position` is counted in.
        get beat() {
            const at = heard.now();
            return at === null ? null : at / (60 / madeAt);
        },
        get latency() {
            return audio.heardDelay();
        },
        positionAt: (moment) => heard.at(moment),
        onBeat: (listener) => beats.on(listener),
        get errors() {
            return errors;
        },
        get playing() {
            return player.playing;
        },
    };

    // A scene shown rather than played (an editor's viewport) keeps it quiet: it still says it starts on
    // its own, and saves so, but nothing sounds until the game plays.
    const showingOnly = isShowingOnly();
    // A song written in code fetches the samples it names here; one from a file has them already.
    void whenLoaded(file).then(() => loadSongSamples(store, file)).then(() => {
        if (box.destroyed || file.status !== 'ready') {
            return;
        }
        if (piece.layers.length === 0) {
            make();
        }
        if (attachment.autoplay && !showingOnly) {
            handle.play();
        }
    });

    // The file changed after the tracks were made: made again, carrying on from the same beat, once
    // any sample it names now is in.
    let fetchingFor = -1;
    box.updateCallbacks.push(() => {
        const version = getVersion(file);
        if (piece.layers.length === 0 || file.status !== 'ready' || version === madeFrom || version === fetchingFor) {
            return;
        }
        if (missingSongSamples(file).length === 0) {
            remake();
            return;
        }
        fetchingFor = version;
        void loadSongSamples(store, file).then(() => {
            if (!box.destroyed && getVersion(file) === version) {
                remake();
            }
        });
    });

    box.cleanups.push(() => {
        player.stop(0);
        beats.dispose();
    });

    setAttachmentHandle(attachment, handle);

    return handle;
};
