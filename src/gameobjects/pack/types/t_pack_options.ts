import type { TLoadedPack } from '../../../loaders/pack';
import type { TScriptProps } from '../../../scripts/types/t_script';
import type { TTransformOptions } from '../../../hooks/transform/use_transform';
import type { TObjectEventHandler } from '../../../events/object_events';

/**
 * What `createPack` is asked for: which thing of which pack, where, and with which settings.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPackOptions = {
    /**
     * The pack, from `useLoadPack`.
     */
    pack: TLoadedPack;
    /**
     * Which of the boxes it offers. Left out, and with `scene` left out too, the pack's only offer is
     * taken, which is what a pack of one thing wants.
     */
    box?: string;
    /**
     * Which of the scenes it offers, placed as one part of the scene that creates it.
     */
    scene?: string;
    /**
     * Where this copy goes, measured from what creates it. The pack has no place of its own.
     */
    transform?: TTransformOptions;
    /**
     * This copy's own settings for the scripts on the thing itself (not its children), laid over the
     * ones the pack was made with. What a door's destination or a patrol's speed is for.
     */
    props?: TScriptProps;
    /**
     * What to do when the copy tells its parent something: the events its behaviours send with
     * `useEvent` (a button's `'pressed'`), by name. The same as `onEvent` on the copy, connected before
     * the pack has even landed.
     */
    on?: Record<string, TObjectEventHandler>;
};
