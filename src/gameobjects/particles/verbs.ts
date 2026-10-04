import { particleStateOf } from './particle_state';
import type { TParticles } from './types/t_particles';
import type { TParticles3d } from './types/t_particles_3d';

/**
 * Starts the effect from the beginning: new particles appear, and a burst fires again.
 *
 * The cycle is put back to exactly zero, and that is what re-arms a burst: a one-shot that has
 * already gone off is a one-shot that can be fired again.
 *
 * @param emitter - The emitter, as `createParticles` or `createParticles3d` gave it back.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const playParticles = (emitter: TParticles | TParticles3d): void => {
    emitter.emitting = true;
    const state = particleStateOf(emitter);
    if (state !== null) {
        state.cycleTime = 0;
        state.carry = 0;
    }
};

/**
 * Stops new ones appearing.
 *
 * **Not the same as clearing.** Whatever is already in the air goes on living, moving and drawing
 * until its own time runs out, which is what putting a torch out looks like. Use `clearParticles`
 * for the other thing.
 *
 * @param emitter - The emitter, as `createParticles` or `createParticles3d` gave it back.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const stopParticles = (emitter: TParticles | TParticles3d): void => {
    emitter.emitting = false;
};

/**
 * Freezes it, or lets it go again.
 *
 * Nothing moves and nothing is born, and it keeps drawing exactly what it last drew. Freezing rather
 * than hiding, because the useful half of this is being able to look at it: a still flame is
 * something you can line something else up against, and a hidden one is a hole where you have to
 * remember an effect was.
 *
 * @param emitter - The emitter, as `createParticles` or `createParticles3d` gave it back.
 * @param paused - `true` to freeze it, `false` to let it go again.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const pauseParticles = (emitter: TParticles | TParticles3d, paused = true): void => {
    emitter.paused = paused;
};

/**
 * Takes every particle out of the air at once, and leaves the emitter as it was.
 *
 * @param emitter - The emitter, as `createParticles` or `createParticles3d` gave it back.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const clearParticles = (emitter: TParticles | TParticles3d): void => {
    const state = particleStateOf(emitter);
    if (state !== null) {
        state.pool.live = 0;
        // Both, and in the same breath: a frame can be drawn between two lines, and one that read a
        // count of forty out of an empty pool would draw forty of whatever was there before.
        state.instanceCount = 0;
    }
};

/**
 * How many are in the air right now.
 *
 * @param emitter - The emitter, as `createParticles` or `createParticles3d` gave it back.
 * @returns How many particles it has in the air.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const particleCount = (emitter: TParticles | TParticles3d): number => particleStateOf(emitter)?.pool.live ?? 0;

/**
 * Asks for `count` particles to appear, over and above whatever the effect does by itself.
 *
 * What a game calls when something happens: a hit, a footstep, a jump. It works on an emitter that
 * is switched off, which is the usual way a one-shot is used.
 *
 * They appear on the **next** step rather than inside this call, and that is deliberate: a particle
 * is born where its emitter ends up, and that is not known until the tree has been walked later in
 * the same frame. So this works even for the ordinary pattern of moving the emitter and firing it in
 * the same breath, which is exactly where doing it on the spot would use the place it was before.
 *
 * @example
 * ```ts
 * const pointer = usePointer();
 * declare const sparks: TParticles;
 *
 * pointer.onDown((info) => {
 *     sparks.transform.x = info.worldX;
 *     sparks.transform.y = info.worldY;
 *     emitParticles(sparks, 40);
 * });
 * ```
 *
 * @param emitter - The emitter, as `createParticles` or `createParticles3d` gave it back.
 * @param count - How many to make now.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const emitParticles = (emitter: TParticles | TParticles3d, count: number): void => {
    const state = particleStateOf(emitter);
    if (state !== null && count > 0) {
        state.pending += Math.floor(count);
    }
};
