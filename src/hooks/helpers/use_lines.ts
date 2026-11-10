import { newLines, writeLineList, writeLines } from '../../gameobjects/lines';
import type { TLine, TLines, TLinesOptions } from '../../gameobjects/lines';

/**
 * What `useLines` is asked for.
 *
 * @category Debug
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TUseLinesOptions = TLinesOptions & {
    /**
     * The first lines to draw, in either of the forms `setLines` takes. Left out, it starts empty,
     * which is normal for lines rewritten every frame.
     */
    lines?: readonly TLine[] | Float32Array;
};

/**
 * Draws any lines you like. `setLines` changes them at any time.
 *
 * The one to reach for when what has to be seen changes: an outline that follows what the player
 * picked, the path an enemy is about to take, the shape of a collider being tuned. The axis gizmo and
 * the floor grid are this with the corners worked out for you.
 *
 * What it gives back is the lines as a scene keeps them, like a sprite: `visible`, `transform` and
 * `zIndex` are changed on it directly. Their corners are measured from `transform`, so lines made
 * inside a moving thing move with it.
 *
 * Lines are drawn in the scene's 3D view: models in front hide them, and they hide what is behind
 * them. They are one pixel wide.
 *
 * @param options The first lines, and where they are drawn from.
 * @returns The lines.
 *
 * @example
 * ```ts
 * declare const target: { x: number; y: number; z: number };
 *
 * const Level = () => {
 *     useCamera3d({ projection: 'perspective', fov: 60, transform: { z: 6 } });
 *     const path = useLines();
 *
 *     useUpdate(() => {
 *         // One yellow line from the origin to wherever the enemy is heading.
 *         setLines(path, [{ from: { x: 0, y: 0, z: 0 }, to: target, color: '#ffcc00' }]);
 *     });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Debug
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useLines = (options: TUseLinesOptions = {}): TLines => {
    const lines = newLines('useLines', options, new Float32Array(0));
    if (options.lines !== undefined) {
        draw(lines, options.lines, 'useLines');
    }
    return lines;
};

/**
 * Replaces what a set of lines draws, from the next frame on.
 *
 * Two forms, for two sizes of job:
 *
 * - **A few lines**, as a list: `{ from, to, color }` each, the colour as text (`'#ffcc00'`). An
 *   outline, a path, an arrow.
 * - **Thousands**, rewritten every frame, as a `Float32Array`: seven numbers a corner,
 *   `x, y, z, r, g, b, a`, the colour from 0 to 1, and two corners a line. A cloth, a field of
 *   stars, rain. Fill the same array every frame: it is copied, so it can be reused straight away.
 *
 * Either form can be shorter or longer than the last.
 *
 * @param lines The lines `useLines` gave.
 * @param next What they draw now.
 *
 * @example
 * ```ts
 * const Level = () => {
 *     useCamera3d({ projection: 'perspective', fov: 60, transform: { z: 6 } });
 *     const box = useLines();
 *     const at = new Float32Array(7 * 2 * 4);
 *
 *     useUpdate((_delta, time) => {
 *         // A square turning on the floor, written as numbers: four lines, two corners each.
 *         for (let i = 0; i < 4; i++) {
 *             for (const [end, turn] of [[0, i], [1, i + 1]]) {
 *                 const angle = time + (turn * Math.PI) / 2;
 *                 at.set([Math.cos(angle), 0, Math.sin(angle), 0.3, 1, 0.6, 1], (i * 2 + end) * 7);
 *             }
 *         }
 *         setLines(box, at);
 *     });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Debug
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const setLines = (lines: TLines, next: readonly TLine[] | Float32Array): void => {
    draw(lines, next, 'setLines');
};

const draw = (lines: TLines, next: readonly TLine[] | Float32Array, caller: string): void => {
    // Not `instanceof`: an array made in another page (an editor's frame) is one all the same.
    if (ArrayBuffer.isView(next)) {
        writeLines(lines, next as Float32Array, caller);
    } else {
        writeLineList(lines, next);
    }
};
