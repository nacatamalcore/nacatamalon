import { bumpVersion } from '../../store/record_version';
import { loadTexture } from '../texture/load_texture';
import { newTexture } from '../texture/new_texture';
import { openParticleState } from '../../gameobjects/particles/particle_state';
import { parseParticlesDoc } from './parse_particles_doc';
import { resolveAssetPath } from '../resolve_asset_path';
import { newParticlesFile } from './new_particles_file';
import type { TParticlesFile } from './types/t_particles_file';
import type { TRuntimeStore } from '../../store';
import type { TTexture } from '../texture/types/t_texture';
import { findAssetFile } from '../asset_key';
import { newAtlas } from '../atlas/new_atlas';
import { loadAtlas } from '../atlas/load_atlas';
import { trackLoad } from '../track_load';
import type { TLoadedAtlas } from '../atlas/types/t_loaded_atlas';
import { hold } from '../asset_holds';

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
 * How many times over effects may set off effects, below the first. Three is a firework whose sparks
 * leave embers that leave smoke, which is more than any effect of the era did; deeper is a mistake
 * more often than a wish.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MAX_CHILD_DEPTH = 3;

/**
 * The picture an effect names, found next to the file that names it, from the game's cache like any
 * other so two effects sharing one fetch it once.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const particlesTexture = (store: TRuntimeStore, fromSrc: string, src: string): TTexture => {
    const path = resolveAssetPath(fromSrc, src);
    const { textures } = store.get('assets');
    let texture = findAssetFile(textures, path);
    if (texture === undefined) {
        texture = newTexture(path, path);
        textures.set(path, texture);
        void loadTexture(store, texture);
    }
    return texture;
};

/**
 * The sheet an effect names, found next to the file that names it, from the game's cache like any
 * other: an effect, a map and the sprites the game loads it for share one sheet and fetch it once.
 * `by` is the effect's file, noted as using it; `drawn` for an effect written in code, which uses it
 * only while it has emitters.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const particlesAtlas = (store: TRuntimeStore, fromSrc: string, src: string, by: TParticlesFile, drawn = false): TLoadedAtlas => {
    const path = resolveAssetPath(fromSrc, src);
    const { atlases } = store.get('assets');
    let atlas = findAssetFile(atlases, path);
    if (atlas === undefined) {
        atlas = newAtlas(path, path);
        atlases.set(path, atlas);
        // Tracked, so a map or a scene asking for the same sheet while it is on its way waits for
        // this load instead of calling the sheet broken.
        trackLoad(atlas, loadAtlas(store, atlas));
    }
    // So letting go of another effect or a map on the same sheet leaves it for this one.
    hold(atlas, by, { whileDrawn: drawn });
    return atlas;
};

/**
 * How many different files one first file may have fetched below it, however they branch. Far past
 * anything an effect is made of, so none ever meets it: it is there for a file naming `sub/a.particles`
 * on a server that answers any path, which is a new file each time and would be fetched for ever.
 *
 * Different paths and not fetches: a game that lets a child go and asks for it again each level, for
 * as long as it runs, is asking for the same file.
 */
const MOST_FILES_BELOW = 256;

/**
 * The paths a first file and everything fetched below it have fetched, shared among them.
 */
const fetchedBelow = new WeakMap<TParticlesFile, { paths: Set<string>; said: boolean }>();

/**
 * Whether `file`, or an effect it sets off, or one those set off in turn, is `target`.
 *
 * Asked of the files and not of how they were written: one file can be named two ways, and two files
 * loaded apart know nothing of each other's way down. Whichever of them arrives second is the one
 * that closes the ring, and by then the first has its children to look through.
 */
const leadsTo = (file: TParticlesFile, target: TParticlesFile, seen: Set<TParticlesFile> = new Set()): boolean => {
    if (file === target) {
        return true;
    }
    if (seen.has(file)) {
        return false;
    }
    seen.add(file);
    return file.children.some((child) => child !== null && leadsTo(child, target, seen));
};

