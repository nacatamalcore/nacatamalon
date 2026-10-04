import { describe, expect, it } from 'bun:test';
import { cleanGameOptions } from '../src/game/bootstrap/clean_gameoptions';
import { createTestGame } from './helpers/test_game';

/**
 * A game's `seed`: the same seed draws the same numbers, and 0 is a seed like any other.
 */
describe('the seed', () => {
    it('keeps 0, which a falsy check once turned into no seed at all', () => {
        expect(cleanGameOptions({ width: 320, height: 240, seed: 0 }).seed).toBe(0);
        expect(cleanGameOptions({ width: 320, height: 240 }).seed).toBeUndefined();
    });

    it('draws the same sequence in two games seeded with 0', () => {
        const draw = () => {
            const { store } = createTestGame({ seed: 0 });
            const rng = store.get('random').rng;
            return [rng.rand(), rng.rand(), rng.rand()];
        };
        expect(draw()).toEqual(draw());
    });
});
