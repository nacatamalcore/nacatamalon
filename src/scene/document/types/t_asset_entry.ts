import type { TGeometrySource } from '../../../geometry/types/t_geometry_source';

export type { TGeometrySource };

/**
 * One thing the scene needs loaded before it can be built, named by the key everything in the
 * document refers to it by.
 *
 * **The manifest exists so the loading can start before the tree does.** Every loader in this engine
 * registers its slot the moment it is asked and fills it in later, so walking this list first means
 * that by the time a sprite says "my texture is `hero`", `hero` is already there, possibly still
 * arriving. Without it, the first frame of a scene would be the frame that discovers what it needs.
 *
 * **A file is named, never inlined.** The pixels of an image, the text of a shader, the cells of a
 * map and the numbers of an effect all stay in their own file. A document that carried them would be
 * a document that goes stale the moment somebody edits the file, and a diff nobody can read.
 *
 * `key` is the name and `src` is where it is. They are usually the same string, and they are two
 * fields because they are two different jobs: one is what the scene calls it, the other is where it
 * is fetched from. Two scenes naming one file the same thing share one fetch.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TAssetEntry =
    | { type: 'geometry'; key: string; source: TGeometrySource }
    | { type: 'texture'; key: string; src: string }
    /**
     * A bitmap font, which is **two** files and not one: the metrics and the sheet. Two fields
     * rather than one guessed from the other, because the loader takes both and guessing which
     * extension goes with which is the sort of rule that works until somebody names a file oddly.
     */
    | { type: 'font'; key: string; json: string; atlas: string }
    | { type: 'atlas'; key: string; src: string }
    | { type: 'shader'; key: string; src: string }
    | { type: 'particles'; key: string; src: string }
    | { type: 'audio'; key: string; src: string }
    | { type: 'tilemap'; key: string; src: string };
