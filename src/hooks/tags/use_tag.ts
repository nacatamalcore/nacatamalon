import { getActiveBox } from '../../store';
import { rootOf } from '../../box/root_of';
import { tagHandle } from '../../tags/tags';
import type { TTag } from '../../tags/tags';

/**
 * Gives the tag `name`, to put on things, take off, ask about and find: what something is,
 * `'enemy'`, `'coin'`, `'damageable'`, as many as it likes. Asking is getting: two pieces that ask
 * for `'enemy'` get the same tag, and nothing registers it.
 *
 * Asked for in a body, like every hook; what it gives works whenever, from a frame or a callback.
 * It finds in the scene it was asked for in. Collisions are asked by tag too:
 * `useCollisionWith(enemies, ...)` or `useCollisionWith('enemy', ...)`.
 *
 * @param name The tag.
 * @returns The tag: `add`, `remove`, `has`, `all`, `clear`.
 *
 * @example
 * ```ts
 * const Enemy = () => {
 *     useTag('enemy').add(useSelf());
 *     createSprite({ key: 'bat' });
 * };
 *
 * export const Level: TSceneFn = () => {
 *     const coins = useTag('coin');
 *     coins.add(createSprite({ key: 'coin', transform: { x: 80, y: 60 } }));
 *     useUpdate(() => {
 *         if (coins.all().length === 0) console.log('all taken');
 *     });
 *     return createScene();
 * };
 * ```
 *
 * @category Tags
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useTag = (name: string): TTag => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] useTag: call it inside a scene body or a component made with useSpawn; what it gives works whenever.');
    }
    return tagHandle(name, () => rootOf(box));
};
