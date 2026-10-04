import { createPointLight } from '../../light';
import { getActiveBox } from '../../store';
import type { TLightOptionsBase } from '../../light';
import type { TPointLight } from '../../light';

/**
 * A lamp: it has a place, shines every way, and fades out with distance.
 *
 * `range` is how far it reaches; past that it lights nothing. A torch on a wall, a fire, a bulb.
 *
 * The light belongs to this object, so putting it inside something that moves means it moves with
 * it: a lamp carried by a character, headlights on a car. One light per object; asking for a second
 * one here replaces it, and says so.
 *
 * A scene can hold as many as it has objects with one, up to eight at a time. Past that they are
 * dropped in the order they were made, with a warning.
 *
 * @param options Its colour, how strong it is, and where it points.
 * @returns The light, to read and to change.
 *
 * @example
 * ```ts
 * const Level = () => {
 *     useCamera3d({ projection: 'perspective', z: 5 });
 *     usePointLight({ intensity: 1.2 });
 *     createMesh({ geometry: useUvSphereGeometry() });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Lighting
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const usePointLight = (options: TLightOptionsBase & { range?: number } = {}): TPointLight => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] usePointLight: call it inside a scene body, or inside something created with useSpawn.');
    }

    if (box.light !== null) {
        console.warn('[NacatamalOn] usePointLight: this object already has a light, so the one it had is replaced. Put the second one on its own object.');
    }

    const light = createPointLight(options);
    box.light = light;
    return light;
};
