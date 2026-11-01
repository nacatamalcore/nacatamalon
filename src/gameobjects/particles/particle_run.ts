import { atlasFrame } from '../../atlas/atlas_frame';
import { clipRepeats, DEFAULT_CLIP_FPS, runLength, runPlace } from '../../hooks/animation/run_place';
import type { TAnimationClip } from '../../hooks/animation/types/t_sprite_animation';
import type { TLoadedAtlas } from '../../loaders/atlas/types/t_loaded_atlas';
import type { TSpriteAtlas } from '../../atlas/types/t_sprite_atlas';
import type { TParticleAnimPace, TParticlesDoc } from '../../loaders/particles/types/t_particles_doc';
import type { TParticlesFile } from '../../loaders/particles/types/t_particles_file';

/**
 * The frames an effect's particles show, worked out once from its sheet: the window of every
 * picture of its run, and how the run is walked.
 *
 * Only the run's own pictures are kept, once each and in its order. How many times it goes and
 * which way is worked out from a particle's age (`runPlace`), not laid out in advance: a run that
 * repeats fifty times costs what one that does not costs.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParticleRun = {
    /**
     * Four numbers per picture of the run: where its window starts in the sheet, and how wide and
     * tall it is, in 0-1.
     */
    windows: Float32Array;
    count: number;
    yoyo: boolean;
    /**
     * How many extra times it goes at its own pace, `Infinity` for ever.
     */
    repeats: number;
    /**
     * The same over a life, where for ever means once: a life always ends.
     */
    lifeRepeats: number;
    /**
     * How many pictures it shows over a life, every showing counted.
     */
    lifeLength: number;
    fps: number;
    pace: TParticleAnimPace;
};

type TSheet = TLoadedAtlas | TSpriteAtlas;

/**
 * What each file was last worked out against, so it is worked out again only when its sheet, its
 * document (an editor applies a new one in place) or its run in code changes.
 */
const worked = new WeakMap<TParticlesFile, { sheet: TSheet; frames: number; doc: TParticlesDoc; clip: TAnimationClip | null; run: TParticleRun | null }>();

/**
 * What has been said about each file, so a mistake in one is said once and not every frame.
 */
const told = new WeakMap<TParticlesFile, Set<string>>();

const tell = (file: TParticlesFile, message: string): void => {
    let said = told.get(file);
    if (said === undefined) {
        said = new Set();
        told.set(file, said);
    }
    if (!said.has(message)) {
        said.add(message);
        console.warn(`[NacatamalOn] particles "${file.src}" ${message}`);
    }
};

/**
 * Whether a sheet can be cut yet. One from a file has to have landed; one cut in code always can.
 */
const sheetReady = (sheet: TSheet): boolean =>
    ('status' in sheet ? sheet.status === 'ready' : true) && sheet.frames > 0;

/**
 * The place in the sheet a frame asked for by number or name stands for, or `null` for one it does
 * not have.
 */
const frameNumber = (sheet: TSheet, wanted: number | string): number | null => {
    if (typeof wanted === 'number') {
        return Number.isInteger(wanted) && wanted >= 0 && wanted < sheet.frames ? wanted : null;
    }
    // Its own names only: `'constructor'` is on every object and is not a frame.
    const names = 'names' in sheet ? sheet.names : undefined;
    const found = names !== undefined && Object.hasOwn(names, wanted) ? names[wanted] : undefined;
    return found !== undefined && Number.isInteger(found) && found >= 0 && found < sheet.frames ? found : null;
};

const describe = (sheet: TSheet): string => {
    const names = 'names' in sheet && sheet.names !== undefined ? Object.keys(sheet.names) : [];
    return names.length > 0
        ? `its sheet has frames 0 to ${sheet.frames - 1}, named ${names.join(', ')}`
        : `its sheet has frames 0 to ${sheet.frames - 1}, and no names`;
};

const single = (sheet: TSheet, frame: number, pace: TParticleAnimPace): TParticleRun => {
    const { uvOffset, uvScale } = atlasFrame(sheet, frame);
    return {
        windows: new Float32Array([uvOffset.x, uvOffset.y, uvScale.x, uvScale.y]),
        count: 1,
        yoyo: false,
        repeats: 0,
        lifeRepeats: 0,
        lifeLength: 1,
        fps: DEFAULT_CLIP_FPS,
        pace,
    };
};

/**
 * The run a file's particles play, or the one frame they show.
 */
