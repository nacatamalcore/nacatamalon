/**
 * A lump of numbers living in a backend's memory: the corners of something, or the numbers a
 * shader reads for every one of them.
 *
 * Opaque on purpose, like a texture: the game hands it back and only the renderer that made it
 * knows what is inside.
 *
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type IBuffer = {
    readonly resourceType: 'buffer';
};

/**
 * What a buffer is for, which decides what a shader may do with it.
 *
 * - `'vertex'`: the corners of what is drawn.
 * - `'index'`: which corners make each triangle, so a shared corner is written once.
 * - `'uniform'`: the same handful of numbers for a whole draw.
 * - `'storage'`: a run of numbers the shader reads by position, as long as it needs to be. It is
 *   what a skeleton's bones travel in: how many a model has is not known until its file arrives,
 *   and a run of the other kind has to have its length written into the shader.
 *
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TBufferUsage = 'vertex' | 'index' | 'uniform' | 'storage';
