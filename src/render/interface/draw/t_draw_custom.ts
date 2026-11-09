import type { TDrawableBounds } from '../../../extend/gpu/drawable_types';

/**
 * What a backend is handed for one drawing of a registered kind: which kind, and what that kind
 * prepared for this frame. Only the kind's own backend reads `payload`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDrawCustom = {
    readonly type: 'custom';
    readonly kind: string;
    /**
     * Whether it is drawn with the models or with the sprites.
     */
    readonly space: '2d' | '3d';
    readonly payload: unknown;
    /**
     * Where the drawing is in the world this frame.
     */
    readonly world: Float32Array;
    /**
     * How much of its own space it takes, as its kind says, or `null` for one always drawn.
     */
    readonly bounds: TDrawableBounds | null;
    /**
     * The drawing's `zIndex`, for a list sorted again after it stood in (a picture that sees the
     * scene's models, `sees: '3d'`).
     */
    readonly zIndex?: number;
};
