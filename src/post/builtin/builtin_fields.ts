import type { TEffectField } from './types/t_builtin';

/**
 * What can be set on each of the engine's effects, for a form to be made of it: every knob of its
 * `uniforms` with its range, and the options written into it when it is made. A test holds each list
 * to the effect it describes, key for key and default for default, so the two cannot drift apart.
 */

const num = (key: string, value: number, min: number, max: number, step: number, more: Partial<TEffectField> = {}): TEffectField =>
    ({ key, type: 'number', default: value, min, max, step, ...more });
/** A part of something, `0` to `1`. */
const part = (key: string, value: number, more: Partial<TEffectField> = {}): TEffectField => num(key, value, 0, 1, 0.01, more);
const color = (key: string, value: number[], more: Partial<TEffectField> = {}): TEffectField => ({ key, type: 'color', default: value, ...more });
const point = (key: string, value: number[], more: Partial<TEffectField> = {}): TEffectField => ({ key, type: 'vec2', default: value, ...more });
const choice = (key: string, value: number, options: TEffectField['options'], more: Partial<TEffectField> = {}): TEffectField =>
    ({ key, type: 'select', default: value, options, ...more });
const OFF_ON = [{ label: 'Off', value: 0 }, { label: 'On', value: 1 }] as const;
/** A place on the screen, `[0, 0]` the top left and `[1, 1]` the bottom right. */
const center = (value: number[]): TEffectField => point('center', value, { description: 'From [0, 0], the top left, to [1, 1].' });

