import { sceneOnly } from '../../game_systems/game_systems';
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
 * In a view (`createSpriteTexture` with `sees: 'world'`) it sets the level in all the view shows, and
 * the scene's lamps still light it unless the view brings lamps of its own: a minimap at
 * `intensity: 1` reads in full while the game around it is dark. In a picture that sees `'3d'`, it
 * sets the level of the room it shows.
 *
 * With a `ground` it is two colours: `color` comes down from above and `ground` up from below, and a
 * surface takes them by which way it faces, the light of a photographer's studio (a bright sky over a
 * warm floor). A model lit only at its corners shares it out at its corners, as it does its other
 * light.
 *
 * @param options Its colour, how strong it is, and the colour from below.
 * @returns The light, to read and to change.
 *
 * @example
 * ```ts
 * const Level = () => {
 *     useCamera3d({ projection: 'perspective', transform: { z: 5 } });
 *     useAmbientLight({ intensity: 1.2 });
 *     // Or two colours, a sky above and a floor below:
 *     // useAmbientLight({ color: '#dce6ff', ground: '#4a3328', intensity: 0.5 });
 *     createMesh({ geometry: useSphereGeometry() });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Lighting
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useAmbientLight = (options: { color?: TColorOption; intensity?: number; ground?: TColorOption } = {}): TAmbientLight => {
    const box = getActiveBox();
    if (box === null) {
        throw outsideSceneBody('useAmbientLight');
    }
    sceneOnly('useAmbientLight');

    const light = createAmbientLight(options);
    box.lights.push(light);
    return light;
};
