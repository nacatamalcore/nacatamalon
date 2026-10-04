/**
 * How many numbers one corner of a line takes: where it is (`x`, `y`, `z`) and its colour (`r`, `g`,
 * `b`, `a`).
 *
 * The colour rides on the corner rather than on the whole set, so one draw can paint the three arms
 * of an axis gizmo three colours, and a line can fade from one end to the other for free.
 *
 * Written once here and read by both backends and by whoever writes lines, so the three can never
 * count a corner differently.
 *
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const LINE_VERTEX_FLOATS = 7;

/**
 * How much closer every line is drawn than it is, as a share of the depth range: see the lines shader of either backend.
 *
 * Measured, not guessed: with the editor's grid on the demo's floor, `2e-6` still lost one line in
 * two to the floor and `2e-5` lost none. Being a share of the depth range, it is worth more of the
 * world the further away a line is: under a tenth of a unit at twenty units from a camera whose near
 * plane is at 0.1, so only something thinner than that lying on a line lets it show through.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const LINE_DEPTH_NUDGE = 2e-5;
