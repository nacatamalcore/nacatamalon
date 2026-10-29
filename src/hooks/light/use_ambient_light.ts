import { createAmbientLight } from '../../light';
import { getActiveBox } from '../../store';
import type { TColorOption } from '../../color';
import type { TAmbientLight } from '../../light';
import { outsideSceneBody } from '../../utils/outside_scene_body';

/**
 * The level everything is lit to before any lamp reaches it.
 *
 * It has no place and no direction, so it shades nothing: it only decides how dark the dark side is. A scene with one of these and nothing else is lit flat, which is a look and not a mistake.
 *
 * One level for the whole scene: whichever object asks for it, it does not move with it. A scene
 * that asks for more than one keeps the last made, and says so: a cave can set its own on the way
 * in.
 *
 * @param options Its colour and how strong it is.
 * @returns The light, to read and to change.
 *
 * @example
 * ```ts
 * const Level = () => {
 *     useCamera3d({ projection: 'perspective', transform: { z: 5 } });
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
export const useAmbientLight = (options: { color?: TColorOption; intensity?: number } = {}): TAmbientLight => {
    const box = getActiveBox();
    if (box === null) {
        throw outsideSceneBody('useAmbientLight');
    }

    const light = createAmbientLight(options);
    box.lights.push(light);
    return light;
};
