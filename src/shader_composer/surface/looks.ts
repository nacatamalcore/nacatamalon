import type { TColorOption } from '../../color';
import { colorUniform } from '../../post/builtin/color_uniform';
import type { TEffectField } from '../../post/builtin/types/t_builtin';
import type { TLook, TMangaDotsLook, TRimLook, TToonLook, TUnlitLook } from './types';

/**
 * A colour as a look takes it: what `getColor` takes, a `TColor`, or `[r, g, b]` from `0` to `1`.
 */
type TLookColor = TColorOption | [number, number, number];

/**
 * The light cut into flat bands, the cartoon look: the surface is lit or it is not, with nothing
 * smeared between, and the shine is one hard spot. For a material's `lighting`.
 *
 * It cuts the light every light of the scene gives (the sun, the lamps, the shadows they cast), and
 * only its brightness: each band keeps the colour of the light that made it, so a warm lamp gives
 * warm bands and a white light greys.
 *
 * It also says which part it put in shadow, so a step after it (`mangaDots`) inks exactly there.
 *
 * @param options `bands` how many steps of light (default `2`); `shadow` how bright the darkest one
 * is, `0` to `1` (default `0.45`); `spot` where the shine is cut, `0` to `1` (default `0.75`).
 * @returns The look, for `createMaterial({ lighting })` or `createModel({ lighting })`.
 *
 * @example
 * ```ts
 * declare const tint: TColor;
 *
 * createMaterial({ shader: 'mesh3d', tint, lighting: toonLighting({ bands: 3 }) });
 * ```
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const toonLighting = (options: { bands?: number; shadow?: number; spot?: number } = {}): TToonLook => ({
    look: 'toon',
    bands: options.bands ?? 2,
    shadow: options.shadow ?? 0.45,
    spot: options.spot ?? 0.75,
});

/**
 * No light at all: the surface exactly as it is painted (its picture, its tint and what it gives off
 * itself), the same from every side and in every shadow. For a material's `lighting`: a sky, a
 * screen, a sign that glows, anything that is not lit but is a light.
 *
 * @returns The look, for `createMaterial({ lighting })` or `createModel({ lighting })`.
 *
 * @example
 * ```ts
 * declare const tint: TColor;
 *
 * createMaterial({ shader: 'mesh3d', tint, lighting: unlitLighting() });
 * ```
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const unlitLighting = (): TUnlitLook => ({ look: 'unlit' });

/**
 * Dots of ink in the shadow, the way printed comics shaded: the darker, the bigger. They are laid out
 * on the screen and not on the model, so they stay put as it turns. For a material's `steps`.
 *
 * After `toonLighting` the dots go exactly where its bands went dark; with the engine's light they grow
 * smoothly into the dark.
 *
 * @param options `size` how far apart the dots are, in game pixels (default `5`); `fill` how big a dot
 * grows in full shadow, as a part of its cell (default `0.3`; past `0.5` they touch); `ink` its colour,
 * what `getColor` takes, a `TColor` or `[r, g, b]` (default a deep violet).
 * @returns The look, for `createMaterial({ steps })` or `createModel({ steps })`.
 *
 * @example
 * ```ts
 * declare const tint: TColor;
 *
 * createMaterial({ shader: 'mesh3d', tint, lighting: toonLighting(), steps: [mangaDots({ size: 4 })] });
 * ```
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const mangaDots = (options: { size?: number; fill?: number; ink?: TLookColor } = {}): TMangaDotsLook => ({
    look: 'mangaDots',
    size: options.size ?? 5,
    fill: options.fill ?? 0.3,
    ink: colorUniform(options.ink, [0.16, 0.1, 0.26]),
});

/**
 * A light along the edge that turns away from the camera, as if lit from behind. The edge goes
 * towards `color` and never past it, so it brightens without burning. For a material's `steps`.
 *
 * @param options `color`, what `getColor` takes, a `TColor` or `[r, g, b]` (default white); `power`
 * how tightly it keeps to the silhouette (default `4`); `amount` how far the edge goes towards the
 * colour, `0` to `1` (default `0.7`).
 * @returns The look, for `createMaterial({ steps })` or `createModel({ steps })`.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const rim = (options: { color?: TLookColor; power?: number; amount?: number } = {}): TRimLook => ({
    look: 'rim',
    color: colorUniform(options.color, [1, 1, 1]),
    power: options.power ?? 4,
    amount: options.amount ?? 0.7,
});

/**
 * What a tool needs to offer one of the looks: its key, a name and a line about it, which slot it
 * goes in, and the look with its defaults.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMaterialLookInfo = {
    /**
     * How a document names it.
     *
     * **These strings are API.** They are written into scene documents, so renaming one breaks every
     * scene that used it.
     */
    key: TLook['look'];
    label: string;
    description: string;
    /**
     * `'lighting'` takes one, in place of the engine's light; `'step'` goes in a list, in order.
     */
    slot: 'lighting' | 'step';
    /**
     * Its knobs, for a form to be made of them: every field of the look but `look`, with its range.
     */
    fields: readonly TEffectField[];
    /**
     * The fields it called something else before, old name to the name it has now, so a scene saved
     * before a rename keeps its values.
     *
     * The renames are applied all at once, as a swap, never one after another: `{ spacing: 'size',
     * size: 'fill' }` turns an old `{ spacing: 6, size: 0.4 }` into `{ size: 6, fill: 0.4 }`. A
     * document is taken as old, and translated, only when it has a field that is an old name and is
     * no field of the look now (`spacing` above); otherwise it is taken as already written with the
     * names of today and left as it is, so `{ size: 6, fill: 0.4 }` stays.
     */
    renamed?: Readonly<Record<string, string>>;
    build: () => TLook;
};

