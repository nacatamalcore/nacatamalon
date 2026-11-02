import type { TLoadStatus } from '../../types/t_load_status';

/**
 * A scene document, as `useLoadScene` hands it back.
 *
 * Handed back at once, still loading. When its file lands the scene is added to the game under the
 * name written in it, the same one the editor and `mainScene` use, and from then on `change(name)`
 * starts it like any scene written in code.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TLoadedScene = {
    readonly type: 'scene';
    /**
     * What it is cached under: the key given, or the file.
     */
    key: string;
    /**
     * Where the `.scene` file is.
     */
    src: string;
    /**
     * How it is doing. `'ready'` once it can be started and what it uses has arrived; `'error'` when
     * the file could not be read or its name is already taken, with a warning that says which.
     */
    status: TLoadStatus;
    /**
     * The scene's name, from its document: what `change` starts it by. Empty until it lands.
     */
    name: string;
};
