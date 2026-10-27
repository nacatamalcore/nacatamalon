/**
 * Where an asset is in its load. `'loading'` from the moment it is asked for, then exactly one
 * of `'ready'` (usable) or `'error'` (it will never be usable).
 *
 * `'released'` is the end of an asset the game let go of with `releaseAsset`: whatever still
 * holds it is not drawn or played, and the same key loads afresh the next time it is asked for.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TLoadStatus = 'loading' | 'ready' | 'error' | 'released';
