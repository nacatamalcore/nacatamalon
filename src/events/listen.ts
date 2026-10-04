import { ownerOfDrawable } from '../box/drawable_owner';
import { gameOfBox } from '../box/box_game';
import type { TBox } from '../box';
import { SPRITE_EVENT_NAMES } from '../input/types/t_sprite_events';
import type { TSpriteEvents } from '../input/types/t_sprite_events';
import type { TSprite } from '../gameobjects/sprite/types/t_sprite';
import type { TText } from '../gameobjects/text/types/t_text';
import type { TNineSlice } from '../gameobjects/nine_slice/types/t_nine_slice';

/**
 * Said once per page: the same mistake tends to repeat every frame.
 */
let warnedGone = false;

const nothing = (): void => {};

/**
 * Whether what was handed over is a whole object rather than one drawable.
 */
const isObject = (target: TSprite | TText | TNineSlice | TBox): target is TBox =>
    'children' in target && 'drawables' in target;

/**
 * Makes a sprite, a text, a nine-slice or a whole object react to the mouse and touch, after it was
 * created.
 *
 * The same events `createSprite`, `createText` and `createNineSlice` accept in their options (`onClick`, `onPointerOver`, `onPointerOut`,
 * `onPointerMove`, `onPointerDown`, `onPointerUp`), for when they are not known at creation: a button
 * that only becomes clickable when a level is cleared, or a sprite made in one place that another
 * part of the game gives a behaviour.
 *
 * - It can be called at any moment: while the scene is built, every frame, or from another event.
 * - It **adds**: whatever the sprite already reacted to keeps working, and two `onClick` both run, in
 *   the order they were connected.
 * - It stops by itself when the sprite's part of the scene goes away. The function it returns stops
 *   it earlier, and removes only what this call connected.
 *
 * On a sprite that has been destroyed it does nothing.
 *
 * **A whole object reacts as one thing.** A button made of a border, a fill and a label is one
 * button: a pointer over any of its pieces, or its children's, is over the object, and moving from the
 * fill to the label is not leaving it. That is also how a behaviour reaches pieces it did not create,
 * the ones a scene document or a pack made: `listen(self, { onClick })`. A piece that listens by
 * itself inside it still answers for itself, being the more specific.
 *
 * @param sprite The sprite, text, nine-slice or object that should react. A text reacts anywhere
 * inside its block, a nine-slice anywhere inside its rectangle, and an object over any of its pieces.
 * @param events Which events, and what to do on each.
 * @returns A function that disconnects these events.
 *
 * @example
 * ```ts
 * export const Level: TSceneFn = () => {
 *     const scene = useScene();
 *     const door = createSprite({ key: 'door', transform: { x: 400, y: 160 } });
 *     let enemiesLeft = 3;
 *     let doorOpen = false;
 *
 *     useUpdate(() => {
 *         // The door only becomes clickable once every enemy is gone
 *         if (!doorOpen && enemiesLeft === 0) {
 *             doorOpen = true;
 *             listen(door, { onClick: () => scene.change('NextLevel') });
 *         }
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
export const listen = (sprite: TSprite | TText | TNineSlice | TBox, events: TSpriteEvents): (() => void) => {
    const store = isObject(sprite) ? gameOfBox(sprite) : ownerOfDrawable(sprite)?.store;
    const owner = isObject(sprite)
        ? (store === undefined ? undefined : { box: sprite, store })
        : ownerOfDrawable(sprite);
    if (owner === undefined || sprite.destroyed) {
        if (!warnedGone) {
            warnedGone = true;
            console.warn('[NacatamalOn] listen: this has been destroyed, so it cannot react to the pointer.');
        }
        return nothing;
    }

    // Only the events, so a sprite's whole options can be handed over and nothing else is kept.
    const picked: TSpriteEvents = {};
    let any = false;
    for (const name of SPRITE_EVENT_NAMES) {
        const handler = events[name];
        if (handler !== undefined) {
            picked[name] = handler;
            any = true;
        }
    }

    // No events, no listening: a sprite that listens covers the ones below it, and an empty call
    // should not change that.
    if (!any) {
        return nothing;
    }

    return owner.store.get('input').pointer.listenSprite(sprite, owner.box, picked);
};
