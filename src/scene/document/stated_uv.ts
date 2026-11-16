import type { TMeshMaterial } from '../../materials/types/t_material';

/**
 * What a scene document said of how a model piece's picture is laid, way by way, kept while the piece
 * waits for its file. Until the file lands the material holds the document's ways filled in with the
 * engine's defaults, so a `rotation: 0` the scene said (over the file's turn) cannot be told from one
 * it left out; saved then, it is written from this. A piece whose file never lands (a file that failed,
 * a node of another name) waits for ever, and is written from this every time.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TStatedUv = { scale?: { x?: number; y?: number }; rotation?: number; offset?: { x?: number; y?: number } };

const stated = new WeakMap<TMeshMaterial, TStatedUv>();

/**
 * Remembers what a scene document said of a model piece's picture.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const rememberStatedUv = (material: TMeshMaterial, said: TStatedUv): void => {
    stated.set(material, said);
};

/**
 * What a scene document said of a model piece's picture, or `undefined` when it said nothing.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const statedUvOf = (material: TMeshMaterial): TStatedUv | undefined => stated.get(material);
