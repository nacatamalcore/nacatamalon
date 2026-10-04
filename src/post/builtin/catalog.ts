import { crt } from './crt';
import { dither } from './dither';
import { lutGrade } from './lut_grade';
import { paletteMatch } from './palette_match';
import { posterize } from './posterize';
import type { TPostBuiltinInfo } from './types/t_builtin';

/**
 * The five the engine holds, in the order they belong in a chain.
 *
 * That order is the advice, not a rule the engine enforces: **grade first, limit last.** A table
 * moves colours about and the next three take colours away, so grading after limiting would grade
 * colours the machine was never going to show. The tube goes after all of them: it is what the
 * colours that survived are shown on.
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
        key: 'crt',
        label: 'CRT',
        description: 'Scanlines, a phosphor mask, the bulge of the glass and darker corners: the picture on a tube.',
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
