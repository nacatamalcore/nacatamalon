/**
 * Which family of built-in shader a material plugs into, and so what its hooks are handed.
 *
 * `'sprite2d'` is handed a colour already sampled and already tinted, and the flat square's place on
 * it. `'mesh3d'` is handed a surface and everything the light knew about it, and may also move the
 * corner before any of that happens. `'post'` is handed the finished frame.
 *
 * A screen-wide effect takes **the same hooks as a sprite**, on purpose: a CRT over one sprite and a
 * CRT over the whole picture are the same arithmetic, so they should be the same file.
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMaterialShader = 'sprite2d' | 'mesh3d' | 'post';

/**
 * What kind a material's own parameter may be: one number, or two, three or four of them.
 *
 * A small set on purpose. It covers what an effect is actually tuned with (a strength, a count, a
 * colour, an offset) and leaves out matrices and lists, which bring alignment rules that are all
 * cost and no use here. The one matrix a drawing needs is the one that puts it on screen, and that
 * already travels with the drawing rather than with its surface.
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TUniformType = 'f32' | 'vec2<f32>' | 'vec3<f32>' | 'vec4<f32>';

/**
 * A material's own parameters, by name. One number, or a list of two to four.
 *
 * Change one and the next frame shows it: the card is handed these again every draw, so animating a
 * strength is an assignment and nothing else.
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TUniformValues = Record<string, number | number[]>;

/**
 * What kind each of those parameters is.
 *
 * Worked out once from the shape of the first values it was given, and **fixed from then on**: how
 * the numbers are laid out in memory depends on it, and the shader has already been compiled
 * against that layout.
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TUniformSignature = Record<string, TUniformType>;
