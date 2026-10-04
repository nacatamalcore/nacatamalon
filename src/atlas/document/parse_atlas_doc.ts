import { ATLAS_FORMAT } from './atlas_format';
import type { TAtlasDoc, TAtlasGridSpec, TAtlasPixelRect, TAtlasSequenceDoc } from './types/t_atlas_doc';

/**
 * Fails naming the file, so a typo reads as a problem with that file and not with the slicing.
 */
const fail = (src: string, message: string): never => {
    throw new Error(`[NacatamalOn] atlas "${src}": ${message}`);
};

/**
 * One run. Its frames are only checked for their type: whether frame 47 exists depends on how the
 * image is cut, which is known when it is cut, not here.
 */
const parseSequence = (src: string, name: string, raw: unknown): TAtlasSequenceDoc => {
    if (typeof raw !== 'object' || raw === null) {
        return fail(src, `sequence "${name}" must be an object.`);
    }
    const sequence = raw as Record<string, unknown>;
    if (!Array.isArray(sequence.frames) || sequence.frames.length === 0) {
        return fail(src, `sequence "${name}" needs a non-empty "frames" array.`);
    }
    for (const frame of sequence.frames) {
        if (typeof frame !== 'number' && typeof frame !== 'string') {
            return fail(src, `sequence "${name}" has a frame that is neither an index nor a name.`);
        }
    }
    if (sequence.fps !== undefined && (typeof sequence.fps !== 'number' || sequence.fps <= 0)) {
        return fail(src, `sequence "${name}" has a non-positive "fps".`);
    }
    // Only the type: whether a run by that name exists is a question about the whole file, and one
    // its author may be halfway through answering, so playing it is what reports a miss.
    if (sequence.next !== undefined && typeof sequence.next !== 'string') {
        return fail(src, `sequence "${name}" has a non-string "next".`);
    }

    return {
        frames: sequence.frames as Array<number | string>,
        ...(sequence.fps !== undefined ? { fps: sequence.fps as number } : {}),
        ...(sequence.loop !== undefined ? { loop: Boolean(sequence.loop) } : {}),
        ...(sequence.next !== undefined ? { next: sequence.next as string } : {}),
    };
};

/**
 * Reads an `.atlas` file, already parsed from JSON, and checks all of it at once.
 *
 * All of it and at once, rather than whatever a sprite happens to touch, because tools read these
 * files as much as games do: an editor has to say "this file is broken, here" while its author is
 * looking at it. Every message names `src`, since a project has many sheets and this is the last
 * place that knows which one it was.
 *
 * @param value The file's contents, parsed from JSON.
 * @param src Where it came from, for the messages.
 * @throws When the file is not an atlas this engine can read.
 * @returns The atlas, checked.
 *
 * @category Sprites
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const parseAtlasDoc = (value: unknown, src: string): TAtlasDoc => {
    if (typeof value !== 'object' || value === null) {
        return fail(src, 'must be a JSON object.');
    }
    const doc = value as Record<string, unknown>;

    if (doc.kind !== 'atlas') {
        return fail(src, `has kind ${JSON.stringify(doc.kind)}, expected "atlas".`);
    }
    if (typeof doc.format !== 'number') {
        return fail(src, 'is missing a numeric "format".');
    }
    if (doc.format > ATLAS_FORMAT) {
        return fail(src, `is format ${doc.format}, but this engine reads up to ${ATLAS_FORMAT}.`);
    }
    if (typeof doc.texture !== 'string' || doc.texture === '') {
        return fail(src, 'is missing a "texture" path.');
    }

    const hasGrid = doc.grid !== undefined;
    const hasPacked = doc.packed !== undefined;
    if (hasGrid === hasPacked) {
        return fail(src, 'needs exactly one of "grid" or "packed".');
    }

    const sequences: Record<string, TAtlasSequenceDoc> = {};
    if (doc.sequences !== undefined) {
        if (typeof doc.sequences !== 'object' || doc.sequences === null) {
            return fail(src, '"sequences" must be an object.');
        }
        for (const [name, raw] of Object.entries(doc.sequences)) {
            sequences[name] = parseSequence(src, name, raw);
        }
    }

    return {
        format: doc.format,
        kind: 'atlas',
        texture: doc.texture,
        ...(hasGrid ? { grid: doc.grid as TAtlasGridSpec } : {}),
        ...(hasPacked ? { packed: doc.packed as Record<string, TAtlasPixelRect> } : {}),
        sequences,
    };
};
