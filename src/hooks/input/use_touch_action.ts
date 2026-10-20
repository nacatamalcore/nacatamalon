import { getActiveBox, getActiveGame } from '../../store';
import type { TActionName } from '../../input';

/**
 * Makes what is being built an on-screen button for `action`: while a finger is on it, or on
 * anything inside it, the action is held, and the game reads it like any other press,
 * `actions.isDown('jump')`, whatever pressed it.
 *
 * **The button says which action it presses**, so nothing has to match: no name for the action map
 * to find it by, and a button made twice for two actions is one component given two props. A finger
 * sliding from one button to the next moves from one action to the other, and two thumbs hold two.
 * It counts for a handle on every device (`'any'`).
 *
 * It belongs to the button and goes with it: destroyed, it presses nothing. It is not a binding, so
 * a controls screen never lists, changes or saves it; it is part of the game, like the button's
 * picture. The action itself still comes from the game's map, with its other bindings: this adds a
 * way to press it. A map in a project file binds a button of a scene by its name instead,
 * `{ type: 'touch', box: 'Jump' }`.
 *
 * Draw the button with the engine, never as HTML over the canvas.
 *
 * @param action The action a finger on it holds.
 *
 * @example
 * ```ts
 * declare const jump: () => void;
 *
 * const Button = ({ x, action }: { x: number; action: string }) => {
 *     createSprite({ key: 'button', transform: { x, y: 280 } });
 *     useTouchAction(action);
 * };
 *
 * export const Level: TSceneFn = () => {
 *     const actions = useActions();
 *     useSpawn(Button)({ x: 400, action: 'jump' });
 *     useSpawn(Button)({ x: 440, action: 'fire' });
 *
 *     useUpdate(() => {
 *         if (actions.justPressed('jump')) jump();
 *     });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useTouchAction = (action: TActionName): void => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw new Error('[NacatamalOn] useTouchAction: call it inside the body of what is pressed, a component made with useSpawn or a scene.');
    }
    const actions = store.get('input').actions;
    if (!actions.defs.some((def) => def.name === action)) {
        console.warn(`[NacatamalOn] useTouchAction: the game has no action '${action}', so pressing this holds nothing. Add it to the actions of createGame or of the project.`);
    }
    box.cleanups.push(actions.touchAction(box, action));
};
