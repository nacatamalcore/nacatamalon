import type { TGameHandle } from '../handle/t_game_handle';
import type { TRuntimeStore } from '../../store';

/**
 * The tag the browser holds the loop with while the page cannot be seen. One of the holders of
 * `TRuntimeState.loop.pausedBy`, beside a game's pause menu and an editor's Pause button.
 */
export const BROWSER_PAUSE = 'browser';

/**
 * `pauseOnBlur`: the game pauses while its page is hidden (another tab, a minimised window) and
 * resumes when it is seen again, through the same holds a pause menu uses, so the game's `onPaused`
 * and `onResumed` are told the reason `'browser'`.
 *
 * Only its own hold is released on the way back: a game the player paused from a menu before
 * switching tabs is still paused when they return.
 *
 * The resume waits one frame. A hidden tab gets no frames, so the first one back measures the whole
 * time away (capped, but still a jump); arriving while still paused, that frame is drawn and not
 * run, and the game goes on from the next one with an ordinary `delta`.
 *
 * @returns What stops the watching, called when the game is destroyed.
 *
 * @internal
 */
export const watchVisibility = (
    game: Pick<TGameHandle, 'pause' | 'resume'>,
    page: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'> | undefined = globalThis.document,
    nextFrame: (callback: () => void) => unknown = (callback) => globalThis.requestAnimationFrame(callback),
): (() => void) => {
    if (page === undefined) {
        return () => {};
    }
    let watching = true;
    const onChange = (): void => {
        if (page.hidden) {
            game.pause(BROWSER_PAUSE);
            return;
        }
        nextFrame(() => {
            // Hidden again before the frame came, or the game is gone: nothing to resume.
            if (watching && !page.hidden) {
                game.resume(BROWSER_PAUSE);
            }
        });
    };
    // A game started in a tab that is already in the background starts held.
    if (page.hidden) {
        game.pause(BROWSER_PAUSE);
    }
    page.addEventListener('visibilitychange', onChange);
    return () => {
        watching = false;
        page.removeEventListener('visibilitychange', onChange);
    };
};

/**
 * The game's holds with its sound held with them: a hidden page stops every sound where it is, the
 * way a console paused, and they carry on from there when it is seen again. Without it a song made
 * as it plays would run out a moment after the page went, and be found further on when it came back.
 * @returns What `watchVisibility` holds and lets go.
 * @internal
 */
export const holdingSound = (game: Pick<TGameHandle, 'pause' | 'resume'>, store: TRuntimeStore): Pick<TGameHandle, 'pause' | 'resume'> => ({
    pause: (reason) => {
        game.pause(reason);
        store.get('audio').manager?.setHidden(true);
    },
    resume: (reason) => {
        game.resume(reason);
        store.get('audio').manager?.setHidden(false);
    },
});
