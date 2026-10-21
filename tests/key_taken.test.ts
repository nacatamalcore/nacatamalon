import { describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { useLoadTexture } from '../src/hooks/loaders/use_load_texture';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TTexture } from '../src/loaders';

/**
 * A key names one file. Asked for another under it, the cache hands back the first: said, so the
 * wrong picture or sound is not a mystery.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

describe('a key that already names another file', () => {
    it('is said, once, and the first file is the one used', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { store } = createTestGame();
        let red!: TTexture;
        let blue!: TTexture;
        let again!: TTexture;
        startTestScene(store, 'Level', () => {
            red = useLoadTexture({ src: '/hero_red.png', key: 'hero' });
            blue = useLoadTexture({ src: '/hero_blue.png', key: 'hero' });
            again = useLoadTexture({ src: '/hero_blue.png', key: 'hero' });
            return createScene();
        });
        const said = warn.mock.calls.map((call) => String(call[0])).filter((line) => line.includes("the key 'hero'"));
        warn.mockRestore();

        expect(blue).toBe(red);
        expect(again).toBe(red);
        expect(said).toHaveLength(1);
        expect(said[0]).toContain("already names '/hero_red.png', so '/hero_blue.png' was not loaded");
    });

    it('says nothing when the same file is asked for again, or when no key is given', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            useLoadTexture({ src: '/hero.png', key: 'hero' });
            useLoadTexture({ src: '/hero.png', key: 'hero' });
            useLoadTexture({ src: '/coin.png' });
            useLoadTexture({ src: '/coin.png' });
            return createScene();
        });
        const said = warn.mock.calls.map((call) => String(call[0])).filter((line) => line.includes('already names'));
        warn.mockRestore();
        expect(said).toHaveLength(0);
    });
});
