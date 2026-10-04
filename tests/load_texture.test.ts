import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { loadTexture } from '../src/loaders/texture/load_texture';
import { newTexture } from '../src/loaders/texture/new_texture';
import { createTestGame } from './helpers/test_game';

/**
 * Who closes a decoded image. The renderer takes it in `createTexture`, so the loader must not close
 * it after the upload: WebGL2 keeps it to upload it again when its context comes back.
 */

/**
 * A decoded image that remembers whether it was closed.
 */
const fakeBitmap = () => {
    const bitmap = { width: 16, height: 8, close: mock(() => {}) };
    return bitmap;
};

const stubDecoding = (bitmap: ReturnType<typeof fakeBitmap>): void => {
    spyOn(globalThis, 'fetch').mockImplementation((async () => new Response(new Blob(['png']))) as unknown as typeof fetch);
    Object.assign(globalThis, { createImageBitmap: async () => bitmap });
};

describe('loadTexture', () => {
    afterEach(() => {
        mock.restore();
    });

    it('hands the image to the renderer and does not close it', async () => {
        const { store, renderer } = createTestGame();
        const bitmap = fakeBitmap();
        stubDecoding(bitmap);
        const received: unknown[] = [];
        renderer.createTexture = (image) => {
            received.push(image);
            return { resourceType: 'texture' };
        };

        const texture = newTexture('/hero.png', '/hero.png');
        await loadTexture(store, texture);

        expect(texture.status).toBe('ready');
        expect(received).toEqual([bitmap]);
        expect(bitmap.close).not.toHaveBeenCalled();
    });

    it('closes the image itself when the game is already gone', async () => {
        const { store, renderer } = createTestGame();
        const bitmap = fakeBitmap();
        stubDecoding(bitmap);
        const createTexture = spyOn(renderer, 'createTexture');
        store.setState('loop', { destroyed: true });

        const texture = newTexture('/hero.png', '/hero.png');
        await loadTexture(store, texture);

        expect(createTexture).not.toHaveBeenCalled();
        expect(bitmap.close).toHaveBeenCalledTimes(1);
        expect(texture.status).toBe('loading');
    });
});
