import { newBox, trackBoxGame } from '../box';
import type { TBox } from '../box';
import { withActiveBox, withActiveGame } from '../store';
import type { TRuntimeStore } from '../store';

/**
 * Turns a registered scene into a running one: creates its root box, runs the body with that
 * root active so every hook lands on it, attaches the children the body returns, and adds the
 * root to `world.scenes`. Returns the root.
 *
 * Synchronous from end to end. If the body throws, nothing is left behind: the root is never
 * added, and both active pointers are back where they were.
 *
 * Only registered scenes can be roots, and only one root per name runs at a time, so a name
 * always means one scene.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const startScene = (store: TRuntimeStore, name: string): TBox => {
    const { names, scenes } = store.get('world');

    const body = names.get(name);
    if (body === undefined) {
        throw new Error(`[NacatamalOn] startScene: '${name}' is not registered. Add it to the object passed to createGame.`);
    }
    if (scenes.some((scene) => scene.name === name)) {
        throw new Error(`[NacatamalOn] startScene: '${name}' is already running.`);
    }

    const root = newBox(name);
    trackBoxGame(root, store);
    const result = withActiveGame(store, () => withActiveBox(store, root, () => body()));

    // TypeScript already rejects both of these. They are here for plain JavaScript.
    if (typeof (result as { then?: unknown } | undefined)?.then === 'function') {
        throw new Error(`[NacatamalOn] startScene: '${name}' returned a promise. Scene bodies must be synchronous.`);
    }
    if (result === undefined || !Array.isArray(result.children)) {
        throw new Error(`[NacatamalOn] startScene: '${name}' must end with \`return createScene()\`.`);
    }

    for (const child of result.children) {
        // Created inside the body, or listed twice: already attached here.
        if (child.parent === root) continue;
        if (child.parent !== null) {
            throw new Error(`[NacatamalOn] startScene: '${child.name}' already belongs to '${child.parent.name}'.`);
        }
        child.parent = root;
        root.children.push(child);
    }

    // Read again rather than reusing `scenes` from the top: the body may have started another
    // scene, and appending to the old array would drop it.
    store.setState('world', { scenes: [...store.get('world').scenes, root] });
    return root;
};
