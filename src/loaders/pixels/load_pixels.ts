import { bumpVersion } from '../../store/record_version';
import { decodePng } from '../../pixels/decode_png';
import type { TLoadedPixels } from './types/t_loaded_pixels';
import type { TRuntimeStore } from '../../store';

/**
 * Fetches a PNG and decodes it into pixels, in plain JavaScript: no canvas, so it works the same in
 * the browser and on the native runtime.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const loadPixels = async (store: TRuntimeStore, record: TLoadedPixels): Promise<void> => {
    try {
        const response = await fetch(record.src);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const pixels = decodePng(new Uint8Array(await response.arrayBuffer()));
        if (store.get('loop').destroyed) {
            return;
        }
        record.pixels = pixels;
        record.status = 'ready';
        bumpVersion(record);
    } catch (error: unknown) {
        record.status = 'error';
        bumpVersion(record);
        console.warn(
            `[NacatamalOn] useLoadPixels: '${record.src}' could not be loaded as pixels. ` +
            'Textures made from it stay empty.',
            error,
        );
    }
};
