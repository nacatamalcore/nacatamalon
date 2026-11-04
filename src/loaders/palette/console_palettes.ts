/**
 * The machines whose colours the engine carries.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TConsolePaletteName = 'nes' | 'gameBoy' | 'c64';

/**
 * The colours of the machines that had a fixed list of them, as `#rrggbb`.
 *
 * Only those: a machine that wrote so many steps a channel, a SNES or a Mega Drive, has no list worth
 * carrying, and `posterize` with `POST_EFFECTS.COLOR_LEVELS` is what gives its look.
 *
 * None of them is exact, as these machines did not have one answer: a NES's colours were a television
 * signal and a Game Boy's a green screen. These are the values usually taken for them.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const CONSOLE_PALETTES: Readonly<Record<TConsolePaletteName, readonly string[]>> = {
    nes: [
        '#7c7c7c', '#0000fc', '#0000bc', '#4428bc', '#940084', '#a80020', '#a81000', '#881400',
        '#503000', '#007800', '#006800', '#005800', '#004058', '#000000', '#bcbcbc', '#0078f8',
        '#0058f8', '#6844fc', '#d800cc', '#e40058', '#f83800', '#e45c10', '#ac7c00', '#00b800',
        '#00a800', '#00a844', '#008888', '#f8f8f8', '#3cbcfc', '#6888fc', '#9878f8', '#f878f8',
        '#f85898', '#f87858', '#fca044', '#f8b800', '#b8f818', '#58d854', '#58f898', '#00e8d8',
        '#787878', '#fcfcfc', '#a4e4fc', '#b8b8f8', '#d8b8f8', '#f8b8f8', '#f8a4c0', '#f0d0b0',
        '#fce0a8', '#f8d878', '#d8f878', '#b8f8b8', '#b8f8d8', '#00fcfc',
    ],
    gameBoy: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
    c64: [
        '#000000', '#ffffff', '#880000', '#aaffee', '#cc44cc', '#00cc55', '#0000aa', '#eeee77',
        '#dd8855', '#664400', '#ff7777', '#333333', '#777777', '#aaff66', '#0088ff', '#bbbbbb',
    ],
};
