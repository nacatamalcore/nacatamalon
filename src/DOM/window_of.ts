/**
 * The window a canvas lives in, which is not always the one the engine was loaded in: a host can put
 * the canvas in a window of its own (a play window popped out of an editor). Its frames, its size,
 * its density and whether it is hidden are that window's, not this script's. The global one when the
 * canvas has no page of its own (a test's canvas), which in a browser is `window` and is what the
 * native runtime's page answers too.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const windowOf = (canvas: HTMLCanvasElement): Window =>
    canvas.ownerDocument?.defaultView ?? (globalThis as unknown as Window);

/**
 * The page a canvas lives in, for the same reason as `windowOf`. `undefined` where there is no page
 * at all (a test's canvas under Bun).
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const pageOf = (canvas: HTMLCanvasElement): Document | undefined =>
    canvas.ownerDocument ?? (globalThis as { document?: Document }).document;
