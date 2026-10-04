import { createDirectionalLight } from '../../light';
import { getActiveBox } from '../../store';
import type { TLightOptionsBase } from '../../light';
import type { TDirectionalLight } from '../../light';

/**
 * A light from far away, like the sun.
 *
 * It has a direction and no place: everything is lit by it the same, however far away it is. This is the one a scene should start with, because it is the one that shows the shape of things.
 *
 * It shines along its own facing, so it is aimed by turning it, the way a camera is.
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
 *     useLight({ intensity: 1.2 });
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
export const useLight = (options: TLightOptionsBase & { shadowArea?: number; shadowDistance?: number } = {}): TDirectionalLight => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] useLight: call it inside a scene body, or inside something created with useSpawn.');
    }

    if (box.light !== null) {
        console.warn('[NacatamalOn] useLight: this object already has a light, so the one it had is replaced. Put the second one on its own object.');
    }

    const light = createDirectionalLight(options);
    box.light = light;
    return light;
};
