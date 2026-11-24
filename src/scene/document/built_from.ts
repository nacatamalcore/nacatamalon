import type { TBox } from '../../box';
import type { TBoxNode } from './types/t_scene_doc';

/**
 * The node of the document each box was built from, and where that document came from: what
 * `copyObject` makes another of. Weak, so a box that goes away takes its entry with it.
 *
 * @internal
 */
export const builtFrom = new WeakMap<TBox, { node: TBoxNode; src: string }>();

/**
 * The ids of the components a box was given by its document, of one type, or null for a box no
 * document built: what tells the texts a box is laid out with from those a behaviour made on it.
 *
 * @internal
 */
export const documentComponentIds = (box: TBox, type: string): Set<string> | null => {
    const from = builtFrom.get(box);
    return from === undefined ? null : new Set(from.node.components.filter((c) => c.type === type).map((c) => c.id));
};
