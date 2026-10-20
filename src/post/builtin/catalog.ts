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
import { ascii } from './ascii';
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
import { BUILTIN_FIELDS } from './builtin_fields';
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
 * **One idea has one name in all of them.** `amount` is how much an effect shows, `0` the picture
 * untouched to `1`; `intensity` a brightness that may pass `1`, as a light's; `size` the side of a
 * cell, a block or a dot, in game pixels; `scale` a multiplier with no unit; `radius` a reach in
 * game pixels; `center` a point from `[0, 0]`, the top left, to `[1, 1]`. A name never changes its
 * kind from one effect to the next; one that says more is its own word (`crt`'s `cornerRadius` is a
 * part of the screen, `maskScale` a multiplier of the screen's real pixels). A knob renamed to keep
 * to that is in its effect's `renamed`, so a chain written before still reads.
 *
 * **Some already hold another's work**, so stacking the two does it twice: `crt` has its own glow
 * (`halation`), noise, `vignette`, `flicker` and colour split (`convergence`); `oldFilm` its own
 * grain, vignette and flicker; `glitch` a colour split; `paletteMatch` its own `dither`; `lcd`'s
 * `ghosting` and `phosphor` both leave a trail; `posterize` is `dither` with `amount: 0`. The
 * composite ones are meant to be used alone, as the whole machine.
 *
 * **The ones laid on a grid of game pixels** (mosaic, halftone, ascii, dither's four by four,
 * grain, lcd, and the material step `mangaDots`) look cleanest with sizes that are multiples of one
 * another: two grids that do not divide each other beat into a moiré. `crt`'s mask is laid on the
 * screen's real pixels instead, so it beats with none of them.
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const POST_BUILTINS: readonly TPostBuiltinInfo[] = [
    {
        key: 'lutGrade',
        formerKeys: ['lut'],
        label: 'Colour grade',
        description: 'Looks every colour up in a grading table: warmer, colder, a green night.',
        binds: 'lut',
        fields: BUILTIN_FIELDS.lutGrade!,
        build: () => lutGrade(),
    },
    {
        key: 'colorAdjust',
        formerKeys: ['adjust'],
        label: 'Colour adjust',
        description: 'Brightness, contrast, saturation, gamma, hue and a tint, each starting where it changes nothing.',
        binds: null,
        fields: BUILTIN_FIELDS.colorAdjust!,
        build: () => colorAdjust(),
    },
    {
        key: 'wave',
        label: 'Wave',
        description: 'Slides each line sideways by a moving wave, the way the hardware did heat and water.',
        binds: null,
        fields: BUILTIN_FIELDS.wave!,
        build: () => wave(),
    },
    {
        key: 'shockwave',
        label: 'Shockwave',
        description: 'A ring that pushes the picture outwards as the game moves it.',
        binds: null,
        fields: BUILTIN_FIELDS.shockwave!,
        build: () => shockwave(),
    },
    {
        key: 'distort',
        label: 'Distort',
        description: 'Bulges, pinches or twists a round patch of the picture.',
        binds: null,
        fields: BUILTIN_FIELDS.distort!,
        build: () => distort(),
    },
    {
        key: 'mosaic',
        label: 'Mosaic',
        description: 'Big square blocks, each the colour at its middle: the hardware mosaic.',
        binds: null,
        fields: BUILTIN_FIELDS.mosaic!,
        build: () => mosaic(),
    },
    {
        key: 'blur',
        label: 'Blur',
        description: 'A soft blur of the whole picture, worked out at half size.',
        binds: null,
        fields: BUILTIN_FIELDS.blur!,
        build: () => blur(),
    },
    {
        key: 'zoomBlur',
        label: 'Zoom blur',
        description: 'Smears the picture towards a point, as if rushing at it.',
        binds: null,
        fields: BUILTIN_FIELDS.zoomBlur!,
        renamed: { strength: 'reach' },
        build: () => zoomBlur(),
    },
    {
        key: 'motionBlur',
        label: 'Motion blur',
        description: 'Smears the picture along one direction.',
        binds: null,
        fields: BUILTIN_FIELDS.motionBlur!,
        build: () => motionBlur(),
    },
    {
        key: 'tiltShift',
        label: 'Tilt shift',
        description: 'A sharp band with blur above and below: the scene as a model on a table.',
        binds: null,
        fields: BUILTIN_FIELDS.tiltShift!,
        build: () => tiltShift(),
    },
    {
        key: 'bloom',
        label: 'Bloom',
        description: 'Bright parts glow into what is around them.',
        binds: null,
        fields: BUILTIN_FIELDS.bloom!,
        build: () => bloom(),
    },
    {
        key: 'godrays',
        label: 'Light shafts',
        description: 'Rays streaming from a point past whatever stands in front of it.',
        binds: null,
        fields: BUILTIN_FIELDS.godrays!,
        build: () => godrays(),
    },
    {
        key: 'halftone',
        label: 'Halftone',
        description: 'Printed dots or crossed lines, as in a comic or a newspaper.',
        binds: null,
        fields: BUILTIN_FIELDS.halftone!,
        renamed: { scale: 'size', color: 'ownColor', angle: 'rotation' },
        converted: { angle: (degrees) => (degrees * Math.PI) / 180 },
        build: () => halftone(),
    },
    {
        key: 'ascii',
        label: 'ASCII',
        description: 'The frame in letters, as dense as the picture is bright, in its own colour or a terminal\'s.',
        binds: null,
        fields: BUILTIN_FIELDS.ascii!,
        renamed: { scale: 'size', color: 'ownColor' },
        // Its letters are written into it when it is made: a project entry's options.
        build: (options) => ascii({ glyphs: typeof options?.glyphs === 'string' ? options.glyphs : undefined }),
    },
    {
        key: 'glitch',
        label: 'Glitch',
        description: 'Bands torn sideways with the colours coming apart: a signal failing.',
        binds: null,
        fields: BUILTIN_FIELDS.glitch!,
        renamed: { rgb: 'split' },
        build: () => glitch(),
    },
    {
        key: 'rgbSplit',
        label: 'RGB split',
        description: 'Red, green and blue each read from a slightly different place.',
        binds: null,
        fields: BUILTIN_FIELDS.rgbSplit!,
        build: () => rgbSplit(),
    },
    {
        key: 'grain',
        label: 'Grain',
        description: 'Moving grain, as chunky as the game\'s own pixels.',
        binds: null,
        fields: BUILTIN_FIELDS.grain!,
        build: () => grain(),
    },
    {
        key: 'oldFilm',
        label: 'Old film',
        description: 'Sepia, grain, scratches, flicker and dark edges, at twenty-four frames a second.',
        binds: null,
        fields: BUILTIN_FIELDS.oldFilm!,
        renamed: { noise: 'grain' },
        build: () => oldFilm(),
    },
    {
        key: 'paletteMatch',
        formerKeys: ['palette'],
        label: 'Palette',
        description: 'Replaces every colour with the nearest one a palette actually holds.',
        binds: 'palette',
        fields: BUILTIN_FIELDS.paletteMatch!,
        build: () => paletteMatch(),
    },
    {
        key: 'dither',
        label: 'Dither',
        description: 'Cuts each channel to a few steps and hides the bands with an ordered pattern.',
        binds: null,
        fields: BUILTIN_FIELDS.dither!,
        renamed: { strength: 'amount' },
        build: () => dither(),
    },
    {
        key: 'posterize',
        label: 'Posterize',
        description: 'The same cut with nothing to hide the seams, for when hard bands are the look.',
        binds: null,
        fields: BUILTIN_FIELDS.posterize!,
        build: () => posterize(),
    },
    {
        key: 'phosphor',
        label: 'Phosphor',
        description: 'Bright things moving fast leave a short trail, as on a tube.',
        binds: null,
        fields: BUILTIN_FIELDS.phosphor!,
        build: () => phosphor(),
    },
    {
        key: 'ntsc',
        label: 'Composite',
        description: 'Colour smeared sideways, crawling dots and rainbows: the picture down a composite cable.',
        binds: null,
        fields: BUILTIN_FIELDS.ntsc!,
        build: () => ntsc(),
    },
    {
        key: 'lcd',
        label: 'Handheld LCD',
        description: 'A grid between the pixels, a tint, and ghosts behind anything moving.',
        binds: null,
        fields: BUILTIN_FIELDS.lcd!,
        build: () => lcd(),
    },
    {
        key: 'crt',
        label: 'CRT',
        description: 'Lines, a phosphor mask, the bulge and glow of the glass and the faults of a real tube. Four presets in CRT_PRESETS.',
        binds: null,
        fields: BUILTIN_FIELDS.crt!,
        renamed: { gamma: 'linearBlend' },
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
