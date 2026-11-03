import { markWatchable } from '../../store/record_version';
import { childFileFor, particlesAtlas, particlesTexture } from './load_particles';
import { noteSheetUser } from '../sheet_users';
import { wearPicture } from '../worn_pictures';
import { parseParticlesDoc } from './parse_particles_doc';
import type { TParticlesEffect } from './types/t_particles_effect';
import type { TParticlesFile } from './types/t_particles_file';
import type { TRuntimeStore } from '../../store';

/**
 * What an effect written in code is called, in warnings and wherever a file would give its path.
 * Its children and its picture are found from the page, which is where a path written in code is
 * read from everywhere else too.
 */
const IN_CODE = '(effect in code)';

/**
 * One file per effect object, so the same object handed to ten emitters is read once and shared,
 * the way ten emitters naming one file share it. Weak, so an effect the game let go of goes with it.
 */
const files = new WeakMap<TParticlesEffect, TParticlesFile>();

/**
 * The files made here, which have no file behind them to write into a scene.
 */
const fromCode = new WeakMap<TParticlesFile, TParticlesEffect>();

/**
 * The file for an effect written in code: read now, ready now, never downloaded.
 *
 * It is not kept among the game's loaded effects, because it has no name to be found by; holding
 * the object is how it is reused.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const fileFromEffect = (store: TRuntimeStore, effect: TParticlesEffect): TParticlesFile => {
    const known = files.get(effect);
    if (known !== undefined) {
        // Used again after its sheet was let go of, while nothing drew it: asked for afresh, as the
        // first time, when it names it by path. One the game handed over is the game's to load again.
        const sheet = known.atlas;
        if (typeof effect.atlas === 'string' && sheet !== null && 'type' in sheet && sheet.status === 'released') {
            known.atlas = particlesAtlas(store, IN_CODE, effect.atlas, known, true);
        }
        // Its picture the same.
        if (typeof effect.texture === 'string' && known.texture !== null && known.texture.status === 'released') {
            known.texture = particlesTexture(store, IN_CODE, effect.texture);
            wearPicture(known.texture, known, true);
        }
        // And what it sets off.
        if (known.children.some((child) => child !== null && child.status === 'released')) {
            known.children = (known.doc?.children ?? []).map((child) => childFileFor(store, known, child.src, true));
        }
        return known;
    }

    // A texture, a sheet or a run made in code is not something a file could say, so each is taken
    // out before reading and laid on afterwards.
    const { texture: picture, atlas: sheet, anim: run } = effect;
    const doc = parseParticlesDoc({
        ...effect,
        texture: typeof picture === 'string' ? picture : null,
        atlas: typeof sheet === 'string' ? sheet : null,
        anim: typeof run === 'string' ? run : null,
    }, IN_CODE);
    const file: TParticlesFile = markWatchable({
        type: 'particles-file',
        key: IN_CODE,
        src: IN_CODE,
        status: 'ready',
        doc,
        texture: null,
        atlas: null,
        // `frame` wins over a run, as it does in a file.
        clip: run !== null && typeof run === 'object' && (effect.frame === undefined || effect.frame === null) ? run : null,
        bound: [],
        children: [],
    });
    if (typeof sheet === 'string' && sheet.trim() !== '') {
        file.atlas = particlesAtlas(store, IN_CODE, sheet, file, true);
    } else if (sheet !== null && sheet !== undefined && typeof sheet === 'object') {
        file.atlas = sheet;
        if ('type' in sheet) {
            // A sheet the game loaded, which letting go of a file on the same sheet must leave
            // while this effect is drawn.
            noteSheetUser(sheet, file, true);
        }
    } else if (typeof picture === 'string' && picture.trim() !== '') {
        file.texture = particlesTexture(store, IN_CODE, picture);
        // A picture from the cache, which letting go of a model wearing it must leave while this
        // effect is drawn.
        wearPicture(file.texture, file, true);
    } else if (picture !== null && picture !== undefined && typeof picture === 'object') {
        file.texture = picture;
        // The game's own picture, which letting go of must leave while this effect is drawn, as it
        // does one named by its path.
        wearPicture(picture, file, true);
    }
    file.children = doc.children.map((child) => childFileFor(store, file, child.src, true));

    files.set(effect, file);
    fromCode.set(file, effect);
    return file;
};

/**
 * Whether this effect was written in code rather than loaded from a file.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const isEffectFromCode = (file: TParticlesFile): boolean => fromCode.has(file);

/**
 * The effect written in code a file was made from, or `undefined` for one loaded from a file.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const effectFromCode = (file: TParticlesFile): TParticlesEffect | undefined => fromCode.get(file);
