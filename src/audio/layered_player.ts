import { rampTo } from './ramp';
import { wrapPosition } from './loop_position';
import { logVoice } from './sound_log';
import type { TAudioManager, TVoice } from './types/t_audio';
import type { TMusicLayer } from './types/t_music';

/**
 * What a piece in layers is asked to be: read live, so a change to it applies the next time it is
 * started.
 *
 * @internal
 */
export type TLayeredPiece = {
    layers: TMusicLayer[];
    volume: number;
    channel: string;
    loopStart: number;
    loopEnd: number;
};

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
     * When it started, on the clock the music counts by (`audio.now()`).
     */
    startedAt: number;
    /**
     * How far into the tune it was when it started.
     */
    offset: number;
    paused: boolean;
};

/**
 * Plays layers together and in time: what `useMusic` and `useSong` both are underneath.
 *
 * @internal
 */
export type TLayeredPlayer = {
    /**
     * Every layer from `offset` seconds in, at the same moment. `false`, and nothing started, while a
     * layer is still loading.
     */
    start(offset: number, fade: number): boolean;
    stop(fade: number): void;
    pause(): void;
    resume(): void;
    setVolume(volume: number, fade: number): void;
    setLayer(layer: TMusicLayer, volume: number, fade: number): void;
    /**
     * Started again from `offset` with the layers as they are now (new sounds after a change of
     * tempo, say), staying paused if it was. Does nothing when it is not playing.
     */
    restart(offset: number): void;
    /**
     * Seconds into the tune, wrapped round the loop. `null` when it is not playing.
     */
    position(): number | null;
    readonly playing: boolean;
};

/**
 * Builds the player for one piece in layers.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createLayeredPlayer = (audio: TAudioManager, piece: TLayeredPiece): TLayeredPlayer => {
    let running: TRunning | null = null;

    const duration = (): number => piece.layers[0]?.clip.duration ?? 0;

    /**
     * The clock going back to the audio engine (after an editor ran the game a frame at a time): the
     * tune starts again from where the frames had got it to, so what is heard is where the game is.
     */
    const resync = (): (() => void) => {
        const current = running;
        if (current === null) {
            audio.resyncs.delete(resync);
            return () => {};
        }
        if (current.paused) {
            return () => {};
        }
        const played = current.offset + audio.now() - current.startedAt;
        return () => {
            if (running === current) {
                halt(current);
                running = null;
                start(played, 0);
            }
        };
    };

    /**
     * Starts every layer at the **same moment of the audio clock**. Started one after another they
     * would drift apart by however long the code between the two took, which is enough to hear.
     */
    const start = (offset: number, fade: number): boolean => {
        if (piece.layers.length === 0 || piece.layers.some((layer) => layer.clip.status !== 'ready' || layer.clip.buffer === null)) {
            return false;
        }
        // Nodes and ramps are scheduled on the audio engine's clock; where the tune is is counted on
        // the clock the music goes by, which an editor stepping the game sets to its frames.
        const now = audio.context.currentTime;
        const gain = audio.context.createGain();
        gain.gain.value = fade > 0 ? 0 : piece.volume;
        gain.connect(audio.channelGain(piece.channel));

        const parts = piece.layers.map((layer): TPart => {
            const node = audio.context.createBufferSource();
            node.buffer = layer.clip.buffer;
            node.loop = true;
            node.loopStart = piece.loopStart;
            node.loopEnd = piece.loopEnd;
            const layerGain = audio.context.createGain();
            layerGain.gain.value = layer.volume;
            node.connect(layerGain);
            layerGain.connect(gain);
            return { voice: { node, gain: layerGain, channel: piece.channel, panner: null, area: null, box: null, sound: null, from: null }, layer };
        });

        const current: TRunning = { parts, piece: gain, startedAt: audio.now(), offset, paused: false };
        running = current;
        audio.resyncs.add(resync);
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
            part.voice.node.start(now, wrapPosition(offset, part.layer.clip.duration, piece.loopStart, piece.loopEnd));
            part.voice.track = {
                position: () => wrapPosition(current.offset + audio.now() - current.startedAt, part.layer.clip.duration, piece.loopStart, piece.loopEnd),
                gains: [gain.gain, part.voice.gain.gain],
            };
            logVoice(audio, part.voice);
        }
        // Faded in once every layer has started, so a log of the game's sound hears the fade.
        if (fade > 0) {
            rampTo(gain.gain, piece.volume, now, fade);
        }
        return true;
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

    const stop = (fade: number): void => {
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

    const position = (): number | null => {
        const current = running;
        if (current === null) {
            return null;
        }
        const played = current.paused ? current.offset : current.offset + audio.now() - current.startedAt;
        return wrapPosition(played, duration(), piece.loopStart, piece.loopEnd);
    };

    return {
        start,
        stop,
        pause: () => {
            const current = running;
            if (current === null || current.paused) {
                return;
            }
            current.offset += audio.now() - current.startedAt;
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
        setVolume: (volume, fade) => {
            if (running !== null && !running.paused) {
                rampTo(running.piece.gain, volume, audio.context.currentTime, fade);
            }
        },
        setLayer: (layer, volume, fade) => {
            const part = running?.parts.find((candidate) => candidate.layer === layer);
            if (part !== undefined && running !== null && !running.paused) {
                rampTo(part.voice.gain.gain, volume, audio.context.currentTime, fade);
            }
        },
        restart: (offset) => {
            const current = running;
            if (current === null) {
                return;
            }
            if (current.paused) {
                current.offset = offset;
                return;
            }
            // No fade in: a change of tempo is not a new start.
            halt(current);
            running = null;
            start(offset, 0);
        },
        position,
        get playing() {
            return running !== null && !running.paused;
        },
    };
};
