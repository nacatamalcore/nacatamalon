/**
 * Cuts out the middle of a single axis and stretches what is left over the whole range, so leaving
 * the dead zone starts from zero instead of jumping straight to the dead zone's own value, which
 * feels like a lurch at the start of every movement.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const deadzoneScalar = (value: number, deadzone: number): number => {
    const magnitude = Math.abs(value);
    if (magnitude <= deadzone || deadzone >= 1) {
        return 0;
    }
    return Math.sign(value) * ((magnitude - deadzone) / (1 - deadzone));
};

/**
 * The same for two axes at once, and the difference is the whole point: the dead zone applies to
 * the stick's **distance from the middle**, not to each axis on its own, so the dead area is a
 * circle.
 *
 * Doing it per axis makes it a square, and then a stick pushed gently on the diagonal passes one
 * axis while the other is zeroed: the character snaps to up, down, left and right and diagonals
 * only appear when the stick is shoved.
 *
 * One definition, shared by the stick and by the named actions, so a stick read either way gives
 * the same numbers.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const deadzoneRadial = (x: number, y: number, deadzone: number): { x: number; y: number } => {
    const magnitude = Math.hypot(x, y);
    if (magnitude === 0 || magnitude <= deadzone || deadzone >= 1) {
        return { x: 0, y: 0 };
    }
    const scale = Math.min(1, (magnitude - deadzone) / (1 - deadzone)) / magnitude;
    return { x: x * scale, y: y * scale };
};
