import { getActiveBox, getActiveGame } from '../../store';
import { createBeatClock, createLayeredPlayer, getAudioManager, heardPositionOf } from '../../audio';
import { setAttachmentHandle } from '../../audio/attachment_players';
import { isShowingOnly } from '../physics/is_showing_only';
import { nanoId } from '../../utils';
import { whenLoaded } from '../../loaders';
import { useLoadAudio } from '../loaders/use_load_audio';
import type { TMusicAttachment, TMusicHandle, TMusicLayer, TMusicOptions } from '../../audio';

/**
 * Plays **one piece of music recorded in several files** (its layers, or stems) that sound together,
 * and hands back the controls for it.
 *
 * **What it is for:** music that changes with the game without starting over: the drums come in for
 * a fight, the tune goes muffled under water. **Not for:** a single recording (that is `useSound`), or
 * a tune written as notes in a `.song` (that is `useSong`, which can also drop a voice, change key and
 * speed up).
 *
 * The layers are the same tune played by different instruments, one file each and all the same
 * length. They always play **together and in time**; what the game changes is how loud each one is.
 * That is how music follows the place without ever starting over: walk into the water and the tune
 * goes muffled, start a fight and the drums come in, and the melody never loses its place.
 *
 * It belongs to the channel `'music'` unless it says otherwise, so an options screen moves it with
 * the rest. Like every sound, it stops with the scene or the object that asked for it.
 *
 * With `loopStart` it has an intro that plays once, and with `bpm` the game can follow its beat.
 *
 * Music laid out in a scene document (a `music` component) is made by this same hook; a behaviour
 * gets its controls with `soundOf(box, name)`. In a scene shown rather than played (an editor's
 * viewport), `autoplay` waits for the game to play.
 *
 * @param options The layers by name, each with the volume it starts at, and the piece's volume,
 * channel and whether it starts on its own.
 * @returns The controls: play, stop and pause it, and move a layer.
 *
 * @example
 * ```ts
 * declare const player: TSprite;
 *
 * const Level = () => {
 *     const music = useMusic({
 *         layers: {
 *             land: { src: '/audio/theme_land.ogg' },
 *             water: { src: '/audio/theme_water.ogg', volume: 0 },
 *         },
 *         autoplay: true,
 *     });
 *
 *     useUpdate(() => {
 *         const under = player.transform.y < 0;
 *         music.setLayer('land', under ? 0 : 1, 0.5);
 *         music.setLayer('water', under ? 1 : 0, 0.5);
 *     });
 *     return createScene();
 * };
 * ```
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useMusic = (options: TMusicOptions): TMusicHandle => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw new Error('[NacatamalOn] useMusic: call it inside a scene body.');
    }
    const audio = getAudioManager(store);

    const layers: TMusicLayer[] = Object.entries(options.layers).map(([name, layer]) => ({
        name,
        clip: 'clip' in layer ? layer.clip : useLoadAudio({ src: layer.src, ...(layer.key !== undefined ? { key: layer.key } : {}) }),
        volume: layer.volume ?? 1,
    }));
    const attachment: TMusicAttachment = {
        type: 'music',
        id: options.id ?? nanoId(),
        layers,
        volume: options.volume ?? 1,
        channel: options.channel ?? 'music',
        autoplay: options.autoplay ?? false,
        loopStart: options.loopStart ?? 0,
        loopEnd: options.loopEnd ?? 0,
        bpm: options.bpm ?? null,
        beatsPerBar: options.beatsPerBar ?? 4,
        firstBeat: options.firstBeat ?? 0,
    };
    box.sounds.push(attachment);

    const player = createLayeredPlayer(audio, attachment);
    const beats = createBeatClock(audio, () => (attachment.bpm === null ? null : {
        // The beat heard, not the one played: it comes as late as the sound does.
        position: player.position(audio.heardDelay()),
        secondsPerBeat: 60 / attachment.bpm,
        firstBeat: attachment.firstBeat,
        beatsPerBar: attachment.beatsPerBar,
    }));
    /**
     * The names asked for that the piece does not have, said once each.
     */
    const warned = new Set<string>();
    let warnedBeats = false;

    const layerNamed = (name: string): TMusicLayer | undefined => {
        const layer = layers.find((candidate) => candidate.name === name);
        if (layer === undefined && !warned.has(name)) {
            warned.add(name);
            console.warn(`[NacatamalOn] useMusic: this music has no layer called '${name}'. It has ${layers.map((candidate) => `'${candidate.name}'`).join(', ')}.`);
        }
        return layer;
    };

    const heard = heardPositionOf(audio, player.position);

    const handle: TMusicHandle = {
        play: (play) => {
            player.stop(0);
            player.start(0, play?.fade ?? 0);
        },
        stop: (fading) => player.stop(fading?.fade ?? 0),
        pause: () => player.pause(),
        resume: () => player.resume(),
        // Both write through to what the object carries, so a scene saved after the music changed
        // comes back changed.
        setVolume: (volume, fade = 0) => {
            attachment.volume = volume;
            player.setVolume(volume, fade);
        },
        setLayer: (name, volume, fade = 0) => {
            const layer = layerNamed(name);
            if (layer === undefined) {
                return;
            }
            layer.volume = volume;
            player.setLayer(layer, volume, fade);
        },
        getLayer: (name) => layers.find((layer) => layer.name === name)?.volume ?? 0,
        onBeat: (listener) => {
            if (attachment.bpm === null && !warnedBeats) {
                warnedBeats = true;
                console.warn('[NacatamalOn] useMusic: onBeat needs to know the tempo. Give the music a `bpm`.');
            }
            return beats.on(listener);
        },
        get position() {
            return heard.now();
        },
        get beat() {
            const at = heard.now();
            return at === null || attachment.bpm === null ? null : (at - attachment.firstBeat) / (60 / attachment.bpm);
        },
        get latency() {
            return audio.heardDelay();
        },
        positionAt: (moment) => heard.at(moment),
        get playing() {
            return player.playing;
        },
    };

    // A scene shown rather than played (an editor's viewport) keeps it quiet: it still says it starts on
    // its own, and saves so, but nothing sounds until the game plays.
    const showingOnly = isShowingOnly();
    if (attachment.autoplay && !showingOnly) {
        void Promise.all(layers.map((layer) => whenLoaded(layer.clip))).then(() => {
            if (!box.destroyed) {
                handle.play();
            }
        });
    }

    box.cleanups.push(() => {
        player.stop(0);
        beats.dispose();
    });

    setAttachmentHandle(attachment, handle);

    return handle;
};
