import { findObject } from '../box/find_object';
import { POST_BUILTINS } from '../post/builtin/catalog';
import type { TBox } from '../box';
import type { TMotionTrack } from './types/t_motion_doc';
import type { TPostEffect } from '../post/types/t_post_effect';

/**
 * The field a track moves, found on the running scene: the object that holds it and its name there.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMotionTarget = {
    /**
     * The box it belongs to, to stop writing once that box is gone. `null` for a screen effect,
     * which belongs to the game.
     */
    box: TBox | null;
    holder: Record<string, unknown>;
    field: string;
    kind: 'number' | 'boolean';
};

/**
 * Fields that may be absent on a record until something sets them, and what they are then.
 */
const ABSENT: Record<string, 'number' | 'boolean'> = { visible: 'boolean', zIndex: 'number' };

/**
 * Every box under these roots, roots included, the way they are drawn: parents first.
 */
function* boxesOf(roots: readonly TBox[]): Generator<TBox> {
    for (const root of roots) {
        yield root;
        yield* boxesOf(root.children);
    }
}

/**
 * The box a track or an event names: by id, and by name when no box has that id.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const findMotionBox = (roots: readonly TBox[], id: string, name: string | undefined): TBox | null => {
    for (const box of boxesOf(roots)) {
        if (box.id === id && !box.destroyed) return box;
    }
    if (name === undefined) return null;
    for (const root of roots) {
        const found = findObject(root, name);
        if (found !== null && !found.destroyed) return found;
    }
    return null;
};

/**
 * What a box carries that has an id of its own.
 */
const partsOf = (box: TBox): Array<{ id: string } | null> => [
    box.camera2d, box.camera3d, ...box.lights, box.fog, box.particleCollider, box.audioListener, ...box.drawables,
];

/**
 * A component by its id: on its box first, then anywhere in the scene, because a camera is kept by
 * its scene and not by the box the document wrote it on.
 */
const findComponent = (roots: readonly TBox[], box: TBox, id: string): Record<string, unknown> | null => {
    for (const part of partsOf(box)) {
        if (part !== null && part.id === id) return part as unknown as Record<string, unknown>;
    }
    for (const other of boxesOf(roots)) {
        for (const part of partsOf(other)) {
            if (part !== null && part.id === id) return part as unknown as Record<string, unknown>;
        }
    }
    return null;
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/**
 * Finds what a track moves on the running scene, or says why it cannot: no such box, no such
 * component, or a field that is not a number or a yes/no there. Found once, when a motion starts
 * playing, and again when its file changes.
 *
 * Without a component, the box's own placement is moved (`x`, `y`, `rotation`, `scaleX`…), and
 * `visible` is the box's own.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const resolveMotionTrack = (roots: readonly TBox[], track: TMotionTrack, effects: readonly TPostEffect[] = []): TMotionTarget | string => {
    if (track.post !== undefined) {
        return resolvePostTrack(effects, track);
    }
    const box = findMotionBox(roots, track.box, track.name);
    if (box === null) {
        return `there is no box ${track.name !== undefined ? `"${track.name}" ` : ''}with the id "${track.box}"`;
    }
    let record: Record<string, unknown> | null;
    if (track.component !== undefined) {
        record = findComponent(roots, box, track.component);
        if (record === null) {
            return `the box "${box.name}" has no component with the id "${track.component}"`;
        }
    } else {
        record = track.path === 'visible' ? box as unknown as Record<string, unknown> : box.transform as unknown as Record<string, unknown> | null;
        if (record === null) {
            return `the box "${box.name}" has no placement to move`;
        }
    }

    const parts = track.path.split('.');
    const field = parts.pop()!;
    let holder: Record<string, unknown> = record;
    // A picture's own knob that it has not been given yet is its material's: given its own, from the
    // material's value, the moment a track moves it.
    if (track.component !== undefined && parts.length === 1 && parts[0] === 'uniforms' && record.uniforms === undefined) {
        const material = isObject(record.material) && isObject(record.material.uniforms) ? record.material.uniforms : null;
        if (material !== null && typeof material[field] === 'number') {
            record.uniforms = { [field]: material[field] };
        }
    }
    for (const part of parts) {
        const next = holder[part];
        if (!isObject(next)) {
            return `"${track.path}" is not a field of ${track.component !== undefined ? `that component of "${box.name}"` : `"${box.name}"`}`;
        }
        holder = next;
    }
    const value = holder[field];
    const kind = typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : value === undefined ? ABSENT[field] : undefined;
    if (kind === undefined) {
        return `"${track.path}" on "${box.name}" is not a number or a yes/no, so it cannot be moved`;
    }
    return { box, holder, field, kind };
};

/**
 * A track of one of the game's screen effects, found by the effect's name.
 */
const resolvePostTrack = (effects: readonly TPostEffect[], track: TMotionTrack): TMotionTarget | string => {
    // An engine effect a project left unnamed is called after its key, and a motion written before
    // the key was renamed (`'palette'`, now `'paletteMatch'`) names the old one.
    const now = POST_BUILTINS.find((builtin) => builtin.formerKeys?.includes(track.post!))?.key;
    const effect = effects.find((one) => one.name === track.post) ?? effects.find((one) => now !== undefined && one.name === now);
    if (effect === undefined) {
        return `the game has no screen effect called "${track.post}"`;
    }
    const parts = track.path.split('.');
    let field = parts.pop()!;
    // A knob an engine effect has renamed, on an effect a project named itself, so the file could not
    // tell which effect it is when it was read: the effect lacking the old name and having the new
    // one is enough to know.
    if (parts.length === 1 && parts[0] === 'uniforms' && !(field in effect.uniforms)) {
        const now = POST_BUILTINS.map((builtin) => builtin.renamed?.[field]).find((name) => name !== undefined && name in effect.uniforms);
        if (now !== undefined) {
            field = now;
        }
    }
    let holder = effect as unknown as Record<string, unknown>;
    for (const part of parts) {
        const next = holder[part];
        if (!isObject(next)) {
            return `"${track.path}" is not a field of the screen effect "${track.post}"`;
        }
        holder = next;
    }
    const value = holder[field];
    const kind = typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : undefined;
    if (kind === undefined) {
        return `"${track.path}" of the screen effect "${track.post}" is not a number or a yes/no, so it cannot be moved`;
    }
    return { box: null, holder, field, kind };
};

/**
 * Writes a track's value into the field it moves, as the field's own kind.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const writeMotionTarget = (target: TMotionTarget, value: number | boolean): void => {
    if (target.box?.destroyed) return;
    target.holder[target.field] = target.kind === 'boolean' ? (typeof value === 'boolean' ? value : value !== 0) : (typeof value === 'number' ? value : value ? 1 : 0);
};
