import { openLayerState } from './layer_state';
import type { IRenderer } from '../../render';
import type { TTilemapLayer } from './types/t_tilemap';

/**
 * Lets go of the corners a layer put on the graphics card, and leaves it ready to build them again.
 *
 * Ready again and not finished for good, because the map itself stays in the game's cache: another
 * scene can ask for the same level, and all it has to do is put its corners back up.
 *
 * Called from two places, and both are needed. The scene that asked for the map stopping is the
 * usual one, and it goes through the cleanups like every other thing that leaves with its scene. A
 * layer destroyed on its own is the other.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const releaseLayer = (renderer: IRenderer, layer: TTilemapLayer): void => {
    const state = openLayerState(layer);
    for (const mesh of state.meshes) {
        if (mesh.buffer !== null) {
            renderer.destroyBuffer(mesh.buffer);
        }
        mesh.buffer = null;
        mesh.vertexCount = 0;
        mesh.capacity = 0;
    }
    state.dirty = true;
};