const workOut = (file: TParticlesFile, sheet: TSheet, doc: TParticlesDoc): TParticleRun => {
    if (doc.frame !== null) {
        const frame = frameNumber(sheet, doc.frame);
        if (frame === null) {
            tell(file, `asks for frame ${JSON.stringify(doc.frame)}, and ${describe(sheet)}. The first frame is drawn until it asks for one the sheet has.`);
        }
        return single(sheet, frame ?? 0, doc.animPace);
    }

    let clip: TAnimationClip | null = file.clip;
    if (clip === null && doc.anim !== null) {
        const sequences = 'sequences' in sheet ? sheet.sequences : {};
        clip = Object.hasOwn(sequences, doc.anim) ? sequences[doc.anim] ?? null : null;
        if (clip === null) {
            const known = Object.keys(sequences);
            tell(file, `plays the run '${doc.anim}', which its sheet does not have (${known.length > 0 ? `it has ${known.join(', ')}` : 'it has none'}). The first frame is drawn until it names one the sheet has.`);
        }
    }
    if (clip === null) {
        return single(sheet, 0, doc.animPace);
    }

    const frames: number[] = [];
    for (const frame of clip.frames) {
        if (Number.isInteger(frame) && frame >= 0 && frame < sheet.frames) {
            frames.push(frame);
        } else {
            tell(file, `plays frame ${frame}, and ${describe(sheet)}. It is left out of the run until the sheet has it.`);
        }
    }
    if (frames.length === 0) {
        return single(sheet, 0, doc.animPace);
    }

    const windows = new Float32Array(frames.length * 4);
    frames.forEach((frame, i) => {
        const { uvOffset, uvScale } = atlasFrame(sheet, frame);
        windows.set([uvOffset.x, uvOffset.y, uvScale.x, uvScale.y], i * 4);
    });
    const count = frames.length;
    // With one picture there is no other way to come back, as for a sprite.
    const yoyo = (clip.yoyo ?? false) && count > 1;
    const repeats = clipRepeats(clip);
    const lifeRepeats = repeats === Infinity ? 0 : repeats;
    return {
        windows,
        count,
        yoyo,
        repeats,
        lifeRepeats,
        lifeLength: runLength(count, yoyo, lifeRepeats),
        fps: clip.fps ?? DEFAULT_CLIP_FPS,
        pace: doc.animPace,
    };
};

/**
 * The frames a file's particles show, or `null` when it has no sheet, or its sheet has not landed
 * yet (or never will), which is when its particles are not drawn at all, as a sprite on a sheet
 * still on its way is not.
 *
 * Worked out the first time the sheet can be cut and kept until the sheet or the document changes,
 * so a name is looked up once and not once per particle per frame.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const particleRunOf = (file: TParticlesFile): TParticleRun | null => {
    const sheet = file.atlas;
    const doc = file.doc;
    if (sheet === null || doc === null || !sheetReady(sheet)) {
        return null;
    }
    const known = worked.get(file);
    if (known !== undefined && known.sheet === sheet && known.frames === sheet.frames && known.doc === doc && known.clip === file.clip) {
        return known.run;
    }
    const run = workOut(file, sheet, doc);
    worked.set(file, { sheet, frames: sheet.frames, doc, clip: file.clip, run });
    return run;
};

/**
 * Where in `run.windows` the picture a particle shows starts, from how long it has lived and how
 * long it gets.
 *
 * Every particle starts the run on its first picture the moment it is born. Over a life the run is
 * stretched so its last picture takes the last stretch of the life; at its own pace it moves on
 * `fps` times a second and rests on the picture it ended on.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const runWindowAt = (run: TParticleRun, age: number, life: number): number => {
    if (run.count === 1) {
        return 0;
    }
    // Anything but `'clip'` is the default, as the reader would have made it.
    if (run.pace !== 'clip') {
        const shown = Math.min(run.lifeLength - 1, Math.floor((age / life) * run.lifeLength));
        return runPlace(run.count, run.yoyo, run.lifeRepeats, Math.max(0, shown)) * 4;
    }
    return runPlace(run.count, run.yoyo, run.repeats, Math.max(0, Math.floor(age * run.fps))) * 4;
};

/**
 * Whether a file's particles wait for their sheet, and are not drawn until it is here.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const waitsForSheet = (file: TParticlesFile): boolean => file.atlas !== null && particleRunOf(file) === null;