/**
 * Every look the engine has, for an editor to list and a document to be checked against.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MATERIAL_LOOKS: readonly TMaterialLookInfo[] = [
    {
        key: 'toon', label: 'Toon', description: 'Light in flat bands and one hard spot of shine: the cartoon look.', slot: 'lighting',
        fields: [
            { key: 'bands', type: 'number', default: 2, min: 1, max: 8, step: 1, description: 'How many steps of light.' },
            { key: 'shadow', type: 'number', default: 0.45, min: 0, max: 1, step: 0.01, description: 'How bright the darkest band is.' },
            { key: 'spot', type: 'number', default: 0.75, min: 0, max: 1, step: 0.01, description: 'Where the shine is cut.' },
        ],
        build: () => toonLighting(),
    },
    { key: 'unlit', label: 'Unlit', description: 'No light at all: the surface as it is painted, glowing or flat.', slot: 'lighting', fields: [], build: () => unlitLighting() },
    {
        key: 'mangaDots', label: 'Manga dots', description: 'Dots of ink in the shadow, laid out on the screen, bigger where darker.', slot: 'step',
        fields: [
            { key: 'size', type: 'number', default: 5, min: 2, max: 32, step: 0.5, description: 'How far apart, in game pixels.' },
            { key: 'fill', type: 'number', default: 0.3, min: 0, max: 1, step: 0.01, description: 'How big a dot grows in full shadow; past 0.5 they touch.' },
            { key: 'ink', type: 'color', default: [0.16, 0.1, 0.26] },
        ],
        renamed: { spacing: 'size', size: 'fill' },
        build: () => mangaDots(),
    },
    {
        key: 'rim', label: 'Rim', description: 'A light along the edge that turns away from the camera.', slot: 'step',
        fields: [
            { key: 'color', label: 'Colour', type: 'color', default: [1, 1, 1] },
            { key: 'power', type: 'number', default: 4, min: 0.5, max: 16, step: 0.1, description: 'How tightly it keeps to the silhouette.' },
            { key: 'amount', type: 'number', default: 0.7, min: 0, max: 1, step: 0.01 },
        ],
        renamed: { strength: 'amount' },
        build: () => rim(),
    },
];

/**
 * The look a document named, or `null` if the engine has no such look.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const findMaterialLook = (key: string): TMaterialLookInfo | null =>
    MATERIAL_LOOKS.find((info) => info.key === key) ?? null;
