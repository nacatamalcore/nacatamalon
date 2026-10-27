import type { TLoadStatus } from '../types/t_load_status';

/**
 * Whether a texture has no picture to show and nothing should be drawn in its place: still
 * loading, or released. An `'error'` is not away, it draws as its tint so the mistake shows.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const isAway = (texture: { readonly status: TLoadStatus } | null | undefined): boolean =>
    texture?.status === 'loading' || texture?.status === 'released';
