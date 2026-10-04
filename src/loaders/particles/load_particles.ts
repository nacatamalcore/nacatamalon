import { bumpVersion } from '../../store/record_version';
import { loadTexture } from '../texture/load_texture';
import { newTexture } from '../texture/new_texture';
import { openParticleState } from '../../gameobjects/particles/particle_state';
import { parseParticlesDoc } from './parse_particles_doc';
import { resolveAssetPath } from '../resolve_asset_path';
import { newParticlesFile } from './new_particles_file';
import type { TParticlesFile } from './types/t_particles_file';
import type { TRuntimeStore } from '../../store';

/**
 * Said once per file, never per emitter and never per frame.
 */
const warnUnsupported = (src: string, fields: string[]): void => {
    if (fields.length === 0) {
        return;
    }
    console.warn(
        `[NacatamalOn] particles "${src}" declares ${fields.join(' and ')}, which this version does ` +
        'not draw. The effect is drawn without it, and the file is left exactly as it was written.',
    );
};

/**
 * How deep effects may set off effects. Three is a firework whose sparks leave embers that leave
 * smoke, which is more than any effect of the era did; deeper is a mistake more often than a wish.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MAX_CHILD_DEPTH = 3;

/**
 * The file of one effect another one sets off, from the game's cache like any other, found next to
 * the file that names it. `null`, said once, for one that would lead back to a file already on the
 * way down, or one past `MAX_CHILD_DEPTH`: either would be a frame that never ends rather than an
 * error anybody could see.
 */
const childFileFor = (store: TRuntimeStore, parent: TParticlesFile, src: string, ancestors: readonly string[]): TParticlesFile | null => {
    const path = resolveAssetPath(parent.src, src);
    if (path === parent.src || ancestors.includes(path)) {
        console.warn(`[NacatamalOn] particles "${parent.src}" sets off "${path}", which leads back to itself. That child is left out.`);
        return null;
    }
    if (ancestors.length + 1 >= MAX_CHILD_DEPTH) {
        console.warn(`[NacatamalOn] particles "${parent.src}" sets off "${path}" more than ${MAX_CHILD_DEPTH} effects deep. That child is left out.`);
        return null;
    }
    const { particles } = store.get('assets');
    let file = particles.get(path);
    if (file === undefined) {
        file = newParticlesFile(path, path);
        particles.set(path, file);
        void loadParticles(store, file, [...ancestors, parent.src]);
    }
    return file;
};

/**
 * Fetches a `.particles` file, reads it, loads its picture, and hands it to everything waiting.
 *
 * The picture goes through the game's own cache, so two effects sharing one image fetch it once, and
 * it is looked for **next to the file** rather than next to the page: an effect and its picture live
 * together, and moving the pair has to keep working.
 *
 * Never rejects. A file that is missing or that cannot be read ends as `'error'` with a warning, and
 * every emitter waiting on it goes on drawing nothing. An effect that did not arrive should cost you
 * the effect, not the scene.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const loadParticles = async (store: TRuntimeStore, file: TParticlesFile, ancestors: readonly string[] = []): Promise<void> => {
    try {
        const response = await fetch(file.src);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const doc = parseParticlesDoc(await response.json(), file.src);

        if (store.get('loop').destroyed) {
            return;
        }

        // A sheet is read and kept but not drawn yet: its particles are drawn without a picture.
        warnUnsupported(file.src, [...Object.keys(doc.unsupported), ...(doc.atlas !== null ? ['atlas'] : [])]);
        if (doc.collision !== null && !doc.worldSpace) {
            // Said once, here, rather than every frame the simulation skips it.
            console.warn(
                `[NacatamalOn] particles "${file.src}" says how it collides but travels with its ` +
                'emitter ("worldSpace": false), so its particles have no place of their own in the ' +
                'world to collide at. It is drawn without colliding.',
            );
        }

        if (doc.texture !== null) {
            const path = resolveAssetPath(file.src, doc.texture);
            const { textures } = store.get('assets');
            let texture = textures.get(path);
            if (texture === undefined) {
                texture = newTexture(path, path);
                textures.set(path, texture);
                void loadTexture(store, texture);
            }
            file.texture = texture;
        }

        // Asked for now and not waited on: the effect can start before the ones it sets off have
        // arrived, and those join in when they do.
        file.children = doc.children.map((child) => childFileFor(store, file, child.src, ancestors));
        file.doc = doc;
        file.status = 'ready';
        bumpVersion(file);

        // Everything built against this file can only be sized now, because only now is there a
        // number to size it by.
        for (const emitter of file.bound) {
            openParticleState(emitter);
        }
    } catch (error: unknown) {
        file.status = 'error';
        bumpVersion(file);
        console.warn(
            `[NacatamalOn] useLoadParticles: '${file.src}' could not be loaded. Emitters following ` +
            'it draw nothing.',
            error,
        );
    }
};
