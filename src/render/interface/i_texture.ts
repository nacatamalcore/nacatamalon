/**
 * A texture living in a backend's memory. Opaque on purpose: the game only carries it around and
 * hands it back, and only the renderer that created it knows what is inside.
 *
 * `I` like `IRenderer`: every backend has its own version of what sits behind it.
 *
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type ITexture = {
    readonly resourceType: 'texture';
};
