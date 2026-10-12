import type { TAudioManager } from './types/t_audio';

/**
 * What a beat is heard as: which beat of the bar (from `1`) and which bar of the tune (from `1`).
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TBeatListener = (beat: number, bar: number) => void;

/**
 * Where a tune is and how it counts, read every frame. `position` is `null` while it is not playing.
 *
 * @internal
 */
export type TBeatSource = () => {
    position: number | null;
    secondsPerBeat: number;
    /**
     * Seconds into the file where the first beat falls.
     */
    firstBeat: number;
    beatsPerBar: number;
} | null;

/**
 * Calls its listeners each time a tune crosses into a new beat, going by the **audio engine's clock**
 * rather than the frames: what the ears hear, even when a frame is late.
 *
 * Checked once a frame by `updateAudio`, so a listener runs on the first frame of its beat. When the
 * tune goes round its loop the count goes back to the bar the loop starts on, the bar the tune is
 * really in. A frame long enough to skip a beat calls only for the one it lands in.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createBeatClock = (audio: TAudioManager, read: TBeatSource): {
    on(listener: TBeatListener): () => void;
    dispose(): void;
} => {
    const listeners = new Set<TBeatListener>();
    let last: number | null = null;

    const tick = (): void => {
        const now = read();
        if (now === null || now.position === null || now.secondsPerBeat <= 0) {
            last = null;
            return;
        }
        const index = Math.floor((now.position - now.firstBeat) / now.secondsPerBeat + 1e-6);
        if (index < 0 || index === last) {
            return;
        }
        last = index;
        const perBar = Math.max(1, now.beatsPerBar);
        for (const listener of [...listeners]) {
            listener((index % perBar) + 1, Math.floor(index / perBar) + 1);
        }
    };

    return {
        on: (listener) => {
            listeners.add(listener);
            if (listeners.size === 1) {
                audio.tickers.add(tick);
            }
            return () => {
                listeners.delete(listener);
                if (listeners.size === 0) {
                    audio.tickers.delete(tick);
                }
            };
        },
        dispose: () => {
            listeners.clear();
            audio.tickers.delete(tick);
        },
    };
};
