import type { TDrawMesh, TDrawMeshInstances } from '../interface/draw/t_draw_mesh';

/**
 * How many numbers one instance of a model is: the three rows of its placement (four each, the move
 * in the fourth), its colour, and its four numbers. Both backends read the run by these, and the
 * game writes it by them.
 *
 * @internal
 */
export const INSTANCE_FLOATS = 20;

/**
 * The same in bytes: how far apart two instances are on the card.
 *
 * @internal
 */
export const INSTANCE_BYTES = INSTANCE_FLOATS * 4;

/**
 * The first of the five places a shader reads an instance at: its three rows, then its colour, then
 * its numbers. After everything a corner has (0 to 7), so a shape is bound the same way drawn once or
 * many times.
 *
 * @internal
 */
export const INSTANCE_LOCATION = 8;

/**
 * The run of instances a model is drawn as, or `null` for a single model.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const instancesOf = (mesh: TDrawMesh): TDrawMeshInstances | null => mesh.instances ?? null;

/**
 * The box a model's corners lie in, in its own space: the one all its instances fit in when it is
 * drawn as many, otherwise its shape's. `null` when there is none to go by.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const meshBoundsOf = (mesh: TDrawMesh): TDrawMeshInstances['bounds'] => {
    const instances = mesh.instances ?? null;
    if (instances !== null) {
        return instances.bounds;
    }
    return mesh.geometry?.bounds ?? null;
};
