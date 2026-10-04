import { markWatchable } from '../../store/record_version';
import type { TParticlesFile } from './types/t_particles_file';

/**
 * The empty effect record, handed back the moment one is asked for.
 *
 * No document yet, and that is a working state: an emitter with nothing to follow draws nothing and
 * takes up no room, so the first frames of a scene look like the scene before its effects arrive
 * rather than like a scene that is broken.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const newParticlesFile = (src: string, key: string): TParticlesFile => markWatchable({
    type: 'particles-file',
    key,
    src,
    status: 'loading',
    doc: null,
    texture: null,
    bound: [],
    children: [],
});
