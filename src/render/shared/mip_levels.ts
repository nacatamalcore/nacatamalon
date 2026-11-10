/**
 * How many pictures a texture's chain of mipmaps holds: the texture itself, then each half the one
 * before (rounded down), down to one pixel. 256 by 64 has nine: 256, 128, 64, 32, 16, 8, 4, 2, 1.
 *
 * Both backends make the same chain, so a model far away reads the same copy in each.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const mipLevelsOf = (width: number, height: number): number =>
    Math.floor(Math.log2(Math.max(1, width, height))) + 1;
