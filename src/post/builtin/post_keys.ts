/**
 * The keys of the post effects the engine has, in the order the editor shows them: what a project
 * names in its `post` list.
 *
 * Written out rather than read off the catalog, so a game that lists them does not carry every
 * effect's fields and shaders.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const POST_KEYS: readonly string[] = [
    'lutGrade', 'colorAdjust', 'wave', 'shockwave', 'distort', 'mosaic', 'blur', 'zoomBlur', 'motionBlur',
    'tiltShift', 'bloom', 'godrays', 'halftone', 'ascii', 'glitch', 'rgbSplit', 'grain', 'oldFilm',
    'paletteMatch', 'dither', 'posterize', 'phosphor', 'ntsc', 'lcd', 'crt',
];
