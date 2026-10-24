import { createRectLight } from '../../light';
import { getActiveBox } from '../../store';
import type { TLightOptionsBase } from '../../light';
import type { TRectLight } from '../../light';

/**
 * A panel: a lamp shaped like a rectangle, which shines from its front only.
 *
 * `width` and `height` are its size along its own X and Y, and `range` is how far it reaches from
 * the nearest point of the panel. It faces down unless turned, like a light in the ceiling, and is
 * aimed by turning it like a torch. A strip light, a window, a screen, a sign.
 *
 * It does not cast shadows: a panel has no single point to look from.
 *
 * The light belongs to this object, so putting it inside something that moves means it moves with
 * it. One light per object, as a lamp is one thing: two (a pair of panels) are an object each,
 * inside this one, `useSpawn(function Left() { useRectLight({ transform: { x: -1 } }); })()`.
 * Asking for a second one here replaces the first, and says so. It counts against the eight a
 * scene draws at a time.
 *
 * @param options Its colour, how strong it is, its size, and where it points.
 * @returns The light, to read and to change.
 *
 * @example
 * ```ts
 * const Room = () => {
 *     useCamera3d({ projection: 'perspective', transform: { y: 2, z: 6 } });
 *     useRectLight({ width: 3, height: 0.4, range: 6, transform: { y: 3 } });
 *     createMesh({ geometry: usePlaneGeometry({ width: 10, depth: 10, widthSegments: 20, depthSegments: 20 }) });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Lighting
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useRectLight = (options: TLightOptionsBase & { range?: number; width?: number; height?: number } = {}): TRectLight => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] useRectLight: call it inside a scene body, or inside something created with useSpawn.');
    }

    if (box.light !== null) {
        console.warn('[NacatamalOn] useRectLight: this object already has a light, so the one it had is replaced. One light per object: give each its own object inside this one, ' +
            'useSpawn(function Lamp() { useRectLight({ transform: { x: 1 } }); })().');
    }

    const light = createRectLight(options);
    box.light = light;
    return light;
};
