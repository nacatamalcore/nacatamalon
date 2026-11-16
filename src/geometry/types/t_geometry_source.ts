import type { TGeometryUvOptions } from '../build/project_uvs';

/**
 * How a shape is made, when it was made rather than drawn by an artist.
 *
 * A recipe and not the corners themselves, which is the whole point: a cube is a handful of numbers
 * of description or a few hundred of vertex data, and the description is what a person edits, what a
 * diff shows and what survives the engine changing how it builds a cube.
 *
 * It is kept on the shape rather than worked out again from the key it was cached under. The key
 * does spell the recipe for every shape this engine builds (`cube:1:1:1`), but only until somebody
 * passes a key of their own, and then reading it back would be reading a name as if it were a fact.
 *
 * A shape this engine builds keeps `uvs` and `uvScale` too, when they were given
 * (`TGeometryUvOptions`). Every field but `gltf`'s `src` may be left out, and leaving one out means its default, exactly as
 * calling `useCubeGeometry({})` does. So the smallest cube is `{ kind: 'cube' }`.
 *
 * @category Geometry
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGeometrySource =
    | ({ kind: 'cube'; width?: number; height?: number; depth?: number; bevel?: { size: number; segments?: number } } & TGeometryUvOptions)
    | ({ kind: 'plane'; width?: number; depth?: number; widthSegments?: number; depthSegments?: number } & TGeometryUvOptions)
    | ({ kind: 'circle'; radius?: number; segments?: number } & TGeometryUvOptions)
    | ({ kind: 'uvSphere'; radius?: number; segments?: number; rings?: number } & TGeometryUvOptions)
    | ({ kind: 'icoSphere'; radius?: number; subdivisions?: number } & TGeometryUvOptions)
    | ({ kind: 'cylinder'; radius?: number; height?: number; segments?: number } & TGeometryUvOptions)
    | ({ kind: 'cone'; radius?: number; height?: number; segments?: number } & TGeometryUvOptions)
    | ({ kind: 'torus'; radius?: number; tube?: number; radialSegments?: number; tubularSegments?: number } & TGeometryUvOptions)
    | ({ kind: 'lathe'; profile: Array<{ x: number; y: number }>; segments?: number } & TGeometryUvOptions)
    | ({
        kind: 'extrude';
        outline: Array<{ x: number; y: number }>;
        holes?: Array<Array<{ x: number; y: number }>>;
        depth?: number;
        bevel?: { size: number; segments?: number };
        creaseAngle?: number;
    } & TGeometryUvOptions)
    /**
     * A piece of a model file. `node` is the name of the piece, `''` for one the file did not
     * name. `occurrence` is which of the pieces of that name, from 0 and 0 when left out: a node
     * drawn in two materials is two pieces with its name, and a file may name two nodes alike.
     *
     * They are counted in the order the file is walked: the nodes of its scene depth first, each
     * before the ones under it and those in the order the file lists them, then the pieces of each
     * in the order its mesh lists them, lines and points left out. So the same piece is found again
     * in the same file, and in one exported again as long as the pieces of its name keep their
     * order and how many there are: one more material on an earlier node of the same name moves
     * the number of every piece of that name after it.
     *
     * With neither `node` nor `occurrence`, the first piece of the file, as documents saved before
     * `node` could be empty meant. An `occurrence` with no `node` is not read.
     */
    | { kind: 'gltf'; src: string; node?: string; occurrence?: number };
