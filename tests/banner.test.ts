import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { cleanGameOptions } from '../src/game/bootstrap/clean_gameoptions';

/**
 * `banner`: whether a game prints its startup line. On unless the game says otherwise, so no game
 * written before the option existed changes.
 */
describe('the startup line', () => {
    it('is on by default, and off only when asked', () => {
        expect(cleanGameOptions({ width: 320, height: 240 }).banner).toBe(true);
        expect(cleanGameOptions({ width: 320, height: 240, banner: true }).banner).toBe(true);
        expect(cleanGameOptions({ width: 320, height: 240, banner: false }).banner).toBe(false);
    });

    it('is printed only when the option says so', () => {
        const source = readFileSync(new URL('../src/game/bootstrap/create_game.ts', import.meta.url), 'utf8');
        expect(source).toMatch(/if \(banner\) \{\s*logBanner\(/);
    });
});
