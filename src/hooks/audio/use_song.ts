import { getActiveBox, getActiveGame } from '../../store';
import { createBeatClock, getAudioManager, heardPositionOf } from '../../audio';
import { createStreamedPlayer } from '../../audio/streamed_player';
import { setAttachmentHandle } from '../../audio/attachment_players';
import { isShowingOnly } from '../physics/is_showing_only';
import { SONG_VOICES } from '../../audio/synth';
import { createSongStream } from '../../audio/synth/song_stream';
import { nanoId } from '../../utils';
import { clampPan } from '../../audio/stereo';
import { whenLoaded } from '../../loaders';
import { getVersion } from '../../store/record_version';
import { loadSongSamples, missingSongSamples, songFileOf } from '../../loaders/song';
import type { TSongAccompaniment, TSongAttachment, TSongHandle, TSongOptions } from '../../audio';
import type { TSongStream } from '../../audio/synth/song_stream';
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
 * The song is turned into sound here, in the game, as it plays: a moment ahead of what is heard, one
 * voice of an 8-bit console at a time, the way the console played it. So a whole tune weighs a few
 * kilobytes instead of megabytes, starts at once and holds almost nothing while it plays, and what a
 * recording cannot do, this can: it can **speed up** for the last inning, **change key** to build
 * tension and come back, and **drop a voice** without a file per voice. Each change is heard at
 * once, carrying on from the beat it was on.
 *
 * The file says where the loop goes back to, so a song can have an intro that plays once. It is in
 * the channel `'music'` unless it says otherwise, and it stops with the scene or the object that
 * asked for it.
 *
 * A song can be sung over: `accompany(vocal, song)` from `nacatamalon/speech` hands it here with a
 * vocal part, which is made with it as it plays, in a voice of its own (`vocal`), at its tempo and in
 * its key.
 *
 * A song laid out in a scene document (a `song` component, chosen in an editor) is made by this same
 * hook; a behaviour gets its controls with `soundOf(box, name)`. In a scene shown rather than played
 * (an editor's viewport), `autoplay` waits for the game to play.
 *
 * @param song A song from `useLoadSong`, a `TSongDoc` written in code, or either with a vocal part
 * over it, from `accompany`.
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
export const useSong = (song: TSongFile | TSongDoc | TSongAccompaniment, options: TSongOptions = {}): TSongHandle => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw new Error('[NacatamalOn] useSong: call it inside a scene body.');
    }
    const audio = getAudioManager(store);
    const id = options.id ?? nanoId();
    const accompaniment = 'type' in song && song.type === 'song-accompaniment' ? song : null;
    const under = accompaniment?.song ?? (song as TSongFile | TSongDoc);
    const file = 'type' in under && under.type === 'song-file' ? under : songFileOf(under as TSongDoc, `song:${id}`);

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

    let errors: TSongError[] = [];
    /**
     * The tempo its sound is being made at, to carry a change on from the same beat.
     */
    let madeAt = 0;
    /**
     * Which version of the file its sound is being made from: a newer one is the file changed (saved
     * again in the editor), and is made again from the same beat.
     */
    let madeFrom = -1;
    /**
     * Whether it has been made into sound at all yet: nothing is, until its file is in.
     */
    let made = false;

    const tempoNow = (): number => attachment.tempo ?? file.doc?.tempo ?? 120;

    /**
     * Where a voice is heard: as it was set here, or as its file puts it.
     */
    const panOf = (voice: TSongVoiceName): number => attachment.pan[voice] ?? file.doc?.voices[voice]?.pan ?? 0;

    const player = createStreamedPlayer(audio, {
        volume: () => attachment.volume,
        channel: attachment.channel,
        voiceVolume: (voice) => attachment.voices[voice as TSongVoiceName] ?? 1,
        voicePan: (voice) => panOf(voice as TSongVoiceName),
    });

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
     * The song, ready to be made into sound as it plays, at the tempo and in the key asked for now.
     * Said once if the notes have mistakes: what can be read is still played.
     */
    const make = (): TSongStream | null => {
        const doc = file.doc;
        if (doc === null) {
            return null;
        }
        const played = createSongStream({ ...doc, tempo: tempoNow() }, audio.context.sampleRate, { transpose: attachment.transpose, samples: file.samples });
        const stream = accompaniment === null ? played : accompaniment.over(played, { tempo: tempoNow(), transpose: attachment.transpose });
        if (errors.length === 0 && stream.errors.length > 0) {
            const first = stream.errors[0]!;
            console.warn(
                `[NacatamalOn] useSong: '${file.src}' has ${stream.errors.length} mistake(s) in its notes, played without them. ` +
                `The first, in ${first.voice} at ${first.line}:${first.column}: ${first.message}`,
            );
        }
        errors = stream.errors;
        madeAt = tempoNow();
        madeFrom = getVersion(file);
        made = true;
        return stream;
    };

    /**
     * Goes on with the song made again (at a new tempo, in a new key, or from the file changed) from
     * the same beat, which at a new tempo is a new number of seconds.
     */
    const remake = (): void => {
        const oldTempo = madeAt;
        const stream = make();
        if (stream !== null) {
            player.replace(stream, (seconds) => seconds * (oldTempo / madeAt));
        }
    };

    // The beat heard, not the one played: it comes as late as the sound does.
    const beats = createBeatClock(audio, () => (file.doc === null ? null : {
        position: player.position(audio.heardDelay()),
        secondsPerBeat: 60 / madeAt,
        firstBeat: 0,
        beatsPerBar: file.doc.meter[0],
    }));

    const heard = heardPositionOf(audio, player.position);

    const handle: TSongHandle = {
        play: (play) => {
            player.stop(0);
            const stream = make();
            if (stream !== null) {
                player.start(stream, 0, play?.fade ?? 0);
            }
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
            player.setLayer(voice, volume, fade);
        },
        getVoice: (voice) => attachment.voices[voice] ?? 1,
        setPan: (voice, next, fade = 0) => {
            attachment.pan[voice] = clampPan(next);
            player.setLayerPan(voice, attachment.pan[voice]!, fade);
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
        // In beats of the tempo its sound is made at, which is the tempo `position` is counted in.
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
    void whenLoaded(file).then(() => accompaniment?.ready()).then(() => loadSongSamples(store, file)).then(() => {
        if (box.destroyed || file.status !== 'ready') {
            return;
        }
        if (!made) {
            // Read once now, so what its notes get wrong is said when it arrives, not when it plays.
            make();
        }
        if (attachment.autoplay && !showingOnly) {
            handle.play();
        }
    });

    // The file changed after its sound began to be made: made again, carrying on from the same beat,
    // once any sample it names now is in.
    let fetchingFor = -1;
    box.updateCallbacks.push(() => {
        const version = getVersion(file);
        if (!made || file.status !== 'ready' || version === madeFrom || version === fetchingFor) {
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
