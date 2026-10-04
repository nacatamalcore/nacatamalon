import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { useRandom } from '../src/hooks/random/use_random';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TRandomHandle } from '../src/math/random';

/**
 * The first ten draws of a fresh game created with `seed`.
 */
const drawsWith = (seed?: number): number[] => {
    const { store } = createTestGame({ seed });
    let random!: TRandomHandle;
    startTestScene(store, 'Level', () => {
        random = useRandom();
        return createScene();
    });
    return Array.from({ length: 10 }, () => random.rand());
};

describe('useRandom', () => {
    it('refuses to be called outside a scene body', () => {
        expect(() => useRandom()).toThrow('[NacatamalOn] useRandom');
    });

    it('replays the same numbers for the same seed', () => {
        expect(drawsWith(7)).toEqual(drawsWith(7));
    });

    it('draws different numbers for a different seed', () => {
        expect(drawsWith(7)).not.toEqual(drawsWith(8));
    });

    it('is the same generator for every scene of one game', () => {
        const { store } = createTestGame({ seed: 3 });
        let first!: TRandomHandle;
        let second!: TRandomHandle;
        startTestScene(store, 'A', () => { first = useRandom(); return createScene(); });
        startTestScene(store, 'B', () => { second = useRandom(); return createScene(); });

        expect(first).toBe(second);
    });
});