/**
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const BUILTIN_FIELDS: Readonly<Record<string, readonly TEffectField[]>> = {
    lut: [part('amount', 1, { description: 'From the frame untouched to the table\'s word.' })],
    adjust: [
        num('brightness', 1, 0, 2, 0.01),
        num('contrast', 1, 0, 2, 0.01),
        num('saturation', 1, 0, 2, 0.01),
        num('gamma', 1, 0.2, 3, 0.01),
        num('hue', 0, -180, 180, 1, { description: 'In degrees.' }),
        color('tint', [1, 1, 1]),
    ],
    wave: [
        num('amplitude', 4, 0, 32, 0.5, { description: 'In game pixels.' }),
        num('frequency', 4, 0, 32, 0.5),
        num('speed', 3, 0, 20, 0.1),
        choice('axis', 0, [{ label: 'Lines', value: 0 }, { label: 'Columns', value: 1 }]),
    ],
    shockwave: [
        center([0.5, 0.5]),
        num('radius', 0, 0, 512, 1, { description: 'In game pixels.' }),
        num('amplitude', 6, 0, 32, 0.5),
        num('wavelength', 24, 1, 128, 1),
        part('brightness', 0.15),
    ],
    distort: [
        center([0.5, 0.5]),
        num('radius', 64, 0, 512, 1, { description: 'In game pixels.' }),
        num('bulge', 0.5, -1, 1, 0.01, { description: 'From -1, a pinch, to 1, a bulge.' }),
        num('twist', 0, -6.28, 6.28, 0.01, { description: 'How far the middle turns, in radians.' }),
    ],
    mosaic: [num('size', 4, 1, 64, 1, { description: 'How many game pixels wide a block is.' })],
    blur: [num('radius', 4, 0, 32, 0.5), part('amount', 1)],
    zoomBlur: [center([0.5, 0.5]), part('strength', 0.1), num('samples', 16, 2, 32, 1)],
    motionBlur: [point('velocity', [8, 0], { description: 'The smear, in game pixels.' }), num('samples', 12, 2, 32, 1)],
    tiltShift: [part('focus', 0.5), part('band', 0.12), part('feather', 0.15), num('radius', 5, 0, 32, 0.5)],
    bloom: [part('threshold', 0.6), num('intensity', 0.8, 0, 4, 0.01), num('radius', 6, 0, 32, 0.5)],
    godrays: [
        point('center', [0.5, 0.2], { description: 'Where the light is: [0, 0] the top left, and it may be off the screen.' }),
        part('threshold', 0.7),
        part('density', 0.8),
        num('decay', 0.96, 0.8, 1, 0.005),
        num('intensity', 0.6, 0, 2, 0.01),
    ],
    halftone: [
        num('scale', 4, 2, 32, 1),
        num('angle', 45, 0, 180, 1, { description: 'In degrees.' }),
        choice('mode', 0, [{ label: 'Dots', value: 0 }, { label: 'Lines', value: 1 }]),
        part('color', 0, { label: 'Colour', description: 'Black ink at 0, the picture\'s own colour at 1.' }),
    ],
    ascii: [
        {
            key: 'glyphs', label: 'Letters', type: 'string', default: ' .:-=+*#W@', rebuild: true,
            description: 'From the darkest to the brightest: printable ASCII and the blocks ░ ▒ ▓ █.',
            suggestions: [' .:-=+*#W@', ' .oO0@', ' ░▒▓█', ' .:░▒▓█', ' -=#', ' 01'],
        },
        num('scale', 6, 6, 48, 6, { description: 'A cell, in game pixels.' }),
        part('color', 1, { label: 'Colour', description: 'Every letter in the ink at 0, the picture\'s own colour at 1.' }),
        color('ink', [0.3, 1, 0.45]),
        part('background', 0.08, { description: 'How much of the picture shows behind the letters.' }),
        num('brightness', 1.6, 0, 4, 0.01),
    ],
    glitch: [
        num('slices', 12, 1, 64, 1),
        num('offset', 16, 0, 64, 1, { description: 'In game pixels.' }),
        num('rgb', 2, 0, 16, 0.5, { label: 'Colour split', description: 'In game pixels.' }),
        part('amount', 0.3),
        num('rate', 12, 0, 60, 1),
        num('seed', 0, 0, 1000, 1),
    ],
    rgbSplit: [point('red', [-1, 0]), point('green', [0, 0]), point('blue', [1, 0])],
    grain: [part('amount', 0.08), num('size', 1, 1, 8, 0.5), choice('animated', 1, [{ label: 'Frozen', value: 0 }, { label: 'Moving', value: 1 }])],
    oldFilm: [part('sepia', 0.7), part('noise', 0.12), part('scratches', 0.4), part('flicker', 0.5), part('vignette', 0.4)],
    palette: [part('dither', 0.03, { description: 'How much to shake before matching: 0 matches exactly.' })],
    dither: [num('levels', 8, 2, 32, 1, { description: 'Steps per channel.' }), part('strength', 1)],
    posterize: [num('levels', 4, 2, 32, 1, { description: 'Steps per channel.' })],
    phosphor: [num('persistence', 0.6, 0, 0.99, 0.01)],
    ntsc: [part('bleed', 0.6), part('crawl', 0.3), part('artifacts', 0.2)],
    lcd: [part('grid', 0.35), part('ghosting', 0.4), color('tint', [1, 1, 1])],
    crt: [
        part('scanlines', 0.45),
        part('mask', 0),
        choice('maskType', 0, [{ label: 'Aperture', value: 0 }, { label: 'Slot', value: 1 }, { label: 'Shadow', value: 2 }], { label: 'Mask type' }),
        num('maskScale', 1, 1, 4, 1),
        num('curvature', 0.06, 0, 0.5, 0.01),
        part('vignette', 0.25),
        part('sharpness', 0.5),
        part('beam', 0.6),
        num('brightness', 1.15, 0, 2, 0.01),
        choice('gamma', 1, [{ label: 'In light', value: 1 }, { label: 'In stored numbers', value: 0 }], { description: 'How the lines blend.' }),
        part('halation', 0.12),
        num('convergence', 0, 0, 4, 0.1, { description: 'How far the red and blue beams miss, in game pixels.' }),
        part('noise', 0),
        part('flicker', 0),
        choice('interlace', 0, OFF_ON),
        num('cornerRadius', 0.03, 0, 0.2, 0.005, { label: 'Corners' }),
        color('bezel', [0, 0, 0]),
    ],
};
