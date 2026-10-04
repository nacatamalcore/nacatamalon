import { registerScene } from './register_scene';
import { startScene } from './start_scene';
import { stopScene } from './stop_scene';
import type { TBox } from '../box';
import type { TRuntimeStore } from '../store';
import type { TSceneFn } from './types/t_scene_fn';

/**
 * Replaces whatever is running with one scene, from outside the game: what a tool does every time
 * the document it is editing changes.
 *
 * A game changes scene from inside, by name, through scenes it declared at the start. A tool cannot
 * work that way, for two reasons this handles. It hands over a **new** scene body on every edit, and
 * registering a second body under a name already taken is refused, correctly, because inside a game
 * that is a typo pointing two doors at one room. And a scene built from a document takes the name
 * its document gives its root, so the name it was registered under is no longer the name it answers
 * to, and stopping it by that name finds nothing and says nothing. So every running scene is stopped
 * by the name it has **now**, and the old body under this name is let go before the new one is
 * registered.
 *
 * Synchronous, like the first scene `createGame` starts, which also runs outside a frame.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const loadHostScene = (store: TRuntimeStore, name: string, scene: TSceneFn): TBox => {
    // A copy, because each stop takes a scene out of the list being walked.
    for (const running of [...store.get('world').scenes]) {
        stopScene(store, running.name);
    }

    const { names } = store.get('world');
    if (names.has(name) && names.get(name) !== scene) {
        const kept = new Map(names);
        kept.delete(name);
        store.setState('world', { names: kept });
    }

    registerScene(store, name, scene);
    return startScene(store, name);
};
