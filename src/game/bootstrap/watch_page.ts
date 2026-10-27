import { gameMoment, onGameMoment } from '../../signal/game_moments';
import type { TBox } from '../../box';
import type { TRuntimeStore } from '../../store';

/**
 * What happens to the page around a game that the game may want to hear about:
 *
 * - `'hidden'` / `'shown'`: the page stops being seen (another tab, a minimised window, a phone's
 *   home screen) and is seen again.
 * - `'blurred'` / `'focused'`: another window, or the rest of the page, takes the keyboard while the
 *   game is still in sight.
 * - `'leaving'`: the page is closing or reloading.
 *
 * @internal
 */
export type TPageMoment = 'hidden' | 'shown' | 'blurred' | 'focused' | 'leaving';

/**
 * Listens for one moment of a game's page. With a box, the listener leaves with it.
 *
 * @returns What stops it sooner.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const onPageMoment = (store: TRuntimeStore, moment: TPageMoment, box: TBox | null, listener: () => void): (() => void) =>
    onGameMoment(store, `page: ${moment}`, box, listener);

/**
 * Tells a game's listeners what happens to its page, from the browser's own events:
 * `visibilitychange` for hidden and shown, the window's `blur` and `focus`, and `pagehide` for
 * leaving (it is also heard where `unload` is not, and it does not stop the page being kept for the
 * back button).
 *
 * @returns What stops the watching, called when the game is destroyed.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const watchPage = (
    store: TRuntimeStore,
    page: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'> | undefined = globalThis.document,
    view: Pick<Window, 'addEventListener' | 'removeEventListener'> | undefined = globalThis.window,
): (() => void) => {
    if (page === undefined || view === undefined) {
        return () => {};
    }
    const tell = (moment: TPageMoment): void => gameMoment(store, `page: ${moment}`).emit();
    const onVisibility = (): void => tell(page.hidden ? 'hidden' : 'shown');
    const onBlur = (): void => tell('blurred');
    const onFocus = (): void => tell('focused');
    const onLeave = (): void => tell('leaving');

    page.addEventListener('visibilitychange', onVisibility);
    view.addEventListener('blur', onBlur);
    view.addEventListener('focus', onFocus);
    view.addEventListener('pagehide', onLeave);
    return () => {
        page.removeEventListener('visibilitychange', onVisibility);
        view.removeEventListener('blur', onBlur);
        view.removeEventListener('focus', onFocus);
        view.removeEventListener('pagehide', onLeave);
    };
};
