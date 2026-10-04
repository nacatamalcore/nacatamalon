import { getActiveBox, getActiveGame } from '../../store';
import type { TGamepad, TGamepadTarget, TUseGamepadOptions } from '../../input';

/**
 * A gamepad, to ask in every frame what the player is holding, has just pressed, or how far a stick
 * is pushed.
 *
 * With no number it follows the **first pad connected**, which is what a one player game means. With
 * a number it is that port and only that one, which is what local multiplayer means: player two has
 * to keep meaning one particular controller even when player one unplugs theirs. Do not pin a single
 * player game to port 0: the ports belong to the browser, and a pad unplugged and plugged back in
 * usually lands in another one.
 *
 * What comes back is alive. It says there is no pad while the scene is being built even with a
 * controller plugged in, because browsers hide a pad until a button is pressed on it, and it starts
 * saying there is one by itself when the player wakes theirs up. So read it inside `useUpdate`,
 * never once at the start.
 *
 * @param target The port, or nothing to follow the first pad connected.
 * @param options The stick's dead zone, `0.2` by default.
 *
 * @example
 * ```ts
 * declare const fire: () => void;
 *
 * export const Level: TSceneFn = () => {
 *     const pad = useGamepad();
 *     const keys = useKeyboard();
 *     const ship = createSprite({ key: 'ship' });
 *
 *     useUpdate((delta) => {
 *         const { x, y } = pad.leftStick();
 *         ship.transform.x += x * 150 * delta;
 *         ship.transform.y += y * 150 * delta;
 *         if (pad.justPressed('a') || keys.justPressed('Space')) fire();
 *     });
 *
 *     return createScene();
 * };
 * ```
 *
 * @returns The gamepad, whether or not one is plugged in yet: see {@link TGamepad}.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useGamepad = (target: TGamepadTarget = 'first', options: TUseGamepadOptions = {}): TGamepad => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw new Error('[NacatamalOn] useGamepad: call it inside a scene body.');
    }

    return store.get('input').gamepads.handle(target, {
        ...options,
        // Whatever it listens to leaves with the scene, like every other hook.
        scope: (off) => box.cleanups.push(off),
    });
};
