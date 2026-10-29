/**
 * What to do, by who was called: the one who hits this is usually trying to make something while the
 * game runs, and saying only where not to call it leaves them guessing.
 */
const whatToDo = (who: string): string => {
    if (who === 'useSpawn') {
        return 'it gives a maker, const spawn = useSpawn(Piece), to call from useUpdate or a timer as often as you like: each call makes one.';
    }
    if (who.startsWith('create')) {
        return 'to make one while the game runs, get the piece\'s maker there, const spawn = useSpawn(Piece), and call spawn(…) from useUpdate or a timer.';
    }
    return 'keep what it gives: it works whenever.';
};

/**
 * The error a hook or a `create*` gives when it is called where nothing is being built: from
 * `useUpdate`, a timer, a callback, or after an `await`. In the engine's shape for a message, who,
 * what happened, what to do: where to call it, and how to get from there what was wanted.
 *
 * @param who The function called: `'createSprite'`.
 * @param also Advice of its own, said after: `'To join things later, call addJoint…'`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const outsideSceneBody = (who: string, also?: string): Error => new Error(
    `[NacatamalOn] ${who}: called where nothing is being built (from useUpdate, a timer, a callback ` +
    `or after an await). Call it inside a scene body, a piece made with useSpawn or a behaviour; ` +
    `${whatToDo(who)}${also === undefined ? '' : ` ${also}`}`,
);
