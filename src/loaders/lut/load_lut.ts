import { bumpVersion } from '../../store/record_version';
import { lutSizeForStrip, parseCubeDoc } from './lut_document';
import type { TLut } from './types/t_lut';
import type { TRuntimeStore } from '../../store';

/**
 * A `.cube` is text; anything else is a strip picture. The extension is the only difference.
 */
const isCube = (src: string): boolean => src.split('?')[0]!.toLowerCase().endsWith('.cube');

/**
 * Fetches a grading table, in either of the two shapes one comes in, and uploads the strip.
 *
 * A `.cube` is read here and turned into a strip; a picture already is one, and its size is read
 * **from its own shape** rather than from anything that could disagree with it.
 *
 * Never rejects. A table that does not arrive leaves the effect grading with nothing, which shows
 * the frame as it was.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const loadLut = async (store: TRuntimeStore, lut: TLut): Promise<void> => {
    try {
        const response = await fetch(lut.src);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        if (isCube(lut.src)) {
            const doc = parseCubeDoc(await response.text());
            if (store.get('loop').destroyed) {
                return;
            }
            lut.size = doc.size;
            lut.gpu = store.get('screen').renderer.createDataTexture(doc.data, doc.size * doc.size, doc.size);
            lut.status = 'ready';
            bumpVersion(lut);
            return;
        }

        // `premultiplyAlpha: 'none'`: a table is numbers that happen to be stored as a picture, and
        // a browser helpfully multiplying them by their alpha would quietly change every one.
        const bitmap = await createImageBitmap(await response.blob(), { premultiplyAlpha: 'none' });
        if (store.get('loop').destroyed) {
            bitmap.close();
            return;
        }

        const size = lutSizeForStrip(bitmap.width, bitmap.height);
        if (size === 0) {
            bitmap.close();
            throw new Error(
                `it is ${bitmap.width} by ${bitmap.height}, and a strip has to be N slices of N by N ` +
                'laid side by side, so N squared across and N down',
            );
        }

        lut.size = size;
        lut.gpu = store.get('screen').renderer.createTexture(bitmap);
        lut.status = 'ready';
        bumpVersion(lut);
    } catch (error: unknown) {
        lut.status = 'error';
        bumpVersion(lut);
        console.warn(
            `[NacatamalOn] useLoadLut: '${lut.src}' could not be loaded. Effects grading with it show ` +
            'the frame unchanged.',
            error,
        );
    }
};
