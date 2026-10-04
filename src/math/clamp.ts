/**
 * Keeps `value` between `min` and `max`: below `min` it gives `min`, above `max` it gives `max`,
 * and in between the value itself. It is what keeps a player inside the screen or a volume
 * between 0 and 1, and it replaces `Math.min(max, Math.max(min, value))`, which is easy to write
 * with the two the wrong way round.
 *
 * @param value The number to keep in range.
 * @param min The lowest it may be.
 * @param max The highest it may be.
 * @returns `value`, moved inside the range if it was outside.
 *
 * @example
 * ```ts
 * useUpdate((delta) => {
 *     hero.transform.x = clamp(hero.transform.x + speed * delta, 8, 312);
 * });
 * ```
 *
 * @category Math
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
