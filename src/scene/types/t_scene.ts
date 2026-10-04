import type { TBox } from '../../box';

/**
 * What a scene body returns (createScene): the nodes that hang from its root.
 * 
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TScene = {
    readonly children: readonly TBox[];
};
