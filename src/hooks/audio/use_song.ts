import { getActiveBox, getActiveGame } from '../../store';
import { clipFromSamples, createBeatClock, createLayeredPlayer, getAudioManager } from '../../audio';
import { setAttachmentPlayer } from '../../audio/attachment_players';
import { renderSong, SONG_VOICES } from '../../audio/synth';
import { nanoId } from '../../utils';
import { whenLoaded } from '../../loaders';
import { getVersion } from '../../store/record_version';
import { songFileOf } from '../../loaders/song';
import type { TLayeredPiece, TMusicLayer, TSongAttachment, TSongHandle, TSongOptions } from '../../audio';
import type { TSongDoc, TSongError, TSongVoiceName } from '../../audio/synth';
import type { TSongFile } from '../../loaders/song';

/**
 * Plays a song written as notes, a `.song` file or one written in code, and hands back the controls.
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
 * @param song A song from `useLoadSong`, or a `TSongDoc` written in code.
 * @param options Its volume, channel, each voice's volume, tempo and key, and whether it starts on
 * its own.
 * @returns The controls: play, stop and pause it, move a voice, the tempo and the key, and follow
 * its beat.
 *
 * @example
 * ```ts
 * declare const crowd: TSprite;
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
     * Turns the song into tracks at the tempo and key asked for now. Said once if the notes have
     * mistakes: what can be read is still played.
     */
    const make = (): boolean => {
        const doc = file.doc;
        if (doc === null) {
            return false;
        }
        const sampleRate = audio.context.sampleRate;
        const rendered = renderSong({ ...doc, tempo: tempoNow() }, sampleRate, { transpose: attachment.transpose });
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
            return track === undefined ? [] : [{ name: voice, clip: clipFromSamples(audio, track, sampleRate, `${file.key}#${voice}`), volume: attachment.voices[voice] ?? 1 }];
        });
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
        const oldTempo = madeAt;
        if (!make() || before === null) {
            return;
        }
        player.restart(before * (oldTempo / tempoNow()));
    };

    const beats = createBeatClock(audio, () => (file.doc === null ? null : {
        position: player.position(),
        secondsPerBeat: 60 / madeAt,
        firstBeat: 0,
        beatsPerBar: file.doc.meter[0],
    }));

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
        onBeat: (listener) => beats.on(listener),
        get errors() {
            return errors;
        },
        get playing() {
            return player.playing;
        },
    };

    void whenLoaded(file).then(() => {
        if (box.destroyed || file.status !== 'ready') {
            return;
        }
        if (piece.layers.length === 0) {
            make();
        }
        if (attachment.autoplay) {
            handle.play();
        }
    });

    // The file changed after the tracks were made: made again, carrying on from the same beat.
    box.updateCallbacks.push(() => {
        if (piece.layers.length > 0 && file.status === 'ready' && getVersion(file) !== madeFrom) {
            remake();
        }
    });

    box.cleanups.push(() => {
        player.stop(0);
        beats.dispose();
    });

    setAttachmentPlayer(attachment, () => handle.play());

    return handle;
};
