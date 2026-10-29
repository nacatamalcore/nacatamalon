import { createSpotLight } from '../../light';
import { getActiveBox } from '../../store';
import type { TLightOptionsBase } from '../../light';
import type { TSpotLight } from '../../light';
import { outsideSceneBody } from '../../utils/outside_scene_body';

/**
 * A torch: a lamp that only shines inside a cone.
 *
 * `angle` is half the width of the cone and `penumbra` is how soft its edge is, from a hard rim at `0` to a beam that fades all the way in at `1`. Like a sun it is aimed by turning it.
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
        throw outsideSceneBody('useSpotLight');
    }

    const light = createSpotLight(options);
    box.lights.push(light);
    return light;
};
