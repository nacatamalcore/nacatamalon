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
 * it: a lamp carried by a character, headlights on a car. An object gives off as many as it asks
 * for, each placed by its own `transform`: a car's two headlights are two calls in the car, and the
 * lamps of a room two calls in the scene. An object of its own (`useSpawn`) is for a lamp that is a
 * thing of its own, one that breaks, swings or is switched off by itself.
 *
 * A scene holds thirty-two at a time, and each model is lit by the eight of them that reach it most,
 * so a corridor of torches is lit all along. Past thirty-two they are dropped in the order they were
 * made, with a warning.
 *
 * @param options Its colour, how strong it is, and where it points.
 * @returns The light, to read and to change.
 *
 * @example
 * ```ts
 * const Level = () => {
 *     useCamera3d({ projection: 'perspective', transform: { z: 5 } });
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

    const light = createPointLight(options);
    box.lights.push(light);
    return light;
};
