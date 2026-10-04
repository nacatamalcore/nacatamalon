/**
 * What a backend needs to draw one set of lines: their corners, already placed in the world, two per
 * line.
 *
 * **Not the lines' own record**, for the reason particles give: what the card wants is a packed run
 * of numbers, and a record is plain JSON. So the numbers live beside the record, and this is what
 * stands in front of them for a frame. Which camera they are seen through is the scene's, and travels
 * in the pass's `viewIndex`, as a model's does.
 *
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDrawLines = {
    readonly type: 'lines';
    /**
     * `LINE_VERTEX_FLOATS` per corner, placed in the world. Reused between frames.
     */
    readonly vertices: Float32Array;
    /**
     * How many corners are real. Two make a line; the rest of the run is left over.
     */
    readonly count: number;
};
