/**
 * How many collision layers a scene has: **the smaller of the two backends**, not a number chosen
 * for taste.
 *
 * Rapier2D packs what a body is and what it hits into one 32-bit number, 16 bits each, so 16 is its
 * hard ceiling; the 3D side could carry far more. The format takes the smaller, because a scene
 * using layer 20 would simulate in three dimensions and collide wrongly in two without a word said,
 * which is the backend-dependent meaning {@link TPhysicsSurface} exists to prevent.
 *
 * Sixteen is also more than a game of this era uses: most projects name fewer than eight.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const PHYSICS_LAYERS = 16;

/**
 * Every layer at once, which is what a collider hits unless a scene says otherwise.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const ALL_LAYERS = (1 << PHYSICS_LAYERS) - 1;
