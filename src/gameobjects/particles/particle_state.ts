import { createParticleState } from './particle_pool';
import type { TParticles } from './types/t_particles';
import type { TParticles3d } from './types/t_particles_3d';
import type { TChildParticles, TParticleState } from './types/t_particle_pool';
import type { TParticlesFile } from '../../loaders/particles/types/t_particles_file';
import { dropIdle, hold } from '../../loaders/asset_holds';

/**
 * What each emitter owns beyond its record, found by the record rather than kept in it.
 *
 * A record here is JSON and nothing else, and this is typed arrays, a stream of chance and a buffer
 * bound for the card. Keeping it out is what lets an emitter be written to a scene file at all: what
 * would be written is the record, and every field of it survives `JSON.stringify`.
 *
 * A `WeakMap`, so an emitter nobody holds any more takes its particles with it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
const states = new WeakMap<TParticles | TParticles3d, TParticleState>();

/**
 * Emitters already told they follow a file of the other dimension, so it is said once, not every frame.
 */
const mismatched = new WeakSet<TParticles | TParticles3d>();

/**
 * What to say about an effect handed to the maker for the other dimension, by the maker it needed.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const wrongDimension = (src: string, kind: 'particles-2d' | 'particles-3d'): string =>
    `'${src}' is a ${kind} effect, so it is made with ${kind === 'particles-3d' ? 'createParticles3d' : 'createParticles'}.`;

/**
 * Gives an emitter its working state, which can only happen once its file says how big to make it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const openParticleState = (emitter: TParticles | TParticles3d): TParticleState | null => {
    const doc = emitter.file.doc;
    if (doc === null) {
        return null;
    }
    // Made for the other dimension. When the file was already here the emitter was refused as it
    // was made; this is the one that arrived later, so all that can be done is say so and draw
    // nothing, rather than scatter a flat effect through space or flatten a deep one.
    const wanted = emitter.type === 'particles-3d' ? 'particles-3d' : 'particles-2d';
    if (doc.kind !== wanted) {
        if (!mismatched.has(emitter)) {
            mismatched.add(emitter);
            console.warn(`[NacatamalOn] ${wrongDimension(emitter.file.src, doc.kind)} Until then it draws nothing.`);
        }
        return null;
    }
    const existing = states.get(emitter);
    if (existing !== undefined) {
        return existing;
    }
    const state = createParticleState(doc, emitter.seed, emitter.file);
    state.children = childrenOf(emitter.file);
    states.set(emitter, state);
    return state;
};

/**
 * The effects a file's particles set off, each waiting for its own particles until its file is here.
 * One with no file (refused by the loader, or newly named by an edit) is left out.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const childrenOf = (file: TParticlesFile): TChildParticles[] => {
    const out: TChildParticles[] = [];
    (file.doc?.children ?? []).forEach((child, index) => {
        const childFile = file.children[index] ?? null;
        if (childFile !== null) {
            out.push({ on: child.on, count: child.count, file: childFile, state: null });
        }
    });
    return out;
};

/**
 * What an emitter is working with, or `null` while its file is still on its way.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const particleStateOf = (emitter: TParticles | TParticles3d): TParticleState | null => states.get(emitter) ?? null;

/**
 * Lets go of everything an emitter owned. Called when it leaves the tree, and when a new document
 * needs its particles made again.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const closeParticleState = (emitter: TParticles | TParticles3d): void => {
    states.delete(emitter);
};

/**
 * Takes an emitter that left the tree off its file's list. A file is kept by the cache for as long
 * as the game runs, so an emitter left on it would be held for ever, and one destroyed while the file
 * was still on its way would have its particles made for it when the file lands.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const unbindParticles = (emitter: TParticles | TParticles3d): void => {
    const { file } = emitter;
    const at = file.bound.indexOf(emitter);
    if (at >= 0) {
        file.bound.splice(at, 1);
    }
    // An effect written in code holds its sheet, its picture and what it sets off only while it is
    // drawn: with its last emitter gone, it lets go of its place on them, and is taken on again if it
    // is used again.
    dropIdle(file);
};

/**
 * Puts an emitter on its file's list, where the loader finds it when the file lands, and notes the
 * file again as using its sheet, its picture and what it sets off: an effect written in code used
 * again after its last emitter went.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const bindParticles = (emitter: TParticles | TParticles3d): void => {
    const { file } = emitter;
    file.bound.push(emitter);
    if (file.atlas !== null && 'type' in file.atlas) {
        hold(file.atlas, file);
    }
    if (file.texture !== null) {
        hold(file.texture, file);
    }
    for (const child of file.children) {
        if (child !== null) {
            hold(child, file);
        }
    }
};
