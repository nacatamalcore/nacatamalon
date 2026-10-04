import type { TGameTarget } from '../game/bootstrap/create_game';

/**
 * Turns whatever the host passed as a target into an element the engine can mount into.
 *
 * `null` is an option rather than an oversight: it means "no container, just put it on the
 * page", and resolves to `<body>`.
 * @param target Container element, canvas element, CSS selector, or `null` for `<body>`.
 * @returns The element to mount into.
 * @throws If the host passed a CSS selector that matches nothing, or that matches a non-HTML
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const resolveTarget = (target: TGameTarget): HTMLElement => {

    if (target === null) return document.body;
    if (typeof target !== 'string') return target;

    const found = document.querySelector(target);

    if (found === null) {
        throw new Error(`[NacatamalOn] createGame: no element matches '${target}'. Add one to the page (for '#app', <div id="app"></div>), and make sure the script runs after it exists.`);
    }

    if (!(found instanceof HTMLElement)) {
        throw new Error(
            `[NacatamalOn] createGame: '${target}' matched <${found.tagName.toLowerCase()}>, which is not an HTML element.`,
        );
    }

    return found;
};
