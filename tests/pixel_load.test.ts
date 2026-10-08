import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createPixelTexture } from '../src/gameobjects/pixel_texture';
import { useLoadPixels } from '../src/hooks/loaders/use_load_pixels';
import { useLoader } from '../src/hooks/loaders/use_loader';
import { whenLoaded } from '../src/loaders/track_load';
import { stopScene } from '../src/scene/stop_scene';
import { clonePixels, createPixels, fillRect, getPixel, swapColors } from '../src/pixels';
import { encodePng } from '../src/pixels/encode_png';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TLoadedPixels } from '../src/loaders/pixels';
import type { TTexture } from '../src/loaders';
import type { TLoader } from '../src/loaders/types/t_loader';

/**
 * A drawn picture loaded as pixels to process in code, and the textures made from it.
 */

const BLUE = { r: 0, g: 0, b: 1, a: 1 };
const RED = { r: 1, g: 0, b: 0, a: 1 };

// A 4 x 2 picture, blue on the left half and transparent on the right, served as a PNG.
const drawn = (() => {
    const p = createPixels(4, 2);
    fillRect(p, 0, 0, 2, 2, BLUE);
    return encodePng(p);
})();

const realFetch = globalThis.fetch;
let requests: string[] = [];

beforeEach(() => {
    requests = [];
    globalThis.fetch = (async (url: string) => {
        requests.push(url);
        return url.endsWith('missing.png')
            ? new Response(null, { status: 404 })
            : new Response(drawn.slice().buffer as ArrayBuffer, { status: 200 });
    }) as unknown as typeof fetch;
});

afterEach(() => {
    globalThis.fetch = realFetch;
});

/**
 * Lets the file land and everything waiting on it run.
 */
const landed = async (record: TLoadedPixels): Promise<void> => {
    await whenLoaded(record);
    await Promise.resolve();
};

describe('useLoadPixels', () => {
    it('comes back loading, and holds the decoded picture once the file lands', async () => {
        const { store } = createTestGame();
        let hero!: TLoadedPixels;
        startTestScene(store, 'S', () => {
            hero = useLoadPixels({ src: '/hero.png' });
            return createScene();
        });

        expect(hero.status).toBe('loading');
        expect(hero.pixels).toBeNull();

        await landed(hero);

        expect(hero.status).toBe('ready');
        expect([hero.pixels!.width, hero.pixels!.height]).toEqual([4, 2]);
        expect(getPixel(hero.pixels!, 0, 0)).toEqual(BLUE);
        expect(getPixel(hero.pixels!, 3, 0).a).toBe(0);
    });

    it('fetches a file once however many scenes ask for it, and is counted by useLoader', async () => {
        const { store } = createTestGame();
        let first!: TLoadedPixels;
        let second!: TLoadedPixels;
        let loader!: TLoader;
        startTestScene(store, 'S', () => {
            first = useLoadPixels({ src: '/hero.png' });
            second = useLoadPixels({ src: '/hero.png' });
            loader = useLoader();
            return createScene();
        });

        expect(second).toBe(first);
        expect(requests).toEqual(['/hero.png']);
        expect(loader.total).toBe(1);
    });

    it('settles as an error, with a warning, when the file is not there', async () => {
        const { store } = createTestGame();
        let missing!: TLoadedPixels;
        startTestScene(store, 'S', () => {
            missing = useLoadPixels({ src: '/missing.png' });
            return createScene();
        });

        await landed(missing);

        expect(missing.status).toBe('error');
        expect(missing.pixels).toBeNull();
    });
});

describe('createPixelTexture from a loaded picture', () => {
    it('is loading at first, then shows the picture as the function left it, on a copy', async () => {
        const { store, renderer } = createTestGame();
        const made: { width: number; height: number }[] = [];
        const create = renderer.createDataTexture;
        renderer.createDataTexture = (data, width, height) => {
            made.push({ width, height });
            return create(data, width, height);
        };
        let hero!: TLoadedPixels;
        let red!: TTexture;
        startTestScene(store, 'S', () => {
            hero = useLoadPixels({ src: '/hero.png' });
            red = createPixelTexture(hero, (p) => swapColors(p, [[BLUE, RED]]));
            return createScene();
        });

        expect(red.status).toBe('loading');
        expect(red.gpu).toBeNull();

        await landed(hero);

        expect(red.status).toBe('ready');
        expect([red.width, red.height]).toEqual([4, 2]);
        expect(made).toEqual([{ width: 4, height: 2 }]);
        // The loaded picture, shared by every scene that loads the file, is untouched.
        expect(getPixel(hero.pixels!, 0, 0)).toEqual(BLUE);
    });

    it('settles as an error when the picture could not be loaded', async () => {
        const { store } = createTestGame();
        let missing!: TLoadedPixels;
        let texture!: TTexture;
        startTestScene(store, 'S', () => {
            missing = useLoadPixels({ src: '/missing.png' });
            texture = createPixelTexture(missing);
            return createScene();
        });

        await landed(missing);

        expect(texture.status).toBe('error');
        expect(texture.gpu).toBeNull();
    });

    it('uploads nothing when its scene has stopped before the file lands', async () => {
        const { store, renderer } = createTestGame();
        let uploads = 0;
        const create = renderer.createDataTexture;
        renderer.createDataTexture = (data, width, height) => {
            uploads++;
            return create(data, width, height);
        };
        let hero!: TLoadedPixels;
        let texture!: TTexture;
        startTestScene(store, 'S', () => {
            hero = useLoadPixels({ src: '/hero.png' });
            texture = createPixelTexture(hero);
            return createScene();
        });

        stopScene(store, 'S');
        await landed(hero);

        expect(uploads).toBe(0);
        expect(texture.gpu).toBeNull();
    });

    it('is ready at once when the picture had already arrived', async () => {
        const { store } = createTestGame();
        let hero!: TLoadedPixels;
        startTestScene(store, 'First', () => {
            hero = useLoadPixels({ src: '/hero.png' });
            return createScene();
        });
        await landed(hero);

        let texture!: TTexture;
        startTestScene(store, 'Second', () => {
            texture = createPixelTexture(useLoadPixels({ src: '/hero.png' }));
            return createScene();
        });

        expect(texture.status).toBe('ready');
    });
});

describe('clonePixels and swapColors', () => {
    it('copies a picture so painting the copy leaves the original alone', () => {
        const original = createPixels(2, 1, BLUE);
        const copy = fillRect(clonePixels(original), 0, 0, 1, 1, RED);
        expect(getPixel(original, 0, 0)).toEqual(BLUE);
        expect(getPixel(copy, 0, 0)).toEqual(RED);
    });

    it('swaps exact colours only, and trades two colours swapped for each other', () => {
        const p = createPixels(3, 1);
        fillRect(p, 0, 0, 1, 1, BLUE);
        fillRect(p, 1, 0, 1, 1, RED);
        fillRect(p, 2, 0, 1, 1, { r: 0, g: 0, b: 0.99, a: 1 });

        swapColors(p, [[BLUE, RED], [RED, BLUE]]);

        expect(getPixel(p, 0, 0)).toEqual(RED);
        expect(getPixel(p, 1, 0)).toEqual(BLUE);
        // Nearly blue is not blue.
        expect(getPixel(p, 2, 0).b).toBeCloseTo(0.99, 2);
    });
});
