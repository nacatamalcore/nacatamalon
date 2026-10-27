/**
 * Runs `fn` when the page stops being seen and when it is closing or reloading: the two moments a
 * page may be gone before a timer fires. Hidden is listened to as well as leaving because on a
 * phone a page in the background can be closed without `pagehide` ever being heard.
 *
 * For as long as the page lives: what calls it (a store) lives as long.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const whenPageGoes = (
    fn: () => void,
    page: Pick<Document, 'hidden' | 'addEventListener'> | undefined = globalThis.document,
    view: Pick<Window, 'addEventListener'> | undefined = globalThis.window,
): void => {
    page?.addEventListener('visibilitychange', () => {
        if (page.hidden) {
            fn();
        }
    });
    view?.addEventListener('pagehide', fn);
};
