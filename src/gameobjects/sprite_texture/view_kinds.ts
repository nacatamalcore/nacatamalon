import type { TDrawable } from '../types';

/**
 * The kinds of drawing a view's filter can name (`TViewFilter.kinds`): one list for the code and for
 * a scene document, so the two never disagree about what a kind is.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const VIEW_KINDS: ReadonlySet<string> = new Set<TDrawable['type']>(['sprite', 'text', 'nine-slice', 'tilemap', 'particles', 'particles-3d', 'mesh', 'lines', 'polygon', 'shapes', 'custom']);
