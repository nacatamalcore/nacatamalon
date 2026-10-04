import { getActiveBox, getActiveGame } from '../../store';
import type { TAction, TActionDevice, TActionName, TActionsHandle } from '../../input';

/**
 * What the action hooks accept.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TUseActionsOptions = {
    /**
     * Which devices to listen to. `'any'` (the default) is the keyboard and every pad, which is one
     * player. A port number is **that pad and nothing else**, which is how two players share one set
     * of action names; `'keyboard'` is the other half of that split.
     */
    device?: TActionDevice;
};

const sourceOf = (hook: string) => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw new Error(`[NacatamalOn] ${hook}: call it inside a scene body.`);
    }
    return store.get('input').actions;
};

/**
 * The game's named actions.
 *
 * An action is a name, `'jump'`, that the game binds to whatever it likes: a key, a gamepad button,
 * a stick direction, several at once. The game asks about the name, so the same code works on a
 * keyboard and on a pad with no branching, and the player can change what it is bound to without the
 * game knowing.
 *
 * The list of actions is the game's: given to `createGame`, or written in the project's
 * `project.json` by the editor.
 *
 * @example
 * ```ts
 * declare const hero: TSprite;
 * declare const jump: () => void;
 * declare let charge: number;
 *
 * export const Player: TSceneFn = () => {
 *     const input = useActions();
 *
 *     useUpdate((delta) => {
 *         // Four actions, one direction: the keys, the d-pad and the stick all arrive here, and the
 *         // dead zone is round, so a gentle diagonal stays a diagonal.
 *         const { x, y } = input.vector('move_left', 'move_right', 'move_up', 'move_down');
 *         hero.transform.x += x * 120 * delta;
 *         hero.transform.y += y * 120 * delta;
 *
 *         if (input.justPressed('jump')) jump();
 *         // A trigger bound to 'fire' reads how far it is pulled; a key bound to it reads 1.
 *         charge = input.value('fire');
 *     });
 *
 *     return createScene();
 * };
 * ```
 *
 * @param options - Which player's devices to read, in a game with more than one.
 * @returns The actions, read by name: `isDown`, `justPressed`, `value`, `vector`...
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useActions = (options: TUseActionsOptions = {}): TActionsHandle =>
    sourceOf('useActions').handle(options.device);

/**
 * One action, which is what most game code reads.
 *
 * The same as `useActions` with one name filled in. Reach for `useActions` when something reads
 * several, and for this when it reads one.
 *
 * @example
 * ```ts
 * declare const velocity: { x: number; y: number };
 *
 * const jump = useAction('jump');
 * useUpdate(() => { if (jump.justPressed()) velocity.y = -320; });
 * ```
 *
 * @param name - The action, as the input map names it.
 * @param options - Which player's devices to read, as for `useActions`.
 * @returns That one action: `isDown`, `justPressed`, `justReleased` and `value`.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useAction = (name: TActionName, options: TUseActionsOptions = {}): TAction => {
    const handle = sourceOf('useAction').handle(options.device);
    return {
        name,
        isDown: () => handle.isDown(name),
        justPressed: () => handle.justPressed(name),
        justReleased: () => handle.justReleased(name),
        value: () => handle.value(name),
    };
};

/**
 * Four actions read as one direction: the way to move a character from the input map.
 *
 * It gives back a **function**, called each frame, like the one `useTween` gives. The dead zone is
 * round and applied once to the finished direction, which is what makes this identical to reading
 * the stick when the four actions are bound to one, and what stops a gentle diagonal from collapsing
 * onto the nearest straight line. A keyboard diagonal comes out the right length for free, which is
 * the bug in every hand written `x = right - left`.
 *
 * @example
 * ```ts
 * declare const hero: TSprite;
 * const SPEED = 120;
 *
 * const move = useVector('move_left', 'move_right', 'move_up', 'move_down');
 * useUpdate((delta) => {
 *     const { x, y } = move();
 *     hero.transform.x += x * SPEED * delta;
 *     hero.transform.y += y * SPEED * delta;
 * });
 * ```
 *
 * @param negativeX - The action that points left.
 * @param positiveX - The action that points right.
 * @param negativeY - The action that points up.
 * @param positiveY - The action that points down.
 * @param options - Which player's devices to read, and the `deadzone` below which the direction is
 *   zero.
 * @returns A function that gives this frame's direction, `{ x, y }`, each from `-1` to `1`.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useVector = (
    negativeX: TActionName,
    positiveX: TActionName,
    negativeY: TActionName,
    positiveY: TActionName,
    options: TUseActionsOptions & { deadzone?: number } = {},
): (() => { x: number; y: number }) => {
    const handle = sourceOf('useVector').handle(options.device);
    return () => handle.vector(negativeX, positiveX, negativeY, positiveY, options.deadzone);
};
