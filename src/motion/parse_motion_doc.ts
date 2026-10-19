import { asRecord } from '../utils';
import { isMotionEase } from './motion_eases';
import { MOTION_FORMAT, MOTION_VERSION } from './types/t_motion_doc';
import { findPostBuiltin } from '../post/builtin/catalog';
import { MATERIAL_LOOKS } from '../shader_composer/surface/looks';
import type { TMotionDoc, TMotionEvent, TMotionKey, TMotionTrack, TMotionTransition } from './types/t_motion_doc';

const TRANSITIONS = new Set(['fade', 'wipe', 'iris', 'pixelate']);

/**
 * Every refusal goes through here, so the file always names itself.
 */
const fail = (src: string, message: string): never => {
    throw new Error(`[NacatamalOn] motion "${src}": ${message}`);
};

const isTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

const readKey = (raw: unknown, src: string, where: string): TMotionKey => {
    const key = asRecord(raw) ?? fail(src, `${where}: a key is { "t": seconds, "v": value }.`);
    if (!isTime(key.t)) {
        fail(src, `${where}: "t" has to be the seconds from the start, 0 or more, and it is ${JSON.stringify(key.t)}.`);
    }
    if (!((typeof key.v === 'number' && Number.isFinite(key.v)) || typeof key.v === 'boolean')) {
        fail(src, `${where}: "v" has to be a number, true or false, and it is ${JSON.stringify(key.v)}.`);
    }
    const read: TMotionKey = { t: key.t as number, v: key.v as number | boolean };
    if (key.ease !== undefined) {
        if (isMotionEase(key.ease)) {
            read.ease = key.ease;
        } else {
            // A curve this engine does not have is moved along in a straight line rather than refused:
            // the motion still plays, and the warning says what to put right.
            console.warn(`[NacatamalOn] motion "${src}": ${where} names the curve ${JSON.stringify(key.ease)}, which does not exist, so it moves in a straight line. The curves are linear, easeInQuad, easeOutBounce and the rest of the easing names.`);
        }
    }
    return read;
};

const readTrack = (raw: unknown, src: string, index: number): TMotionTrack => {
    const where = `track ${index + 1}`;
    const track = asRecord(raw) ?? fail(src, `${where} has to be an object with its "box", "path" and "keys".`);
    const post = typeof track.post === 'string' && track.post !== '' ? track.post : undefined;
    if (post === undefined && (typeof track.box !== 'string' || track.box === '')) {
        fail(src, `${where} has to name its "box", by the id the scene gives it, or the screen effect it moves as "post".`);
    }
    if (typeof track.path !== 'string' || track.path === '') {
        fail(src, `${where} has to say which field it moves, as "path" ("x", "zoom", "tint.a").`);
    }
    if (!Array.isArray(track.keys) || track.keys.length === 0) {
        fail(src, `${where} has to have at least one key.`);
    }
    // In order of time whatever order they were written in, the earlier of two at the same moment
    // first: sorting is stable.
    const keys = (track.keys as unknown[]).map((key, k) => readKey(key, src, `${where}, key ${k + 1}`)).sort((a, b) => a.t - b.t);
    return {
        box: typeof track.box === 'string' ? track.box : '',
        ...(typeof track.name === 'string' ? { name: track.name } : {}),
        ...(typeof track.component === 'string' && track.component !== '' ? { component: track.component } : {}),
        ...(post !== undefined ? { post } : {}),
        path: track.path as string,
        keys,
    };
};

/**
 * The path a track of a file written before the knobs were renamed (version `1`) has now: a screen
 * effect's knob by the effect's own `renamed` (a track names the effect, which is called after its
 * key unless a project named it otherwise), and a look's knob on a model's material by the look's
 * (`rimStrength`, `rim2Strength`, `mangaDotsSpacing`). `null` when nothing in it was renamed.
 */
const renamedPath = (track: TMotionTrack): string | null => {
    const parts = track.path.split('.');
    if (parts.length !== 2 || parts[0] !== 'uniforms') {
        return null;
    }
    const knob = parts[1]!;
    if (track.post !== undefined) {
        const now = findPostBuiltin(track.post)?.renamed?.[knob];
        return now === undefined ? null : `uniforms.${now}`;
    }
    const cap = (word: string): string => word[0]!.toUpperCase() + word.slice(1);
    for (const info of MATERIAL_LOOKS) {
        for (const [old, now] of Object.entries(info.renamed ?? {})) {
            const found = new RegExp(`^${info.key}(\\d*)${cap(old)}$`).exec(knob);
            if (found !== null) {
                return `uniforms.${info.key}${found[1]}${cap(now)}`;
            }
        }
    }
    return null;
};

