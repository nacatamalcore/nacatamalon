import { describe, expect, it } from 'bun:test';
import { editorHandleOf, openHost } from '../src/game/handle/editor_handle_of';
import type { TGameInstance } from '../src/game/types/t_game_instance';

/**
 * A game destroyed before its renderer answered never starts. Whoever waits for its handle has to
 * hear that, rather than wait for ever; a page that never asked must not get an unhandled rejection.
 * (That nothing else is left alive, keyboard listeners included, is checked in a browser: it needs a
 * real page and renderer.)
 */

const instance = (): TGameInstance => ({ destroy: () => {}, on: (() => () => {}) as TGameInstance['on'] });

describe('a game destroyed before it started', () => {
    it('tells a tool waiting on its handle why, instead of leaving it waiting', async () => {
        const game = instance();
        const host = openHost(game);
        const waiting = editorHandleOf(game);

        host.cancel(new Error('[NacatamalOn] editorHandleOf: the game was destroyed before it started.'));

        await expect(waiting).rejects.toThrow('destroyed before it started');
    });

    it('raises nothing when nobody was waiting', async () => {
        const host = openHost(instance());
        host.cancel(new Error('gone'));
        // An unhandled rejection would fail this test run; give it the turn it needs to surface.
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(true).toBe(true);
    });
});
