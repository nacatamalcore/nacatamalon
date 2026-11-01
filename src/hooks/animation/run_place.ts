import type { TAnimationClip } from './types/t_sprite_animation';

/**
 * The pace of a clip that does not say, in frames per second.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const DEFAULT_CLIP_FPS = 12;

/**
 * How many **extra** times a clip goes after the first, as `useSpriteAnimation` reads it: its
 * `repeat` when it says one, otherwise for ever when it loops and none when it does not. `Infinity`
 * for ever.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const clipRepeats = (clip: TAnimationClip): number => {
    const repeat = clip.repeat ?? ((clip.loop ?? true) ? -1 : 0);
    // A part of a time is a whole one: a sprite goes again while any of its repeats are left.
    return repeat < 0 ? Infinity : Math.ceil(repeat);
};

/**
 * How many pictures a run shows from start to end, counting each showing: `count` once, and then
 * every time it goes again. A `yoyo` comes back from the picture beside the end, so each time after
 * the first shows one fewer. `Infinity` for a run that goes for ever.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const runLength = (count: number, yoyo: boolean, repeats: number): number => {
    if (count <= 1) {
        return 1;
    }
    return yoyo ? count + repeats * (count - 1) : count * (repeats + 1);
};

/**
 * Which picture of a run is showing once it has moved on `steps` times: its place in the run's own
 * `frames`, from `0` to `count - 1`.
 *
 * The same walk `useSpriteAnimation` takes a picture at a time, worked out in one go, so whatever
 * shows a run by its age rather than by stepping it (a particle) shows what a sprite would. Every
 * time the run goes again is one of its `repeats`, the way back of a `yoyo` included:
 * `[0, 1, 2, 3]` with `yoyo` and one repeat is 0 1 2 3 2 1 0, and it ends on 0. Past the end it
 * rests on the picture it ended on.
 *
 * @param count - How many pictures the run has, at least `1`.
 * @param yoyo - Whether each time it goes again comes back the other way.
 * @param repeats - How many extra times it goes, `Infinity` for ever.
 * @param steps - How many times it has moved on, a whole number from `0`.
 * @returns The place in the run.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const runPlace = (count: number, yoyo: boolean, repeats: number, steps: number): number => {
    if (count <= 1) {
        return 0;
    }
    if (!yoyo) {
        return steps >= count * (repeats + 1) ? count - 1 : steps % count;
    }
    if (steps < count) {
        return steps;
    }
    // After the first time through, each one shows one picture fewer: the end it turned at.
    const since = steps - count;
    const time = 1 + Math.floor(since / (count - 1));
    if (time > repeats) {
        // An even number of extra times ends going forwards, on the last picture; odd, back on the first.
        return repeats % 2 === 0 ? count - 1 : 0;
    }
    const along = since % (count - 1);
    return time % 2 === 1 ? count - 2 - along : 1 + along;
};
