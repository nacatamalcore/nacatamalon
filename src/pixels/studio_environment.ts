import { createPixels } from './create_pixels';
import { colorOf, put, toByte } from './bytes';
import type { TColorOption } from '../color';
import type { TPixels } from './types/t_pixels';

/**
 * What `studioEnvironment` is asked for. Everything has a default: a bright sky over a dark floor
 * and two white softboxes.
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TStudioEnvironmentOptions = {
    /**
     * How many pixels across, and down: the picture is square. Default `64`, which reads as the era's
     * chrome; more is smoother.
     */
    size?: number;
    /**
     * The colour straight above. Default `'#f4f7ff'`.
     */
    top?: TColorOption;
    /**
     * The colour at the horizon, where the sky meets the floor. Default `'#a9b4c8'`.
     */
    horizon?: TColorOption;
    /**
     * The colour of the floor below. Default `'#2a201a'`.
     */
    ground?: TColorOption;
    /**
     * How many softboxes, the bright panels a photographer lights a product with, from `0` to `4`:
     * one up to the right, a second up to the left, a third straight above and a fourth behind the
     * model, which lights its rim. Default `2`.
     */
    panels?: number;
    /**
     * The colour of the softboxes. Default `'#ffffff'`.
     */
    panelColor?: TColorOption;
};

/**
 * Where each softbox is, as the angle round from straight behind the camera and the angle up from
 * the horizon, and how big, both in radians.
 */
const PANELS: readonly { across: number; up: number; width: number; height: number }[] = [
    { across: 0.62, up: 0.42, width: 0.3, height: 0.2 },
    { across: -0.7, up: 0.3, width: 0.22, height: 0.26 },
    { across: 0, up: 1.15, width: 0.5, height: 0.18 },
    { across: Math.PI, up: 0.35, width: 0.5, height: 0.22 },
];

/**
 * How far inside a softbox a direction is, `0` outside to `1` well inside, with a soft edge so the
 * reflection of its rim is not a stair of pixels.
 */
const panelAt = (across: number, up: number, panel: (typeof PANELS)[number]): number => {
    // The shortest way round, so the panel behind the model reads on both sides of its seam.
    let gap = Math.abs(across - panel.across) % (Math.PI * 2);
    if (gap > Math.PI) gap = Math.PI * 2 - gap;
    const x = gap / panel.width;
    const y = Math.abs(up - panel.up) / panel.height;
    const edge = Math.max(x, y);
    return edge >= 1 ? 0 : edge <= 0.75 ? 1 : (1 - edge) / 0.25;
};

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Paints the surroundings of a photographer's studio as a round picture, the kind a material's
 * `reflection` reads: a bright sky above, a floor below, and white softboxes, the look of the glossy
 * plastic and chrome of the era's computer graphics.
 *
 * The picture is the surroundings as a ball of chrome seen from in front would show them: its middle
 * is what is behind the camera, where the softboxes stand, and its rim what is behind the model. Each
 * pixel is painted by the direction it reflects, worked out the way the shader reads it back, so a
 * softbox lands where it should on the model and not stretched along the rim.
 *
 * @param options The colours, how many softboxes and how big the picture is. All optional.
 * @returns The picture, to make a texture of with `createPixelTexture`.
 *
 * @example
 * ```ts
 * import { createMesh, useSphereGeometry } from 'nacatamalon';
 * import { createPixelTexture, studioEnvironment } from 'nacatamalon/pixels';
 *
 * const studio = createPixelTexture(studioEnvironment({ ground: '#3a2a22', panels: 3 }));
 * createMesh({ geometry: useSphereGeometry(), tint: '#c0c4cc', perPixel: true, reflection: { texture: studio, front: 0.9 } });
 * ```
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const studioEnvironment = (options: TStudioEnvironmentOptions = {}): TPixels => {
    const size = Math.max(2, Math.floor(options.size ?? 64));
    const top = colorOf(options.top ?? '#f4f7ff');
    const horizon = colorOf(options.horizon ?? '#a9b4c8');
    const ground = colorOf(options.ground ?? '#2a201a');
    const panel = colorOf(options.panelColor ?? '#ffffff');
    const panels = PANELS.slice(0, Math.max(0, Math.min(PANELS.length, Math.floor(options.panels ?? 2))));
    const pixels = createPixels(size, size);

    for (let py = 0; py < size; py++) {
        for (let px = 0; px < size; px++) {
            // The place on the ball this pixel is, -1 to 1 across and up; past the rim, the rim.
            let x = ((px + 0.5) / size) * 2 - 1;
            let y = 1 - ((py + 0.5) / size) * 2;
            const reach = Math.hypot(x, y);
            if (reach > 1) {
                x /= reach;
                y /= reach;
            }
            // Which way the ball faces there, and the way it reflects the camera's look: the inverse
            // of envUv, so what is painted here is what the shader reads here.
            const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
            const rx = 2 * z * x;
            const ry = 2 * z * y;
            const rz = 2 * z * z - 1;
            const up = Math.asin(Math.max(-1, Math.min(1, ry)));
            const across = Math.atan2(rx, rz);

            // The sky brightens fast above the horizon; the floor darkens fast below it, as a studio's
            // floor meets its backdrop.
            const sky = ry >= 0 ? Math.pow(ry, 0.6) : 0;
            const floor = ry < 0 ? Math.min(1, -ry * 5) : 0;
            let r = ry >= 0 ? mix(horizon.r, top.r, sky) : mix(horizon.r, ground.r, floor);
            let g = ry >= 0 ? mix(horizon.g, top.g, sky) : mix(horizon.g, ground.g, floor);
            let b = ry >= 0 ? mix(horizon.b, top.b, sky) : mix(horizon.b, ground.b, floor);

            for (const box of panels) {
                const lit = panelAt(across, up, box);
                if (lit > 0) {
                    r = mix(r, panel.r, lit);
                    g = mix(g, panel.g, lit);
                    b = mix(b, panel.b, lit);
                }
            }
            put(pixels, px, py, toByte(r), toByte(g), toByte(b), 255);
        }
    }
    return pixels;
};
