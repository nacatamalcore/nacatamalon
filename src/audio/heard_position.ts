import type { TAudioManager } from './types/t_audio';

/**
 * Where a tune is heard, for the handles that say it (`useSong`, `useMusic`): its player's position
 * as the player hears it, the sound's delay on its way taken off.
 *
 * @internal
 */
export type THeardPosition = {
    /**
     * Seconds into the tune being heard now, never before its start, or `null` while it is stopped.
     */
    now(): number | null;
    /**
     * Seconds into the tune that were being heard at `moment`, a time on the page's clock such as a
     * press gives. Under the frames' clock, where a press is as early as its frame, `now`.
     */
    at(moment: number): number | null;
};

/**
 * Where a tune whose player says `position` is heard. The delay is taken off before the player
 * wraps the position round its loop, so just after going round it is still at the end of the loop.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const heardPositionOf = (audio: TAudioManager, position: (lateBy: number) => number | null): THeardPosition => {
    const heardAt = (lateBy: number): number | null => {
        const at = position(lateBy);
        return at === null ? null : Math.max(0, at);
    };
    return {
        now: () => heardAt(audio.heardDelay()),
        // How long ago the moment was is taken off as the speaker's delay is.
        at: (moment) => heardAt(audio.clock === 'frames' ? 0 : audio.heardDelay() + Math.max(0, performance.now() / 1000 - moment)),
    };
};
