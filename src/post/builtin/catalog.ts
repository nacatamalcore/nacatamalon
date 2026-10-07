import { bloom } from './bloom';
import { blur } from './blur';
import { colorAdjust } from './color_adjust';
import { crt } from './crt';
import { distort } from './distort';
import { dither } from './dither';
import { glitch } from './glitch';
import { godrays } from './godrays';
import { grain } from './grain';
import { halftone } from './halftone';
import { lcd } from './lcd';
import { lutGrade } from './lut_grade';
import { mosaic } from './mosaic';
import { motionBlur } from './motion_blur';
import { ntsc } from './ntsc';
import { oldFilm } from './old_film';
import { paletteMatch } from './palette_match';
import { phosphor } from './phosphor';
import { posterize } from './posterize';
import { rgbSplit } from './rgb_split';
import { shockwave } from './shockwave';
import { tiltShift } from './tilt_shift';
import { wave } from './wave';
import { zoomBlur } from './zoom_blur';
import type { TPostBuiltinInfo } from './types/t_builtin';

/**
 * The effects the engine holds, in the order they belong in a chain.
 *
 * That order is the advice, not a rule the engine enforces: **grade first, limit last, the screen
 * at the very end.** Grading and adjusting move colours about. Then what happens in the world:
 * distortions, blurs, glows, and the looks laid over the picture. Then the palette, the dither and
 * the posterize take colours away, so whatever came before them is shown in the colours the machine
 * actually had. Last comes what the picture was shown on: the glow of a phosphor, a composite cable,
 * a handheld's panel, a tube.
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const POST_BUILTINS: readonly TPostBuiltinInfo[] = [
    {
        key: 'lut',
        label: 'Colour grade',
        description: 'Looks every colour up in a grading table: warmer, colder, a green night.',
        binds: 'lut',
        build: () => lutGrade(),
    },
    {
        key: 'adjust',
        label: 'Colour adjust',
        description: 'Brightness, contrast, saturation, gamma, hue and a tint, each starting where it changes nothing.',
        binds: null,
        build: () => colorAdjust(),
    },
    {
        key: 'wave',
        label: 'Wave',
        description: 'Slides each line sideways by a moving wave, the way the hardware did heat and water.',
        binds: null,
        build: () => wave(),
    },
    {
        key: 'shockwave',
        label: 'Shockwave',
        description: 'A ring that pushes the picture outwards as the game moves it.',
        binds: null,
        build: () => shockwave(),
    },
    {
        key: 'distort',
        label: 'Distort',
        description: 'Bulges, pinches or twists a round patch of the picture.',
        binds: null,
        build: () => distort(),
    },
    {
        key: 'mosaic',
        label: 'Mosaic',
        description: 'Big square blocks, each the colour at its middle: the hardware mosaic.',
        binds: null,
        build: () => mosaic(),
    },
    {
        key: 'blur',
        label: 'Blur',
        description: 'A soft blur of the whole picture, worked out at half size.',
        binds: null,
        build: () => blur(),
    },
    {
        key: 'zoomBlur',
        label: 'Zoom blur',
        description: 'Smears the picture towards a point, as if rushing at it.',
        binds: null,
        build: () => zoomBlur(),
    },
    {
        key: 'motionBlur',
        label: 'Motion blur',
        description: 'Smears the picture along one direction.',
        binds: null,
        build: () => motionBlur(),
    },
    {
        key: 'tiltShift',
        label: 'Tilt shift',
        description: 'A sharp band with blur above and below: the scene as a model on a table.',
        binds: null,
        build: () => tiltShift(),
    },
    {
        key: 'bloom',
        label: 'Bloom',
        description: 'Bright parts glow into what is around them.',
        binds: null,
        build: () => bloom(),
    },
    {
        key: 'godrays',
        label: 'Light shafts',
        description: 'Rays streaming from a point past whatever stands in front of it.',
        binds: null,
        build: () => godrays(),
    },
    {
        key: 'halftone',
        label: 'Halftone',
        description: 'Printed dots or crossed lines, as in a comic or a newspaper.',
        binds: null,
        build: () => halftone(),
    },
    {
        key: 'glitch',
        label: 'Glitch',
        description: 'Bands torn sideways with the colours coming apart: a signal failing.',
        binds: null,
        build: () => glitch(),
    },
    {
        key: 'rgbSplit',
        label: 'RGB split',
        description: 'Red, green and blue each read from a slightly different place.',
        binds: null,
        build: () => rgbSplit(),
    },
    {
        key: 'grain',
        label: 'Grain',
        description: 'Moving grain, as chunky as the game\'s own pixels.',
        binds: null,
        build: () => grain(),
    },
    {
        key: 'oldFilm',
        label: 'Old film',
        description: 'Sepia, grain, scratches, flicker and dark edges, at twenty-four frames a second.',
        binds: null,
        build: () => oldFilm(),
    },
    {
        key: 'palette',
        label: 'Palette',
        description: 'Replaces every colour with the nearest one a palette actually holds.',
        binds: 'palette',
        build: () => paletteMatch(),
    },
    {
        key: 'dither',
        label: 'Dither',
        description: 'Cuts each channel to a few steps and hides the bands with an ordered pattern.',
        binds: null,
        build: () => dither(),
    },
    {
        key: 'posterize',
        label: 'Posterize',
        description: 'The same cut with nothing to hide the seams, for when hard bands are the look.',
        binds: null,
        build: () => posterize(),
    },
    {
        key: 'phosphor',
        label: 'Phosphor',
        description: 'Bright things moving fast leave a short trail, as on a tube.',
        binds: null,
        build: () => phosphor(),
    },
    {
        key: 'ntsc',
        label: 'Composite',
        description: 'Colour smeared sideways, crawling dots and rainbows: the picture down a composite cable.',
        binds: null,
        build: () => ntsc(),
    },
    {
        key: 'lcd',
        label: 'Handheld LCD',
        description: 'A grid between the pixels, a tint, and ghosts behind anything moving.',
        binds: null,
        build: () => lcd(),
    },
    {
        key: 'crt',
        label: 'CRT',
        description: 'Lines, a phosphor mask, the bulge and glow of the glass and the faults of a real tube. Four presets in CRT_PRESETS.',
        binds: null,
        build: () => crt(),
    },
];

/**
 * The built-in a project file named, or `null` if the engine has no such effect.
 *
 * `null` rather than a throw: a project naming an effect this version does not have should lose that
 * effect and keep its game.
 * @param key - The effect's name, as a project file writes it.
 * @returns What a tool needs to show it, or `null`.
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const findPostBuiltin = (key: string): TPostBuiltinInfo | null =>
    POST_BUILTINS.find((builtin) => builtin.key === key) ?? null;
