import type { TRuntimeStore } from '../store';
import type { TSceneFn } from './types/t_scene_fn';

/**
 * Adds a scene to the game's catalogue under `name`, so it can be started by that name.
 *
 * `createGame` calls this for every entry of the object it receives, and anything registered
 * later (a scene that arrives with a lazily loaded chunk, say) goes through the same door.
 *
 * Registering the same function under the same name again does nothing. A different function
 * under a name already taken throws: two scenes answering to one name would make
 * `change(name)` pick one of them silently.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const registerScene = (store: TRuntimeStore, name: string, scene: TSceneFn): void => {
    const { names } = store.get('world');
    const known = names.get(name);
    if (known === scene) return;
    if (known !== undefined) {
        throw new Error(`[NacatamalOn] scenes: '${name}' is already the name of another scene. Give one of them another name.`);
    }
    store.setState('world', { names: new Map(names).set(name, scene) });
};
