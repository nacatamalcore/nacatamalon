import type { TTransform3d } from '../../types/t_transform_3d';
import type { TTransform2d } from '../../types/t_transform_2d';

/**
 * A drawing of a kind the engine does not know itself, as a plugin made it with `createDrawable`.
 * The engine places it like a model, or like a sprite when its kind is flat (it follows its object,
 * turns with it, hides with it, is ordered with the rest of its scene and goes when it is destroyed);
 * what it looks like is the plugin's, which registered its kind with `registerDrawableKind`.
 *
 * The plugin keeps its own fields on it, beside these.
 *
 * @category Extending
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCustomDrawable = {
    id: string;
    type: 'custom';
    /**
     * The name of its kind, as it was registered.
     */
    kind: string;
    /**
     * Whether it is drawn in a scene's depth, with the models (`'3d'`), or flat, with the sprites
     * (`'2d'`), as its kind says.
     */
    readonly space: '2d' | '3d';
    /**
     * A name to find it by.
     */
    name?: string;
    /**
     * Where it is drawn from, inside whatever it belongs to. A flat one reads `x`, `y`, `rotation`,
     * `scaleX` and `scaleY`, in the game's pixels with `y` down, as a sprite does.
     */
    transform: TTransform3d;
    /**
     * Where one in depth is in the world this frame, with every parent applied. The engine writes it.
     */
    worldMatrix?: Float32Array;
    /**
     * Where a flat one ends up this frame, every parent and its parallax applied. The engine writes
     * it.
     */
    worldTransform?: TTransform2d;
    /**
     * Draw order within its scene, as for any other drawing.
     */
    zIndex?: number;
    /**
     * `false` leaves it out of the picture. Default `true`.
     */
    visible?: boolean;
    destroyed: boolean;
};
