import { getActiveGame } from '../../store';
import { uploadGeometry } from '../../geometry/upload_geometry';
import type { TGeometry } from '../../geometry';
import type { TGeometrySource } from '../../geometry/types/t_geometry_source';

/**
 * The shared body of every shape hook: look it up by name, and only build it if it is not there.
 *
 * Looking first is the point. Asking for the same shape in twenty objects builds it once and hands
 * the same one back nineteen times, so twenty crates cost one shape and twenty placements.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useGeometry = (
    hook: string,
    key: string,
    build: () => { vertices: Float32Array; indices: Uint16Array },
    source: TGeometrySource | null = null,
): TGeometry => {
    const store = getActiveGame();
    if (store === null) {
        throw new Error(`[NacatamalOn] ${hook}: call it inside a scene body.`);
    }

    const cached = store.get('assets').geometries.get(key);
    if (cached !== undefined) {
        return cached;
    }

    return uploadGeometry(store, key, build(), source);
};
