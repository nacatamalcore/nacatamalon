import { describe, expect, it } from 'bun:test';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTimer } from '../src/hooks/timer/use_timer';
import { useGame } from '../src/hooks/game/use_game';

/**
 * What a hook or a `create*` says when it is called where nothing is being built, which is almost
 * always someone trying to make something while the game runs: the error says how, not only where
 * not to.
 */

const messageOf = (call: () => unknown): string => {
    try {
        call();
    } catch (error) {
        return (error as Error).message;
    }
    throw new Error('it did not throw');
};

describe('called where nothing is being built', () => {
    it('says who, what happened and what to do, in that order', () => {
        const message = messageOf(() => createSprite({ width: 8, height: 8 }));
        expect(message).toStartWith('[NacatamalOn] createSprite: called where nothing is being built');
        expect(message).toContain('. Call it inside a scene body, a piece made with useSpawn or a behaviour; ');
        expect(message).toEndWith('.');
    });

    it('tells a create* how to make one while the game runs', () => {
        const message = messageOf(() => createSprite({ width: 8, height: 8 }));
        expect(message).toContain('const spawn = useSpawn(Piece)');
        expect(message).toContain('from useUpdate or a timer');
    });

    it('tells useSpawn that it gives a maker, to call later', () => {
        expect(messageOf(() => useSpawn(() => {}))).toContain('it gives a maker, const spawn = useSpawn(Piece)');
    });

    it('tells any other hook to keep what it gives', () => {
        expect(messageOf(() => useTimer())).toContain('keep what it gives');
    });

    it('keeps a hook\'s own advice after it', () => {
        expect(messageOf(() => useGame())).toEndWith("In a React component, import useGame from 'nacatamalon/react' instead.");
    });
});
