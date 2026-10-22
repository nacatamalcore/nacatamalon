/**
 * The moment an event happened, in seconds on the page's clock (`performance.now()`), the one every
 * press is timed by: `keys.pressedAt`, `pointer.pressedAt`, a pointer's `time`, and what
 * `song.positionAt` takes.
 *
 * The event's own `timeStamp`, which is when the hand did it and not when the page got round to
 * saying so: up to a frame earlier, more on a busy phone. An event without one (made by hand, or by
 * a host that does not say) happened now.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const momentOf = (event: { timeStamp?: number }): number =>
    (typeof event.timeStamp === 'number' && event.timeStamp > 0 ? event.timeStamp : performance.now()) / 1000;
