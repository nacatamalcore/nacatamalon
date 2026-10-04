import { createRecord } from '../create_record';
import { getActiveBox, getActiveGame } from '../../store';
import { getColor } from '../../color';
import { openParticleState } from './particle_state';
import { resolveEffect } from './create_particles';
import { trackDrawableOwner } from '../../box';
import type { TParticles3d } from './types/t_particles_3d';
import type { TParticles3dOptions } from './types/t_particles_3d_options';

/**
 * Where an emitter is when nobody said: on its box, unturned, at its own size.
 */
const NOWHERE = { x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 };

/**
 * Puts an emitter in a scene in three dimensions, following an effect written for them.
 *
 * The same thing `createParticles` is, one dimension up: the file says what the effect is and is
 * shared, and this decides where it is, what colour it is laid in and whether it starts lit. Each
 * particle is drawn as a square that **always faces the camera**, however the camera turns, and
 * hides behind the models in front of it without hiding the other particles.
 *
 * Its effect has to be a `particles3d` file. Handing it a flat one is refused, because every number
 * in that file is a pixel.
 *
 * @param options The effect to follow, and what this emitter decides for itself.
 * @returns The emitter, to move, to stop and to fire, with the same verbs as a flat one.
 *
 * @example
 * ```ts
 * const Campfire = () => {
 *     const fire = useLoadParticles({ src: '/effects/campfire3d.particles' });
 *
 *     createParticles3d({ effect: fire, transform: { y: 0.1 } });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createParticles3d = (options: TParticles3dOptions): TParticles3d => {
    const box = getActiveBox();
    const store = getActiveGame();
    if (box === null || store === null) {
        throw new Error('[NacatamalOn] createParticles3d: call it inside a scene body.');
    }

    const file = resolveEffect(options.effect, 'particles3d', 'createParticles3d');
    const autoplay = options.autoplay ?? true;

    const emitter = createRecord('particles3d', {
        name: options.name ?? file.src,
        file,
        transform: { ...NOWHERE, ...options.transform },
        tint: options.tint ?? getColor('white'),
        alpha: options.alpha ?? 1,
        smooth: options.smooth,
        overrides: options.overrides,
        // The same two as a flat emitter: where it is now, and what was asked for.
        emitting: autoplay,
        paused: false,
        autoplay,
        seed: options.seed ?? null,
        zIndex: options.zIndex,
        visible: options.visible ?? true,
        destroyed: false,
    }) as TParticles3d;

    box.drawables.push(emitter);
    trackDrawableOwner(emitter, box, store);

    file.bound.push(emitter);
    if (file.status === 'ready') {
        openParticleState(emitter);
    }

    return emitter;
};
