/**
 * A key, spelled the way the browser reports it in `KeyboardEvent.key`: space is `' '`, letters
 * are lowercase (`'f'`), and named keys keep their names (`'ArrowLeft'`, `'Escape'`, `'Enter'`).
 * `'Space'` is accepted for the space bar too.
 *
 * An alias of `string`, so any literal still fits without a cast. What it buys is the name showing
 * up in a signature, which says what kind of string is expected.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TKeyName = string;
