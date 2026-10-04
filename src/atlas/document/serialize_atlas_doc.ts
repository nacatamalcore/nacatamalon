import { ATLAS_FORMAT } from './atlas_format';
import type { TAtlasDoc } from './types/t_atlas_doc';

/**
 * Writes an atlas back as the text of its file: what a tool saves.
 *
 * The text and not an object, because the text is what has to come out the same: four spaces, a
 * newline at the end, and no empty `sequences` written where the author left none, so a file made
 * by hand stays the way it was made.
 *
 * @param doc - The atlas to write.
 * @returns The file's text.
 *
 * @category Sprites
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const serializeAtlasDoc = (doc: TAtlasDoc): string => {
    const out: Record<string, unknown> = {
        format: ATLAS_FORMAT,
        kind: 'atlas',
        texture: doc.texture,
    };
    if (doc.grid) {
        out.grid = doc.grid;
    }
    if (doc.packed) {
        out.packed = doc.packed;
    }
    if (doc.sequences && Object.keys(doc.sequences).length > 0) {
        out.sequences = doc.sequences;
    }

    return `${JSON.stringify(out, null, 4)}\n`;
};
