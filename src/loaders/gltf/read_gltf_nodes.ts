import * as mat from '../../math/mat4';
import type { TGltfDoc } from './types/t_gltf_doc';
import type { TGltfNodeInfo } from './types/t_gltf_node_info';

/**
 * Reads the tree of a `.gltf` file's scene, so a tool can turn a model's pieces into boxes.
 *
 * This is the half of glTF a running game does not have. `useLoadGltf` takes the pieces that draw
 * and nothing else, because the structure a game draws is the scene's, not the file's. But something
 * has to turn one into the other once, when the model is brought in, and this is it: names, where
 * each piece sits and which ones draw. After that the engine only knows boxes, as if someone had
 * placed them by hand.
 *
 * A piece written as a move, a turn and a size is copied as it is: building a matrix only to take it
 * apart again would round every number, and a `0.9` would come back as `0.8999999761581421` in the
 * inspector and in every diff. Only a piece written as a finished matrix is taken apart, since there
 * the rounding already happened in the file. The turn comes back as a `quaternion`, which decides
 * over the three angles, so a piece tilted on two axes at once keeps its exact turn.
 *
 * It takes the file already parsed, not a path: whoever calls it has its own way of reading a file.
 * Whatever `JSON.parse` gave back is accepted, and something that is not a glTF comes back as no
 * pieces.
 *
 * @param value - The `.gltf` file, as `JSON.parse` left it.
 * @returns The pieces at the top of the scene, each with the ones under it in `children`.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const readGltfNodes = (value: unknown): TGltfNodeInfo[] => {
    const doc: TGltfDoc = typeof value === 'object' && value !== null ? value : {};
    const roots = doc.scenes?.[doc.scene ?? 0]?.nodes ?? [];
    const nodes = doc.nodes ?? [];

    // A piece reached twice would go round forever in a broken file, and a shared piece is allowed
    // anyway: the second visit is dropped, not copied.
    const seen = new Set<number>();

    const visit = (index: number): TGltfNodeInfo | null => {
        const node = nodes[index];
        if (node === undefined || seen.has(index)) {
            return null;
        }
        seen.add(index);

        const { translation, rotation, scale } = node.matrix !== undefined
            ? mat.decomposeTrs(new Float32Array(node.matrix) as mat.Mat4)
            : {
                translation: node.translation ?? [0, 0, 0],
                rotation: node.rotation ?? [0, 0, 0, 1],
                scale: node.scale ?? [1, 1, 1],
            };

        return {
            name: node.name ?? '',
            transform: {
                x: translation[0], y: translation[1], z: translation[2],
                rotation: 0, rotationX: 0, rotationY: 0,
                quaternion: [rotation[0], rotation[1], rotation[2], rotation[3]],
                scaleX: scale[0], scaleY: scale[1], scaleZ: scale[2],
            },
            hasMesh: node.mesh !== undefined,
            skinned: node.skin !== undefined,
            children: (node.children ?? []).map(visit).filter((child): child is TGltfNodeInfo => child !== null),
        };
    };

    return roots.map(visit).filter((node): node is TGltfNodeInfo => node !== null);
};