/**
 * The file of one effect another one sets off, from the game's cache like any other, found next to
 * the file that names it. `null`, said once, for one that would lead back to the file that names it,
 * or past `MOST_FILES_BELOW`.
 *
 * How deep an effect may reach is not asked here: how far a file is from the first effect depends on
 * which file was asked for first, and a file refused its children for that would keep the refusal when
 * asked for on its own. Particles stop at `MAX_CHILD_DEPTH` when they run, and say so there.
 *
 * @param store The runtime store of the game it belongs to.
 * @param parent The effect that names it.
 * @param src The path, as the effect wrote it.
 * @param drawn Whether `parent` is written in code, and so wants it only while it is drawn.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const childFileFor = (store: TRuntimeStore, parent: TParticlesFile, src: string, drawn = false): TParticlesFile | null => {
    const path = resolveAssetPath(parent.src, src);
    const { particles } = store.get('assets');
    let file = findAssetFile(particles, path);
    if (path === parent.src || (file !== undefined && leadsTo(file, parent))) {
        console.warn(`[NacatamalOn] particles "${parent.src}" sets off "${path}", which leads back to itself. That child is left out: take it out of the file.`);
        return null;
    }
    if (file === undefined) {
        const spent = fetchedBelow.get(parent) ?? { paths: new Set(), said: false };
        fetchedBelow.set(parent, spent);
        if (!spent.paths.has(path) && spent.paths.size >= MOST_FILES_BELOW) {
            if (!spent.said) {
                spent.said = true;
                console.warn(`[NacatamalOn] particles "${parent.src}" sets off "${path}", past ${MOST_FILES_BELOW} files fetched below the first file. The rest are left out: a path that keeps growing never ends, so check how it names its children.`);
            }
            return null;
        }
        spent.paths.add(path);
        file = newParticlesFile(path, path);
        fetchedBelow.set(file, spent);
        particles.set(path, file);
        void loadParticles(store, file);
    }
    hold(file, parent, { whileDrawn: drawn });
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
export const loadParticles = async (store: TRuntimeStore, file: TParticlesFile): Promise<void> => {
    try {
        const response = await fetch(file.src);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const doc = parseParticlesDoc(await response.json(), file.src);

        // A game that ended, or a file let go of while it was on its way: what it names is not
        // fetched for nobody.
        if (store.get('loop').destroyed || file.status === 'released') {
            return;
        }

        warnUnsupported(file.src, Object.keys(doc.unsupported));
        if (doc.collision !== null && !doc.worldSpace) {
            // Said once, here, rather than every frame the simulation skips it.
            console.warn(
                `[NacatamalOn] particles "${file.src}" says how it collides but travels with its ` +
                'emitter ("worldSpace": false), so its particles have no place of their own in the ' +
                'world to collide at. Drawn by an emitter, it does not collide; set off by another ' +
                'effect, it is born in the world and does.',
            );
        }

        // A sheet wins over a picture, so the picture is not fetched for nothing. Its frames are
        // worked out once it has landed, which can be after this file (see `particleRunOf`).
        if (doc.atlas !== null) {
            file.atlas = particlesAtlas(store, file.src, doc.atlas, file);
        } else if (doc.texture !== null) {
            file.texture = particlesTexture(store, file.src, doc.texture);
            hold(file.texture, file);
        }

        // Asked for now and not waited on: the effect can start before the ones it sets off have
        // arrived, and those join in when they do.
        file.children = doc.children.map((child) => childFileFor(store, file, child.src));
        file.doc = doc;
        file.status = 'ready';
        bumpVersion(file);

        // Everything built against this file can only be sized now, because only now is there a
        // number to size it by.
        for (const emitter of file.bound) {
            // One destroyed this frame is still on the list until the sweep takes it off.
            if (!emitter.destroyed) {
                openParticleState(emitter);
            }
        }
    } catch (error: unknown) {
        // Nobody is waiting for a file that was let go of, to hear that it did not arrive either.
        if (file.status === 'released') {
            return;
        }
        file.status = 'error';
        bumpVersion(file);
        console.warn(
            `[NacatamalOn] useLoadParticles: '${file.src}' could not be loaded. Emitters following ` +
            'it draw nothing.',
            error,
        );
    }
};
