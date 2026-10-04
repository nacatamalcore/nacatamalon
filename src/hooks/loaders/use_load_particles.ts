import { getActiveBox, getActiveGame } from '../../store';
import { loadParticles, newParticlesFile } from '../../loaders/particles';
import { rootOf } from '../../box';
import { trackLoad } from '../../loaders/track_load';
import type { TParticlesFile } from '../../loaders/particles/types/t_particles_file';

/**
 * What `useLoadParticles` is asked for.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TUseLoadParticlesOptions = {
    /**
     * Where the `.particles` file is.
     */
    src: string;
    /**
     * What to keep it under, so another scene can reach the same one. Defaults to `src`.
     */
    key?: string;
};

/**
 * Loads an effect: what a puff of smoke or a shower of sparks is made of.
 *
 * The file is the effect and it is **shared**: three torches in a level are one document, read once,
 * with one picture behind it. Each of them is its own emitter with its own particles, its own clock
 * and its own run of luck.
 *
 * Handed back at once and filled in when it lands, like every other asset. Until then an emitter
 * following it draws nothing, which is what lets a scene appear before its effects do.
 *
 * @param options Where the file is, and what to keep it under.
 * @returns The effect, to hand to `createParticles`.
 *
 * @example
 * ```ts
 * const fire = useLoadParticles({ src: '/effects/fire.particles' });
 * createParticles({ effect: fire, transform: { x: 150, y: 250 } });
 * ```
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useLoadParticles = ({ src, key }: TUseLoadParticlesOptions): TParticlesFile => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw new Error('[NacatamalOn] useLoadParticles: call it inside a scene body.');
    }

    const cacheKey = key ?? src;
    const { particles } = store.get('assets');

    let file = particles.get(cacheKey);
    if (file === undefined) {
        file = newParticlesFile(src, cacheKey);
        particles.set(cacheKey, file);
        trackLoad(file, loadParticles(store, file));
    }

    const { loads } = rootOf(box);
    if (!loads.includes(file)) {
        loads.push(file);
    }

    return file;
};
