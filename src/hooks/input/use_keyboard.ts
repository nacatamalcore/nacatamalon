import { getActiveGame } from '../../store';
import type { TKeyboard } from '../../input';

/**
 * The keyboard, to ask in every frame what the player is holding or has just pressed.
 *
 * Ask it, do not wait for it. Games read the keyboard once per frame, from inside `useUpdate`,
 * because that is where movement happens: `isDown` for what continues while a key is held, and
 * `justPressed` for what happens once per press however long the key stays down.
 *
 * Call it while the scene is being built, like every hook, and keep what it returns.
 *
 * @example
 * ```ts
 * declare const Bullet: (x: number) => void;
 *
 * export const Level: TSceneFn = () => {
 *     const keys = useKeyboard();
 *     const ship = createSprite({ key: 'ship', transform: { x: 160, y: 200 } });
 *     const fire = useSpawn(Bullet);
 *
 *     useUpdate((delta) => {
 *         if (keys.isDown('ArrowLeft')) ship.transform.x -= 150 * delta;
 *         if (keys.isDown('ArrowRight')) ship.transform.x += 150 * delta;
 *         if (keys.justPressed('Space')) fire(ship.transform.x);
 *     });
 *
 *     return createScene();
 * };
 * ```
 *
 * @returns The keyboard: `isDown`, `justPressed` and `justReleased`.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useKeyboard = (): TKeyboard => {
    const store = getActiveGame();
    if (store === null) {
        throw new Error('[NacatamalOn] useKeyboard: call it inside a scene body.');
    }
    return store.get('input').keyboard;
};
