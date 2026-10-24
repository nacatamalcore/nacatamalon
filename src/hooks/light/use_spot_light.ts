import { createSpotLight } from '../../light';
import { getActiveBox } from '../../store';
import type { TLightOptionsBase } from '../../light';
import type { TSpotLight } from '../../light';

/**
 * A torch: a lamp that only shines inside a cone.
 *
 * `angle` is half the width of the cone and `penumbra` is how soft its edge is, from a hard rim at `0` to a beam that fades all the way in at `1`. Like a sun it is aimed by turning it.
 *
 * The light belongs to this object, so putting it inside something that moves means it moves with
 * it: a lamp carried by a character, headlights on a car. One light per object, as a lamp is one
 * thing: a car's two headlights are an object each, inside the car, placed by their own
 * `transform`: `useSpawn(function LeftLight() { useSpotLight({ transform: { x: -0.6 } }); })()`, and
 * the same for the right. Asking for a second one here replaces the first, and says so.
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
 *     useCamera3d({ projection: 'perspective', transform: { z: 5 } });
 *     useSpotLight({ intensity: 1.2 });
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
export const useSpotLight = (options: TLightOptionsBase & { range?: number; angle?: number; penumbra?: number } = {}): TSpotLight => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] useSpotLight: call it inside a scene body, or inside something created with useSpawn.');
    }

    if (box.light !== null) {
        console.warn('[NacatamalOn] useSpotLight: this object already has a light, so the one it had is replaced. One light per object: give each its own object inside this one, ' +
            'useSpawn(function Lamp() { useSpotLight({ transform: { x: 1 } }); })().');
    }

    const light = createSpotLight(options);
    box.light = light;
    return light;
};
