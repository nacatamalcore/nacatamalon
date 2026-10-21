import { describe, expect, it } from 'bun:test';
import { cleanGameOptions } from '../src/game/bootstrap/clean_gameoptions';

/**
 * A game's `background`, said however a colour is said: black as a number is 0, and still black.
 */
describe('the background', () => {
    it('keeps black written as a number, which a falsy check turned into the default', () => {
        expect(cleanGameOptions({ width: 320, height: 240, background: 0x000000 }).background).toEqual({ r: 0, g: 0, b: 0, a: 1 });
        expect(cleanGameOptions({ width: 320, height: 240, background: '#000000' }).background).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    });
});
