/**
 * How the surfaces of a loaded model are made to face.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TShading = 'auto' | 'smooth' | 'flat';

// Kept beside the shapes, which work out their facings the same way a model file's are worked out.
export { computeNormals, splitPerCorner, toFlatShaded } from '../../geometry/build/normals';
