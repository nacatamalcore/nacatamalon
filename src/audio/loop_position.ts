/**
 * How close to the end of a loop counts as the end, in seconds: well under a sample.
 */
const EDGE = 1e-6;

/**
 * Where a looping sound really is after playing for `position` seconds from the start of its file.
 *
 * Until it first reaches the end of the loop it is wherever it got to, intro included. Past that it
 * goes round between `loopStart` and `loopEnd` and never back to the intro, which is what resuming a
 * paused tune needs: it carries on inside the loop rather than playing the intro again.
 *
 * A loop that makes no sense (an end before its start, or past the file) is the whole file, which is
 * what the browser does with the same numbers.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const wrapPosition = (position: number, duration: number, loopStart: number, loopEnd: number): number => {
    if (duration <= 0) {
        return position;
    }
    let start = loopStart;
    let end = loopEnd > 0 && loopEnd <= duration ? loopEnd : duration;
    if (start < 0 || start >= end) {
        start = 0;
        end = duration;
    }
    // A hair short of the end is the end: time added up a frame at a time lands a rounding error
    // under it, and a tune there is already back at the start of its loop (its first beat), not
    // one beat on into nothing.
    if (position < end - EDGE) {
        return position;
    }
    const wrapped = start + ((position - start) % (end - start));
    return wrapped > end - EDGE ? start : wrapped;
};
