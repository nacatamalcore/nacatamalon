import type { TTransform3d } from '../../../gameobjects/types/t_transform_3d';

/**
 * One piece of a glTF file's tree, said with the engine's words: the shape a tool turns into a box
 * when it brings a model in.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGltfNodeInfo = {
    /**
     * The piece's name, which is also how a model asks for it. Empty when the file names nothing:
     * such a piece can still group others, but nothing can point at it, so a tool must not give it
     * a mesh.
     */
    name: string;
    /**
     * Where it sits relative to the piece above it.
     */
    transform: TTransform3d;
    /**
     * Whether it has something to draw. One that does not only groups the ones below it.
     */
    hasMesh: boolean;
    /**
     * Whether a rig deforms its mesh. A rigged piece has to come in as **one** box with everything
     * below it: there the bones own the placements, and splitting it would leave two owners writing
     * the same ones.
     */
    skinned: boolean;
    children: TGltfNodeInfo[];
};
