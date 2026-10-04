import { getActiveBox, getActiveGame } from '../../store';
import { getAudioManager, rampTo } from '../../audio';
import { nanoId } from '../../utils';
import { whenLoaded } from '../../loaders';
import { useLoadAudio } from '../loaders/use_load_audio';
import type { TMusicAttachment, TMusicHandle, TMusicLayer, TMusicOptions, TVoice } from '../../audio';

/**
 * One layer sounding: its voice and its own volume.
 */
type TPart = { voice: TVoice; layer: TMusicLayer };

/**
 * The piece while it plays: every layer's voice, the volume of the whole, and what `pause` needs to
 * start them all again, together, where they stopped.
 */
type TRunning = {
    parts: TPart[];
    piece: GainNode;
    /**
     * When it started, on the audio engine's clock.
     */
    startedAt: number;
    /**
     * How far into the tune it was when it started.
     */
    offset: number;
    paused: boolean;
};

/**
 * Plays a piece of music made of layers, and hands back the controls for it.
 *
 * The layers are the same tune played by different instruments, one file each and all the same
 * length. They always play **together and in time**; what the game changes is how loud each one is.
 * That is how music follows the place without ever starting over: walk into the water and the tune
 * goes muffled, start a fight and the drums come in, and the melody never loses its place.
 *
 * It belongs to the channel `'music'` unless it says otherwise, so an options screen moves it with
 * the rest. Like every sound, it stops with the scene or the object that asked for it.
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
    };
    box.sounds.push(attachment);

    let running: TRunning | null = null;
    /**
     * The names asked for that the piece does not have, said once each.
     */
    const warned = new Set<string>();

    /**
     * Starts every layer at the **same moment of the audio clock**. Started one after another they
     * would drift apart by however long the code between the two took, which is enough to hear.
     */
    const start = (offset: number, fade: number): void => {
        if (layers.some((layer) => layer.clip.status !== 'ready' || layer.clip.buffer === null)) {
            return;
        }
        const now = audio.context.currentTime;
        const piece = audio.context.createGain();
        piece.gain.value = fade > 0 ? 0 : attachment.volume;
        piece.connect(audio.channelGain(attachment.channel));
        if (fade > 0) {
            rampTo(piece.gain, attachment.volume, now, fade);
        }

        const parts = layers.map((layer): TPart => {
            const node = audio.context.createBufferSource();
            node.buffer = layer.clip.buffer;
            node.loop = true;
            const gain = audio.context.createGain();
            gain.gain.value = layer.volume;
            node.connect(gain);
            gain.connect(piece);
            return { voice: { node, gain, channel: attachment.channel, panner: null, area: null, box: null, sound: null }, layer };
        });

        const current: TRunning = { parts, piece, startedAt: now, offset, paused: false };
        running = current;
        for (const part of parts) {
            audio.voices.add(part.voice);
            // Stopped from outside (every sound of its channel, say): once the last layer has gone
            // the piece is not playing any more.
            part.voice.node.onended = () => {
                audio.voices.delete(part.voice);
                if (running === current && !current.paused && parts.every((other) => !audio.voices.has(other.voice))) {
                    running = null;
                }
            };
            const duration = part.layer.clip.duration;
            part.voice.node.start(now, duration > 0 ? offset % duration : offset);
        }
    };

    /**
     * Every layer, silenced at once and let go.
     */
    const halt = (current: TRunning): void => {
        for (const part of current.parts) {
            part.voice.node.onended = null;
            try { part.voice.node.stop(); } catch { /* never started */ }
            part.voice.node.disconnect();
            audio.voices.delete(part.voice);
        }
    };

    const stop = (fade = 0): void => {
        const current = running;
        if (current === null) {
            return;
        }
        // Let go straight away, so playing again while this fades out is a new piece over the tail
        // of the old one rather than nothing.
        running = null;
        if (fade <= 0 || current.paused) {
            halt(current);
            return;
        }
        const now = audio.context.currentTime;
        rampTo(current.piece.gain, 0, now, fade);
        for (const part of current.parts) {
            part.voice.node.stop(now + fade);
        }
    };

    const layerNamed = (name: string): TMusicLayer | undefined => {
        const layer = layers.find((candidate) => candidate.name === name);
        if (layer === undefined && !warned.has(name)) {
            warned.add(name);
            console.warn(`[NacatamalOn] useMusic: this music has no layer called '${name}'. It has ${layers.map((candidate) => `'${candidate.name}'`).join(', ')}.`);
        }
        return layer;
    };

    const handle: TMusicHandle = {
        play: (play) => {
            stop();
            start(0, play?.fade ?? 0);
        },
        stop: (fading) => stop(fading?.fade ?? 0),
        pause: () => {
            const current = running;
            if (current === null || current.paused) {
                return;
            }
            current.offset += audio.context.currentTime - current.startedAt;
            halt(current);
            current.paused = true;
        },
        resume: () => {
            const current = running;
            if (current === null || !current.paused) {
                return;
            }
            running = null;
            start(current.offset, 0);
        },
        // Both write through to what the object carries, so a scene saved after the music changed
        // comes back changed.
        setVolume: (volume, fade = 0) => {
            attachment.volume = volume;
            if (running !== null && !running.paused) {
                rampTo(running.piece.gain, volume, audio.context.currentTime, fade);
            }
        },
        setLayer: (name, volume, fade = 0) => {
            const layer = layerNamed(name);
            if (layer === undefined) {
                return;
            }
            layer.volume = volume;
            const part = running?.parts.find((candidate) => candidate.layer === layer);
            if (part !== undefined && running !== null && !running.paused) {
                rampTo(part.voice.gain.gain, volume, audio.context.currentTime, fade);
            }
        },
        getLayer: (name) => layers.find((layer) => layer.name === name)?.volume ?? 0,
        get playing() {
            return running !== null && !running.paused;
        },
    };

    if (attachment.autoplay) {
        void Promise.all(layers.map((layer) => whenLoaded(layer.clip))).then(() => {
            if (!box.destroyed) {
                handle.play();
            }
        });
    }

    box.cleanups.push(() => stop());

    return handle;
};
