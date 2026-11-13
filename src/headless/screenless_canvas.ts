/**
 * A canvas for a game with no screen, and the window it is in: what the keyboard and the pads listen
 * on is a window of the game's own, so a key pressed in one game reaches that game and no other, and
 * nothing is asked of a `window` Node does not have.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createScreenlessCanvas = (width: number, height: number): { canvas: HTMLCanvasElement; view: EventTarget } => {
    const view = Object.assign(new EventTarget(), { navigator: {} });
    const canvas = Object.assign(new EventTarget(), {
        width,
        height,
        style: {},
        ownerDocument: { defaultView: view },
        // Read as it is now: the game can change its resolution while it runs.
        getBoundingClientRect: () => ({ left: 0, top: 0, width: canvas.width, height: canvas.height, x: 0, y: 0, right: canvas.width, bottom: canvas.height }),
    });
    return { canvas: canvas as unknown as HTMLCanvasElement, view };
};
