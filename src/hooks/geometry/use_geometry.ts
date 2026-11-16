import { getActiveGame } from '../../store';
import { uploadGeometry } from '../../geometry/upload_geometry';
import type { TGeometry } from '../../geometry';
import type { TGeometrySource } from '../../geometry/types/t_geometry_source';
import { outsideSceneBody } from '../../utils/outside_scene_body';
import { checkUvProjection, reprojectWoven } from '../../geometry/build/project_uvs';
import { keepCorners } from '../../geometry/kept_corners';
import type { TGeometryUvOptions } from '../../geometry/build/project_uvs';

/**
 * What a shape hook adds to its default key for `uvs` and `uvScale`, so a shape with its picture
 * worked out by name is not mixed up with the same shape wearing its own. Nothing without them.
 *
 * @internal
 */
export const uvKeyOf = (options: TGeometryUvOptions): string =>
    options.uvs === undefined ? '' : `:uvs=${options.uvs}${options.uvScale === undefined ? '' : `@${options.uvScale}`}`;

/**
 * `uvs` and `uvScale` as a recipe keeps them: only the ones given, so a shape without them is
 * written as it always was.
 *
 * @internal
 */
export const uvRecipeOf = (options: TGeometryUvOptions): TGeometryUvOptions => ({
    ...(options.uvs === undefined ? {} : { uvs: options.uvs }),
    ...(options.uvScale === undefined ? {} : { uvScale: options.uvScale }),
});

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
    build: () => { vertices: Float32Array; indices: Uint16Array | Uint32Array },
    source: TGeometrySource | null = null,
    uv: TGeometryUvOptions = {},
): TGeometry => {
    const store = getActiveGame();
    if (store === null) {
        throw outsideSceneBody(hook);
    }
    // Before the look-up, so a mistake is said whether or not the shape was already built. A shape
    // hook's own corners are not given, so `uvs` is only ever a name here.
    if (uv.uvs !== undefined && typeof uv.uvs !== 'string') {
        throw new Error(`[NacatamalOn] ${hook}: 'uvs' is ${JSON.stringify(uv.uvs)}, and a shape hook takes the name of a way to work them out: 'planar', 'box', 'cylinder' or 'sphere'. To give them corner by corner, use createGeometry.`);
    }
    const projection = checkUvProjection(hook, uv.uvs, uv.uvScale);

    const cached = store.get('assets').geometries.get(key);
    if (cached !== undefined) {
        return cached;
    }

    // The picture's way and scale read now, not when the corners are asked for again: the options
    // are the game's, and may have changed by then.
    const scale = uv.uvScale;
    const woven = () => {
        const built = build();
        return projection === null ? built : reprojectWoven(built, projection, scale);
    };
    const geometry = uploadGeometry(store, key, woven(), source);
    // Built again from the recipe when a merge asks, rather than kept: every hook's `build` closes
    // over its own copy of the numbers it was asked for.
    keepCorners(geometry, () => ({ ...woven(), colors: null, uv2: null }));
    return geometry;
};
