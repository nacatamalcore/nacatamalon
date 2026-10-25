/**
 * Where one entry of a pass may draw, and what it does to the stencil: how a mask reaches a backend.
 *
 * **One per entry of a pass, and the same object for every entry in the same state**, so a backend
 * tells "the state changed" by comparing two of them, and a run of sprites in one state stays one
 * draw. A pass where nothing is masked carries none, and is drawn exactly as before masks existed.
 *
 * The stencil holds, at each pixel, how many of the masks around an entry let it through. Every
 * entry is drawn where the stencil equals its `ref`: with nothing masked that is 0 everywhere, so
 * it passes everywhere.
 *
 * - `'none'` draws, where the stencil is `ref`.
 * - `'add'` draws nothing, and raises the stencil by one where it was `ref` and the shape covers.
 * - `'sub'` draws nothing, and lowers it by one where it was `ref` and the shape covers: an inverted
 *   mask, raised everywhere first and lowered where its shape is.
 * - `'reset'` draws nothing, and brings back to `ref` everything above it: leaving masks.
 *
 * A shape covers where its picture is at least half there, read in `channel`: its alpha, or how
 * light it is. A letter of a vector font covers where its edge says.
 *
 * `scissor` is the box the entry is kept inside, in the pass's own pixels (the game's, for the
 * screen), or `null` for all of it. It is the cheap way to keep to a rectangle that is not turned on
 * the screen, and it costs nothing at all.
 *
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDrawStencil = {
    readonly ref: number;
    readonly write: 'none' | 'add' | 'sub' | 'reset';
    readonly channel: 'alpha' | 'luminance';
    readonly scissor: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null;
};
