import { markWatchable } from '../../store/record_version';
import type { TPalette } from './types/t_palette';

/**
 * The empty palette record, handed back the moment one is asked for.
 *
 * No colours yet, and that is a working state: an effect matching against an empty palette gives
 * back what it was handed, so the first frames look like the scene without its palette rather than
 * like a scene painted one colour.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const newPalette = (src: string, key: string): TPalette => markWatchable({
    type: 'palette',
    key,
    src,
    status: 'loading',
    name: '',
    colors: [],
    gpu: null,
});
