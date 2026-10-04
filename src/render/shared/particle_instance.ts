/**
 * Numbers per particle in the buffer the card reads: place, size, turn, colour, and which view it
 * is seen through.
 *
 * Nine are used and the stride is twelve, which rounds it to forty-eight bytes. The three spare are
 * padding and nothing else; naming a use for them now would be inventing a field nobody reads.
 *
 * **Deliberately narrower than a sprite's eighteen.** A sprite carries a width and a height, a scale
 * on each axis and an anchor, and a particle varies none of those: it is square, it is placed by its
 * middle, and one number is its size. Paying for the other nine per particle is exactly the cost
 * that does not scale when there are a thousand of them.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const PARTICLE_FLOATS = 12;

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
} as const;

/**
 * The same run of twelve for a particle in three dimensions, laid out its own way.
 *
 * Nine used again, so both kinds share one stride and one buffer. There is no view here: a particle
 * in depth is seen through its scene's own camera, which the draw is handed once for the whole
 * emitter, not once per particle.
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
} as const;
