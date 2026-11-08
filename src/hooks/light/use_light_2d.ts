import { getActiveBox } from '../../store';
import { getColor } from '../../color';
import type { TColorOption } from '../../color';
import { createRecord } from '../../gameobjects/create_record';
import { outsideSceneBody } from '../../utils/outside_scene_body';
import { countLight2d } from '../../light/count_lights_2d';
import type { TLight2d, TAmbientLight2d } from '../../light';

/**
 * What a 2D lamp is: its colour, how strong, where, how far it reaches and how it fades.
 *
 * @category Lighting
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TLight2dOptions = {
    /**
     * The colour of its light, white by default.
     */
    color?: TColorOption;
    /**
     * How strong it is. `1` by default; `0` switches it off.
     */
    intensity?: number;
    /**
     * Where it is from the box holding it, in pixels.
     */
    transform?: { x?: number; y?: number };
    /**
     * How far it reaches, in pixels of the world. `128` by default; `0` or less lights nothing.
     */
    radius?: number;
    /**
     * How it fades towards the edge: `1` evenly, `2` dimmer sooner, `0` not at all, a circle with a
     * hard edge. `1` by default.
     */
    falloff?: number;
};

/**
 * A lamp for a 2D world: it lights the sprites, texts, nine-slices, maps and particles around it,
 * with no normal map. It goes where the box holding it goes, so one made in the player's component is a
 * lantern the player carries.
 *
 * A world with lamps starts dark, and `useAmbientLight2d` says how dark; once lit, it stays lit until
 * its scene ends, even with every lamp gone. A world can have as many lamps as it likes: what the
 * camera shows is lit by the eight nearest its middle that reach it, so a long level can have a torch
 * every few steps. The HUD (`useScreenSpace`) and what is left out with `useUnlit2d` are never lit.
 * It casts no shadow. Change what it gives back to move it, recolour it or dim it, from the next
 * frame.
 *
 * @example
 * ```ts
 * useAmbientLight2d({ intensity: 0.15 });
 * useLight2d({ transform: { x: 160, y: 90 }, radius: 100, color: '#ffbb66' });
 * ```
 * @category Lighting
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useLight2d = (options: TLight2dOptions = {}): TLight2d => {
    const box = getActiveBox();
    if (box === null) throw outsideSceneBody('useLight2d');
    const light: TLight2d = createRecord('point-2d', {
        color: getColor(options.color ?? 'white'),
        intensity: options.intensity ?? 1,
        radius: options.radius ?? 128,
        falloff: options.falloff ?? 1,
        transform: {
            x: options.transform?.x ?? 0, y: options.transform?.y ?? 0, z: 0,
            rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1,
        },
    });
    box.lights.push(light);
    countLight2d(box);
    return light;
};

/**
 * How bright a 2D world is where no lamp reaches, and in what colour, apart from any 3D light.
 * White at `0.2` by default. A scene says it once: with more than one, the last is the one used,
 * and that is said once.
 *
 * @category Lighting
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useAmbientLight2d = (options: { color?: TColorOption; intensity?: number } = {}): TAmbientLight2d => {
    const box = getActiveBox();
    if (box === null) throw outsideSceneBody('useAmbientLight2d');
    const light: TAmbientLight2d = createRecord('ambient-2d', {
        color: getColor(options.color ?? 'white'),
        intensity: options.intensity ?? 0.2,
    });
    box.lights.push(light);
    countLight2d(box);
    return light;
};
