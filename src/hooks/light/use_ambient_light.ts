import { createAmbientLight } from '../../light';
import { getActiveBox } from '../../store';
import type { TColor } from '../../color';
import type { TAmbientLight } from '../../light';

/**
 * The level everything is lit to before any lamp reaches it.
 *
 * It has no place and no direction, so it shades nothing: it only decides how dark the dark side is. A scene with one of these and nothing else is lit flat, which is a look and not a mistake.
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
 *     useAmbientLight({ intensity: 1.2 });
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
export const useAmbientLight = (options: { color?: TColor; intensity?: number } = {}): TAmbientLight => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] useAmbientLight: call it inside a scene body, or inside something created with useSpawn.');
    }

    if (box.light !== null) {
        console.warn('[NacatamalOn] useAmbientLight: this object already has a light, so the one it had is replaced. Put the second one on its own object.');
    }

    const light = createAmbientLight(options);
    box.light = light;
    return light;
};
