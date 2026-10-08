import { createRecord } from '../create_record';
import { getActiveBox, getActiveGame } from '../../store';
import { getColor } from '../../color';
import { openParticleState, wrongDimension } from './particle_state';
import { trackDrawableOwner } from '../../box';
import type { TParticles } from './types/t_particles';
import { fileFromEffect } from '../../loaders/particles/file_from_effect';
import type { TParticlesEffect } from '../../loaders/particles/types/t_particles_effect';
import type { TParticlesFile } from '../../loaders/particles/types/t_particles_file';
import type { TParticlesOptions } from './types/t_particles_options';

/**
 * The effect the options ask for: a loaded file, the name one was loaded under, or an effect written
 * in code. A name nothing was loaded under is a typo, never "no effect".
 *
 * Also refuses a file already known to be of the other dimension, while the mistake is still on the
 * line that made it. One that has not landed yet cannot be told apart, and is said when it lands.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const resolveEffect = (
    effect: TParticlesFile | TParticlesEffect | string,
    kind: 'particles2d' | 'particles3d',
    caller: string,
): TParticlesFile => {
    let found: TParticlesFile | undefined;
    if (typeof effect === 'object' && effect !== null && (effect as { type?: unknown }).type === 'particles-file') {
        found = effect as TParticlesFile;
    } else if (typeof effect === 'object' && effect !== null) {
        // Written in code: read on the spot, so a mistake in it is reported on the line that made it.
        const store = getActiveGame();
        if (store === null) {
            throw new Error(`[NacatamalOn] ${caller}: call it inside a scene body.`);
        }
        found = fileFromEffect(store, effect as TParticlesEffect);
    } else {
        found = getActiveGame()?.get('assets').particles.get(effect);
        if (found === undefined) {
            throw new Error(
                `[NacatamalOn] ${caller}: no effect loaded under key '${effect}'. ` +
                `Did you forget useLoadParticles({ src, key: '${effect}' })?`,
            );
        }
    }
    if (found.doc !== null && found.doc.kind !== kind) {
        throw new Error(`[NacatamalOn] ${caller}: ${wrongDimension(found.src, found.doc.kind)}`);
    }
    return found;
};

/**
 * Puts an emitter in the scene: a place that makes particles, following an effect from a file.
 *
 * The file says what the effect **is** and is shared, so three torches reading one document are
 * three emitters with their own particles, their own clock and their own stream of chance. What this
 * decides is where it is, what colour it is laid in, and whether it starts lit.
 *
 * **It appears at once and draws nothing until its file lands**, which is a working state and not a
 * half-built one: the emitter is already in the right place, so nothing that depends on where it is
 * has to wait for a download.
 *
 * @param options The effect to follow, and what this emitter decides for itself.
 * @returns The emitter, to move, to stop and to fire.
 *
 * @example
 * ```ts
 * const Level = () => {
 *     const fire = useLoadParticles({ src: '/effects/fire.particles' });
 *
 *     createParticles({ effect: fire, transform: { x: 150, y: 250 } });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createParticles = (options: TParticlesOptions): TParticles => {
    const box = getActiveBox();
    const store = getActiveGame();
    if (box === null || store === null) {
        throw new Error('[NacatamalOn] createParticles: call it inside a scene body.');
    }

    const file = resolveEffect(options.effect, 'particles2d', 'createParticles');
    const autoplay = options.autoplay ?? true;

    const emitter = createRecord('particles', {
        name: options.name ?? file.src,
        file,
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, ...options.transform },
        tint: options.tint ?? getColor('white'),
        alpha: options.alpha ?? 1,
        smooth: options.smooth,
        overrides: options.overrides,
        // `emitting` is where it is now and `autoplay` is what was asked for. They start the same
        // and part company the moment a script puts the torch out.
        emitting: autoplay,
        paused: false,
        autoplay,
        seed: options.seed ?? null,
        zIndex: options.zIndex,
        visible: options.visible ?? true,
        destroyed: false,
    }) as TParticles;

    box.drawables.push(emitter);
    trackDrawableOwner(emitter, box, store);

    // Waiting on the file, whether it is already here or still coming. The list is what the loader
    // walks when the bytes land, because only then is there a number to size the particles by.
    file.bound.push(emitter);
    if (file.status === 'ready') {
        openParticleState(emitter);
    }

    return emitter;
};
