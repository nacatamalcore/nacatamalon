import { createPixels } from './create_pixels';
import { colorOf, put, toByte } from './bytes';
import type { TColorOption } from '../color';
import type { TPixels } from './types/t_pixels';

/**
 * What `paintMatcap` is asked for. Everything has a default: a pale clay lit from up and to the left.
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPaintMatcapOptions = {
    /**
     * The colour where the light falls full. Default `'#d8cfc8'`, a pale clay.
     */
    base?: TColorOption;
    /**
     * The colour of the side the light does not reach. Default the base at a third of its brightness.
     */
    shade?: TColorOption;
    /**
     * The colour of the highlight. Default `'#ffffff'`.
     */
    shine?: TColorOption;
    /**
     * How glossy, `0` to `1`: `0` no highlight, matte as chalk; `1` a small hard one, as lacquer.
     * Default `0.5`.
     */
    gloss?: number;
    /**
     * Where the light comes from, as the camera sees it: `x` from `-1` at the left to `1` at the right,
     * `y` from `-1` below to `1` above. Default `{ x: -0.55, y: 0.6 }`, up and to the left.
     */
    from?: { x: number; y: number };
    /**
     * How many pixels across, and down: the picture is square. Default `128`; `64` is enough for a
     * game drawn small.
     */
    size?: number;
};

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

const unit = (x: number, y: number, z: number): [number, number, number] => {
    const length = Math.hypot(x, y, z) || 1;
    return [x / length, y / length, z / length];
};

/**
 * How far the light wraps round to the dark side, as a big lamp's does: a face square to it is lit
 * full, one turned away from it a little past the edge still takes some.
 */
const WRAP = 0.35;

/**
 * How much darker the very rim of the ball is, as a rounded thing's edge is.
 */
const RIM_DARK = 0.35;

/**
 * Paints a matcap: a ball lit by one light, seen from in front, the picture `matcap` colours a model
 * with. Each pixel of the disc is where a surface facing that way shows on the ball, worked out the
 * way the shader reads it back, so a model lit by it looks lit the same way. Soft light that wraps a
 * little round the dark side, a highlight, and an edge a touch darker; past the disc, its rim.
 *
 * A matcap rendered in a 3D program, or a picture of one, does the same and can be anything (two
 * lights, a coloured rim, a hand-painted shine): this one is for a game that wants them without
 * files, or to try a colour quickly.
 *
 * @param options The colours, how glossy, where the light comes from and how big. All optional.
 * @returns The picture, to make a texture of with `createPixelTexture`.
 *
 * @example
 * ```ts
 * import { createMaterial, createMesh, matcap, useTorusGeometry } from 'nacatamalon';
 * import { createPixelTexture, paintMatcap } from 'nacatamalon/pixels';
 *
 * const teal = createPixelTexture(paintMatcap({ base: '#3fb3b0', shade: '#123c4a', gloss: 0.7 }));
 * createMesh({ geometry: useTorusGeometry(), material: createMaterial(matcap(teal)) });
 * ```
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const paintMatcap = (options: TPaintMatcapOptions = {}): TPixels => {
    const size = Math.max(2, Math.floor(options.size ?? 128));
    const base = colorOf(options.base ?? '#d8cfc8');
    const shade = options.shade !== undefined ? colorOf(options.shade) : { r: base.r / 3, g: base.g / 3, b: base.b / 3, a: 1 };
    const shine = colorOf(options.shine ?? '#ffffff');
    const gloss = Math.max(0, Math.min(1, options.gloss ?? 0.5));
    const from = options.from ?? { x: -0.55, y: 0.6 };

    // The light, a little in front so the middle of the ball is lit; and half-way between it and the
    // camera, where the highlight sits.
    const light = unit(from.x, from.y, 0.6);
    const half = unit(light[0], light[1], light[2] + 1);
    // A tight, strong highlight when glossy, none when matte.
    const tightness = mix(6, 60, gloss);
    const strength = gloss <= 0 ? 0 : mix(0.35, 0.9, gloss);

    const pixels = createPixels(size, size);
    for (let py = 0; py < size; py++) {
        for (let px = 0; px < size; px++) {
            // The place on the ball, -1 to 1 across and up; past the rim, the rim.
            let x = ((px + 0.5) / size) * 2 - 1;
            let y = 1 - ((py + 0.5) / size) * 2;
            const reach = Math.hypot(x, y);
            if (reach > 1) {
                x /= reach;
                y /= reach;
            }
            // Which way the ball faces there.
            const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));

            const facing = x * light[0] + y * light[1] + z * light[2];
            const lit = Math.max(0, Math.min(1, facing * (1 - WRAP) + WRAP));
            const soft = lit * lit * (3 - 2 * lit);
            const spot = Math.pow(Math.max(0, x * half[0] + y * half[1] + z * half[2]), tightness) * strength;
            const edge = 1 - Math.pow(1 - z, 3) * RIM_DARK;

            const r = mix(mix(shade.r, base.r, soft) * edge, shine.r, spot);
            const g = mix(mix(shade.g, base.g, soft) * edge, shine.g, spot);
            const b = mix(mix(shade.b, base.b, soft) * edge, shine.b, spot);
            put(pixels, px, py, toByte(r), toByte(g), toByte(b), 255);
        }
    }
    return pixels;
};
