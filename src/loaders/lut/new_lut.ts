import { markWatchable } from '../../store/record_version';
import type { TLut } from './types/t_lut';

/**
 * The empty table record, handed back the moment one is asked for.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const newLut = (src: string, key: string): TLut => markWatchable({
    type: 'lut',
    key,
    src,
    status: 'loading',
    size: 0,
    gpu: null,
});
