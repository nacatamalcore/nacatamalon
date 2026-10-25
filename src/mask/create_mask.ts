import { nanoId } from '../utils';
import type { TBox } from '../box/types/t_box';
import type { TMask, TMaskOptions } from './types/t_mask';

/**
 * The masks each object is the shape of. Beside the object rather than on it: being a shape is
 * something a mask says about another object, and that object does not have to know.
 */
const shapeRoles = new WeakMap<TBox, TMask[]>();

/**
 * How many objects are masked and how many are a shape, anywhere. Zero and zero is the ordinary
 * game, and the frame asks these before doing any of the work masks need, so a game that has none
 * pays nothing for them.
 */
let maskedCount = 0;
let shapeCount = 0;

/**
 * The masks each box has been given a way out of: what takes a mask off a box that leaves before the
 * mask does, so nothing keeps counting it. Given once per mask and box, however often it is added.
 */
const leaving = new WeakMap<TBox, Set<TMask>>();

/**
 * Whether any object, in any game, is masked or is the shape of a mask right now.
 *
 * @internal
 */
export const anyMasks = (): boolean => maskedCount > 0 || shapeCount > 0;

/**
 * The masks `box` is the shape of, or `undefined` when it is the shape of none.
 *
 * @internal
 */
export const shapeRolesOf = (box: TBox): readonly TMask[] | undefined => (shapeCount > 0 ? shapeRoles.get(box) : undefined);

const addRole = (box: TBox, mask: TMask): void => {
    const roles = shapeRoles.get(box);
    if (roles === undefined) {
        shapeRoles.set(box, [mask]);
    } else if (!roles.includes(mask)) {
        roles.push(mask);
    } else {
        return;
    }
    shapeCount++;
};

const removeRole = (box: TBox, mask: TMask): void => {
    const roles = shapeRoles.get(box);
    const at = roles?.indexOf(mask) ?? -1;
    if (roles === undefined || at < 0) {
        return;
    }
    roles.splice(at, 1);
    if (roles.length === 0) {
        shapeRoles.delete(box);
    }
    shapeCount--;
};

/**
 * Makes a mask, owned by nothing yet: `useMask` gives it to the object it was asked for in, and a
 * scene document to the object it masks. Throws when it is told both a rectangle and a shape, which
 * would be two masks in one.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createMask = (options: TMaskOptions = {}, id: string = nanoId()): TMask => {
    if (options.rect !== undefined && options.by !== undefined) {
        throw new Error('[NacatamalOn] useMask: give it a rect or a shape (by), not both. For both, put one mask inside the other: masks inside each other keep to both.');
    }
    let by: TBox | null = null;
    const boxes: TBox[] = [];

    const mask: TMask = {
        type: 'mask',
        id,
        rect: options.rect !== undefined ? { ...options.rect } : null,
        get by() {
            return by;
        },
        set by(shape: TBox | null) {
            if (shape === by) {
                return;
            }
            if (by !== null) {
                removeRole(by, mask);
            }
            by = shape;
            if (shape !== null) {
                addRole(shape, mask);
            }
        },
        channel: options.channel ?? 'alpha',
        soft: options.soft ?? false,
        invert: options.invert ?? false,
        showShape: options.showShape ?? false,
        enabled: options.enabled ?? true,
        add: (box) => {
            if (box.mask === mask) {
                return;
            }
            if (box.mask !== null) {
                console.warn(`[NacatamalOn] useMask: '${box.name}' already had a mask, and this one takes its place. An object has one mask; for two, put one object inside the other, and each keeps to its own.`);
                const other = box.mask;
                other.remove(box);
            }
            box.mask = mask;
            boxes.push(box);
            maskedCount++;
            let given = leaving.get(box);
            if (given === undefined) {
                given = new Set();
                leaving.set(box, given);
            }
            if (!given.has(mask)) {
                given.add(mask);
                box.cleanups.push(() => mask.remove(box));
            }
        },
        remove: (box) => {
            const at = boxes.indexOf(box);
            if (at < 0) {
                return;
            }
            boxes.splice(at, 1);
            if (box.mask === mask) {
                box.mask = null;
            }
            maskedCount--;
        },
        has: (box) => box.mask === mask,
        boxes,
    };
    mask.by = options.by ?? null;
    return mask;
};

/**
 * Takes a mask away from everything: what it masked is drawn whole again, and its shape is drawn
 * like any other object. What happens to a mask when the object that made it leaves.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const releaseMask = (mask: TMask): void => {
    for (const box of [...mask.boxes]) {
        mask.remove(box);
    }
    mask.by = null;
};
