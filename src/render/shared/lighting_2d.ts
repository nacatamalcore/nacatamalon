// everyframe
import type { TColor } from '../../color';
import type { TDrawCamera2d } from '../interface/draw/t_draw_camera_2d';

/**
 * The 2D lights a view's world has, as the frame hands them to the backend: the base colour, with
 * the ambient light's strength already in it, and up to eight lamps.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TLighting2d = {
    ambient: TColor;
    lights: readonly { color: TColor; intensity: number; transform: { x: number; y: number }; radius: number; falloff: number }[];
};

/**
 * Lamps a view can be lit by.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MAX_LIGHTS_2D = 8;

/**
 * Where the lighting starts in the frame's uniforms, in floats: after the resolution, its padding
 * and the 16 views (`4 + 16 * 4`).
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const LIGHTING_2D_START = 68;

/**
 * Floats of one view's lighting: the base colour and how many lamps, then each lamp as where it is,
 * how far it reaches, how it fades and its colour (`4 + 8 * 8`).
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const LIGHTING_2D_FLOATS = 4 + MAX_LIGHTS_2D * 8;

/**
 * Floats of the whole frame block, with the lighting of all 16 views.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const FRAME_FLOATS_2D = LIGHTING_2D_START + 16 * LIGHTING_2D_FLOATS;

const positive = (n: number): number => (Number.isFinite(n) ? Math.max(0, n) : 0);

/**
 * Writes the lighting of the views this frame draws through and answers how many floats of the
 * block they reach: only those need sending. Slot 0 is the screen, never lit (white, no lamps).
 * Every slot drawn through is written, so a scene that left takes its lights with it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const fillLighting2d = (data: Float32Array, cameras: readonly TDrawCamera2d[]): number => {
    const views = Math.min(16, cameras.length + 1);
    for (let view = 0; view < views; view++) {
        const at = LIGHTING_2D_START + view * LIGHTING_2D_FLOATS;
        const lighting = view === 0 ? undefined : cameras[view - 1]?.lighting2d;
        if (lighting === undefined) {
            data[at] = 1;
            data[at + 1] = 1;
            data[at + 2] = 1;
            data[at + 3] = 0;
            continue;
        }
        const count = Math.min(lighting.lights.length, MAX_LIGHTS_2D);
        data[at] = lighting.ambient.r;
        data[at + 1] = lighting.ambient.g;
        data[at + 2] = lighting.ambient.b;
        data[at + 3] = count;
        for (let i = 0; i < count; i++) {
            const light = lighting.lights[i]!;
            const lamp = at + 4 + i * 8;
            const strength = positive(light.intensity);
            data[lamp] = light.transform.x;
            data[lamp + 1] = light.transform.y;
            data[lamp + 2] = positive(light.radius);
            data[lamp + 3] = positive(light.falloff);
            data[lamp + 4] = light.color.r * strength;
            data[lamp + 5] = light.color.g * strength;
            data[lamp + 6] = light.color.b * strength;
            data[lamp + 7] = 0;
        }
    }
    return LIGHTING_2D_START + views * LIGHTING_2D_FLOATS;
};
