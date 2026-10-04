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
 * Every field but `gltf`'s `src` may be left out, and leaving one out means its default, exactly as
 * calling `useCubeGeometry({})` does. So the smallest cube is `{ kind: 'cube' }`.
 *
 * @category Geometry
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGeometrySource =
    | { kind: 'cube'; width?: number; height?: number; depth?: number }
    | { kind: 'plane'; width?: number; depth?: number; widthSegments?: number; depthSegments?: number }
    | { kind: 'circle'; radius?: number; segments?: number }
    | { kind: 'uvSphere'; radius?: number; segments?: number; rings?: number }
    | { kind: 'icoSphere'; radius?: number; subdivisions?: number }
    | { kind: 'cylinder'; radius?: number; height?: number; segments?: number }
    | { kind: 'cone'; radius?: number; height?: number; segments?: number }
    | { kind: 'torus'; radius?: number; tube?: number; radialSegments?: number; tubularSegments?: number }
    /**
     * A shape read out of a model file. `node` picks one part of it; left out, the file is taken whole.
     */
    | { kind: 'gltf'; src: string; node?: string };
