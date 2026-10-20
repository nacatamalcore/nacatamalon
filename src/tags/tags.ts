import type { TBox } from '../box/types/t_box';
import type { TGameObject } from '../hooks/spawn/use_spawn';
import type { TSprite } from '../gameobjects/sprite/types/t_sprite';
import type { TText } from '../gameobjects/text/types/t_text';
import type { TNineSlice } from '../gameobjects/nine_slice/types/t_nine_slice';

/**
 * What can carry a tag: a piece (a box) or something drawn on its own, a sprite, a text or a panel.
 *
 * @category Tags
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTaggable<TApi = unknown> = TGameObject<TApi> | TSprite | TText | TNineSlice;

/**
 * A tag, as `useTag` gives it: one name, and what to do with everything that carries it.
 *
 * The name is the tag: two pieces that ask for `'enemy'` get the same one, and nothing registers
 * it. What carries it carries it as data (`thing.tags`), so this and the field are never out of
 * step.
 *
 * @category Tags
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTag = {
    readonly name: string;
    /** Puts it on something. Twice is once. */
    add(thing: TTaggable): void;
    /** Takes it off something. */
    remove(thing: TTaggable): void;
    /** Whether something carries it. */
    has(thing: TTaggable): boolean;
    /** Everything in the scene that carries it, destroyed ones left out. */
    all(): TTaggable[];
    /** Takes it off everything in the scene. */
    clear(): void;
};

/** A tag's name, from the tag or the name. */
export const tagName = (tag: string | TTag): string => (typeof tag === 'string' ? tag : tag.name);

/**
 * Whether `thing` carries the tag `name`.
 *
 * @internal
 */
export const carries = (thing: { tags?: string[] }, name: string): boolean => thing.tags?.includes(name) === true;

/**
 * Everything under `root` that carries the tag, in the tree's order, `root` included: boxes, and what
 * they draw on its own. What is destroyed is left out, and what is inside it.
 *
 * @internal
 */
export const findTagged = (root: TBox, name: string): TTaggable[] => {
    const found: TTaggable[] = [];
    const visit = (box: TBox): void => {
        if (box.destroyed) {
            return;
        }
        if (carries(box, name)) {
            found.push(box as TGameObject);
        }
        for (const drawable of box.drawables) {
            if ((drawable.type === 'sprite' || drawable.type === 'text' || drawable.type === 'nine-slice') && !drawable.destroyed && carries(drawable, name)) {
                found.push(drawable);
            }
        }
        box.children.forEach(visit);
    };
    visit(root);
    return found;
};

/**
 * The handle `useTag` gives back, for the tag `name` in the scene of `root`.
 *
 * @internal
 */
export const tagHandle = (name: string, sceneOf: () => TBox): TTag => ({
    name,
    add: (thing) => {
        const tags = thing.tags ?? [];
        if (!tags.includes(name)) {
            thing.tags = [...tags, name];
        }
    },
    remove: (thing) => {
        if (thing.tags !== undefined && thing.tags.includes(name)) {
            thing.tags = thing.tags.filter((one) => one !== name);
        }
    },
    has: (thing) => carries(thing, name),
    all: () => findTagged(sceneOf(), name),
    clear: () => {
        for (const thing of findTagged(sceneOf(), name)) {
            thing.tags = (thing.tags ?? []).filter((one) => one !== name);
        }
    },
});
