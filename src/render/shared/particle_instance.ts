/**
 * Numbers per particle in the buffer the card reads: place, size, turn, colour, which view it is
 * seen through, and the window of its sheet it shows.
 *
 * Thirteen are used and the stride is sixteen, sixty-four bytes. The window is the last four, the
 * same place in both dimensions; the three before it are padding and nothing else.
 *
 * The window is worked out here, on the processor, and not looked up on the card by a frame number:
 * that keeps everything under `render/` knowing nothing of sheets, runs or effects, the way a
 * sprite's own window does. Four more numbers a particle is sixteen kilobytes more at a thousand.
 *
 * **Deliberately narrower than a sprite's eighteen.** A sprite carries a width and a height, a scale
 * on each axis and an anchor, and a particle varies none of those: it is square, it is placed by its
 * middle, and one number is its size. Paying for those per particle is exactly the cost that does
 * not scale when there are a thousand of them.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const PARTICLE_FLOATS = 16;

/**
 * Where each number sits inside one particle's run, so the writer and both backends say the same
 * thing about the same offset.
 *
 * One table read by three places, rather than three sets of magic numbers that agree until somebody
 * adds a field. The same reason the material block has one.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const PARTICLE_OFFSET = {
    x: 0,
    y: 1,
    size: 2,
    rotation: 3,
    r: 4,
    g: 5,
    b: 6,
    a: 7,
    /**
     * Slot 0 is the screen and camera `c` is in slot `c + 1`, the rule sprites already follow.
     */
    view: 8,
    /**
     * Four numbers: where the window starts in the picture and how wide and tall it is, in 0-1.
     * The whole picture, `0, 0, 1, 1`, for an effect without a sheet.
     */
    window: 12,
} as const;

/**
 * The same run of sixteen for a particle in three dimensions, laid out its own way.
 *
 * Thirteen used again, with the window in the same place, so both kinds share one stride and one
 * buffer. There is no view here: a particle in depth is seen through its scene's own camera, which
 * the draw is handed once for the whole emitter, not once per particle.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const PARTICLE_3D_OFFSET = {
    x: 0,
    y: 1,
    z: 2,
    size: 3,
    rotation: 4,
    r: 5,
    g: 6,
    b: 7,
    a: 8,
    window: 12,
} as const;