const readTransition = (raw: unknown, src: string, where: string): TMotionTransition | undefined => {
    if (raw === undefined) {
        return undefined;
    }
    const transition = asRecord(raw);
    if (transition === null || !TRANSITIONS.has(transition.type as string)) {
        fail(src, `${where}: "transition" has to be { "type": "fade" | "wipe" | "iris" | "pixelate", "ms": 400 }.`);
    }
    const read: TMotionTransition = { type: (transition as Record<string, unknown>).type as TMotionTransition['type'] };
    const ms = (transition as Record<string, unknown>).ms;
    if (ms !== undefined) {
        if (!isTime(ms)) {
            fail(src, `${where}: the transition's "ms" has to be the milliseconds it takes.`);
        }
        read.ms = ms as number;
    }
    return read;
};

const readEvent = (raw: unknown, src: string, index: number): TMotionEvent => {
    const where = `event ${index + 1}`;
    const event = asRecord(raw) ?? fail(src, `${where} has to be an object with its "t" and "kind".`);
    if (!isTime(event.t)) {
        fail(src, `${where}: "t" has to be the seconds from the start, 0 or more.`);
    }
    const t = event.t as number;
    switch (event.kind) {
        case 'sound':
            if (typeof event.box !== 'string' || typeof event.component !== 'string') {
                fail(src, `${where}: a sound names its "box" and the sound's "component", by their ids.`);
            }
            return {
                t,
                kind: 'sound',
                box: event.box as string,
                ...(typeof event.name === 'string' ? { name: event.name } : {}),
                component: event.component as string,
            };
        case 'scene': {
            if (typeof event.scene !== 'string' || event.scene === '') {
                fail(src, `${where}: a scene change names the "scene" it goes to.`);
            }
            const transition = readTransition(event.transition, src, where);
            return { t, kind: 'scene', scene: event.scene as string, ...(transition !== undefined ? { transition } : {}) };
        }
        case 'mark':
            if (typeof event.name !== 'string' || event.name === '') {
                fail(src, `${where}: a mark has a "name", which a behaviour listens for.`);
            }
            return { t, kind: 'mark', name: event.name as string };
        default:
            return fail(src, `${where}: "kind" has to be "sound", "scene" or "mark", and it is ${JSON.stringify(event.kind)}.`);
    }
};

/**
 * Reads the contents of a `.motion` file, already parsed from JSON, into a motion.
 *
 * It refuses what it could not play (another format, a track with no keys, a key with no time) with
 * an error that names the file. The keys of each track come back in order of time, and a curve with a
 * name the engine does not have is warned about and moved along in a straight line. Whether each
 * track's box and field exist is not known here: that is answered when it plays in a scene.
 *
 * @param raw - The file's JSON.
 * @param src - Where it came from, for the errors.
 * @returns The motion.
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const parseMotionDoc = (raw: unknown, src = 'motion'): TMotionDoc => {
    const file = asRecord(raw) ?? fail(src, 'a motion is a JSON object, with its duration, tracks and events.');
    if (file.format !== MOTION_FORMAT) {
        fail(src, `it does not say it is a motion: "format" has to be "${MOTION_FORMAT}", and it is ${JSON.stringify(file.format)}.`);
    }
    const version = typeof file.version === 'number' ? file.version : MOTION_VERSION;
    if (version > MOTION_VERSION) {
        console.warn(`[NacatamalOn] motion "${src}" is version ${version}, newer than this engine reads (${MOTION_VERSION}). What it can read plays.`);
    }
    if (typeof file.duration !== 'number' || !Number.isFinite(file.duration) || file.duration <= 0) {
        fail(src, `"duration" has to be how long it lasts in seconds, above 0, and it is ${JSON.stringify(file.duration)}.`);
    }
    if (file.tracks !== undefined && !Array.isArray(file.tracks)) {
        fail(src, '"tracks" has to be a list.');
    }
    if (file.events !== undefined && !Array.isArray(file.events)) {
        fail(src, '"events" has to be a list.');
    }
    let tracks = ((file.tracks ?? []) as unknown[]).map((track, i) => readTrack(track, src, i));
    // Written before the knobs were renamed: read with the names they have now, and said once.
    const moved: string[] = [];
    if (version < 2) {
        tracks = tracks.map((track) => {
            const path = renamedPath(track);
            if (path === null) {
                return track;
            }
            moved.push(`'${track.path}' as '${path}'`);
            return { ...track, path };
        });
    }
    if (moved.length > 0) {
        console.warn(
            `[NacatamalOn] motion "${src}" was written before some knobs were renamed, so it reads ${moved.join(', ')}. ` +
            'Saving it writes the new names.',
        );
    }
    return {
        format: MOTION_FORMAT,
        version: moved.length > 0 ? MOTION_VERSION : version,
        duration: file.duration as number,
        ...(file.loop === true ? { loop: true } : {}),
        tracks,
        events: ((file.events ?? []) as unknown[]).map((event, i) => readEvent(event, src, i)).sort((a, b) => a.t - b.t),
    };
};
