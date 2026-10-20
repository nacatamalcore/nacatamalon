/**
 * A button of the mouse, by the name this engine gives it. A finger is `'main'`.
 *
 * `'main'` and not `'left'`: on a mouse set up for the left hand the main button is the right one,
 * and a finger is neither. `'back'` and `'forward'` are the two on the side of some mice.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPointerButtonName = 'main' | 'middle' | 'right' | 'back' | 'forward';

/**
 * Every pointer button, in the order the browser numbers them: **the position in this list is the
 * number it reports**, `0` the main one to `4` forward.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const POINTER_BUTTONS: readonly TPointerButtonName[] = ['main', 'middle', 'right', 'back', 'forward'];

/**
 * The name of the button the browser numbered `index`. One it has no name for (a mouse with more
 * buttons than five) is taken as the main one.
 *
 * @internal
 */
export const pointerButtonName = (index: number | undefined): TPointerButtonName => POINTER_BUTTONS[index ?? 0] ?? 'main';
