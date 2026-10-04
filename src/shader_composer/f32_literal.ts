/**
 * Writes a number as a float constant both languages read as one: a whole number gets a trailing
 * `.0`, or the card would take it for an integer.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const f32Literal = (n: number): string => (Number.isInteger(n) ? `${n}.0` : `${n}`);
