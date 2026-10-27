import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { clearGameStores, createGameStore } from '../src/game_store';
import { saysMilliseconds } from '../src/utils/says_milliseconds';

afterEach(() => {
    (console.warn as { mockRestore?: () => void }).mockRestore?.();
    // The stores are listed for the whole page: one left here would turn up in another file's list.
    clearGameStores();
});

/**
 * A time in seconds so long it was written in milliseconds, which the engine counted once: said, once
 * for each place, and used as given.
 */
describe('a time that looks like milliseconds', () => {
    it('is said once, with what it probably meant, and a sensible one says nothing', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        saysMilliseconds('test wait', 0.5, 10);
        expect(warn).not.toHaveBeenCalled();
        saysMilliseconds('test wait', 250, 10);
        saysMilliseconds('test wait', 250, 10);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]![0])).toContain('did you mean 0.25?');
    });

    it('is said for a store throttle in milliseconds', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        createGameStore({ key: 'ms-throttle', state: { n: 0 }, persist: { adapter: { load: async () => null, save: async () => {} }, throttle: 250 } });
        expect(warn.mock.calls.map((call) => String(call[0])).join('\n')).toContain('throttle of 250 seconds');
    });
});
