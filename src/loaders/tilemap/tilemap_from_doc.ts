import { bumpVersion } from '../../store/record_version';
import { drop, hold } from '../asset_holds';
import { trackLoad, whenLoaded } from '../track_load';
import { fillTilemap } from './load_tilemap';
import { newTilemap } from './new_tilemap';
import { parseTilemapDoc } from './parse_tilemap_doc';
import { TILEMAP_FORMAT } from './types/t_tilemap_doc';
import type { TSpriteAtlas } from '../../atlas';
import type { TAnimationClip } from '../../hooks';
import type { TTilemap, TTilemapCodeDoc } from '../../gameobjects/tilemap/types/t_tilemap';
import type { TLoadedAtlas } from '../atlas/types/t_loaded_atlas';
import type { TTilemapDoc } from './types/t_tilemap_doc';

/**
 * Refuses a run that could not be played. A file's are checked when the file is read, and these have
 * no file: a pace that is no positive number would turn a tile's clock into a loop that never ends.
 */
const checkRuns = (sequences: Record<string, TAnimationClip>): void => {
    for (const [name, run] of Object.entries(sequences)) {
        const frames: unknown = run?.frames;
        if (!Array.isArray(frames) || frames.length === 0 || frames.some((frame) => !Number.isInteger(frame) || (frame as number) < 0)) {
            throw new Error(`[NacatamalOn] createTilemap: the run '${name}' has frames ${JSON.stringify(frames)}. Give it a list of whole frame numbers, from 0.`);
        }
        if (run.fps !== undefined && !(Number.isFinite(run.fps) && run.fps > 0)) {
            throw new Error(`[NacatamalOn] createTilemap: the run '${name}' has a pace of ${String(run.fps)}. Give it a number of frames per second above 0, or leave fps out.`);
        }
    }
};

/**
 * Says what a map's tiles ask of its sheet that the sheet does not have.
 *
 * A file's map with one of these is content, and draws a hole in peace. Here whoever wrote the
 * numbers is usually looking at the code that made them, and a hole with no word about it is the
 * slowest way to find out one was off by one.
 */
const warnAboutMissingFrames = (doc: TTilemapDoc, sheet: TLoadedAtlas): void => {
    const missing: string[] = [];
    for (const [id, tile] of Object.entries(doc.tiles)) {
        if (tile.anim !== undefined) {
            const run = sheet.sequences[tile.anim];
            if (run === undefined) {
                missing.push(`tile ${id} cycles '${tile.anim}'`);
            } else if (run.frames.some((frame) => frame >= sheet.frames)) {
                missing.push(`tile ${id} cycles '${tile.anim}', with frames ${run.frames.join(', ')}`);
            }
        } else if (typeof tile.frame === 'string') {
            if (sheet.names?.[tile.frame] === undefined) {
                missing.push(`tile ${id} shows the frame '${tile.frame}'`);
            }
        } else if (!Number.isInteger(tile.frame) || tile.frame! < 0 || tile.frame! >= sheet.frames) {
            missing.push(`tile ${id} shows frame ${String(tile.frame)}`);
        }
    }
    if (missing.length > 0) {
        console.warn(`[NacatamalOn] createTilemap: ${missing.join(', ')}, and its sheet of ${sheet.frames} frames has no such thing. Those cells draw nothing. Check the numbers, or give the runs in sequences.`);
    }
};

/**
 * Makes a map from a document in code, with its sheet as an object.
 *
 * What is wrong with the document throws, unlike a file's: the code asking for it is what has to
 * change, and it is there to hear about it. The sheet is the one thing that can still be on its way
 * (a picture or an atlas loaded from a file), and then the map waits for it as one from a file does;
 * otherwise it is ready at once.
 *
 * @returns The map, and what ends it for good.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const tilemapFromDoc = (
    doc: TTilemapCodeDoc,
    atlas: TSpriteAtlas | TLoadedAtlas,
    sequences: Record<string, TAnimationClip> | undefined,
): { map: TTilemap; letGo: () => void } => {
    if (typeof atlas !== 'object' || atlas === null || atlas.texture === undefined) {
        throw new Error('[NacatamalOn] createTilemap: a map written in code needs its atlas as an object. Make it with createSpriteAtlas, or load it with useLoadAtlas.');
    }
    const loaded = 'type' in atlas ? atlas : null;
    if (loaded !== null && sequences !== undefined) {
        throw new Error(`[NacatamalOn] createTilemap: sequences were given with the sheet '${loaded.src}', which has its own. Write them in its .atlas file, or use createSpriteAtlas.`);
    }
    if (sequences !== undefined) {
        checkRuns(sequences);
    }
    const parsed = parseTilemapDoc({
        ...doc,
        format: doc?.format ?? TILEMAP_FORMAT,
        kind: doc?.kind ?? 'tilemap',
        // The sheet is the object given with it, so there is nothing for a path to say.
        atlas: 'given with it',
    }, 'the doc given to createTilemap');

    const map = newTilemap('');
    // A grid is plain arithmetic, so it has nothing to wait for but its picture. Made into the record
    // a map reads, which is in no cache: nothing else can find it, or let go of it.
    const sheet: TLoadedAtlas = loaded ?? {
        type: 'atlas',
        key: '',
        src: '',
        status: 'ready',
        texture: atlas.texture,
        columns: atlas.columns,
        rows: atlas.rows,
        frames: atlas.frames,
        ...(atlas.rects !== undefined ? { rects: atlas.rects } : {}),
        sequences: { ...sequences },
    };
    if (loaded !== null) {
        hold(loaded, map);
    }
    const letGo = (): void => {
        map.status = 'released';
        bumpVersion(map);
        if (loaded !== null) {
            drop(loaded, map);
        }
    };
    const fill = (): void => {
        fillTilemap(map, parsed, sheet);
        warnAboutMissingFrames(parsed, sheet);
    };

    const waitedFor = loaded ?? atlas.texture;
    if (waitedFor.status === 'ready') {
        fill();
        return { map, letGo };
    }

    trackLoad(map, whenLoaded(waitedFor).then(() => {
        // Its object went while it waited: nothing more is wanted of it.
        if (map.status === 'released') {
            return;
        }
        if (waitedFor.status === 'ready') {
            fill();
            return;
        }
        map.status = 'error';
        bumpVersion(map);
        if (loaded !== null) {
            drop(loaded, map);
        }
        console.warn(`[NacatamalOn] createTilemap: the sheet of a map written in code could not be loaded ('${waitedFor.src}'). It draws nothing.`);
    }));
    return { map, letGo };
};
