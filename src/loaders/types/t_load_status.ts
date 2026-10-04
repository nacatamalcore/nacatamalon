/**
 * Where an asset is in its load. `'loading'` from the moment it is asked for, then exactly one
 * of `'ready'` (usable) or `'error'` (it will never be usable), and it never goes back.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TLoadStatus = 'loading' | 'ready' | 'error';
