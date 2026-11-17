import type { TPostEffect } from './types/t_post_effect';

/**
 * The records that stand for an `{ overlay: true }` entry of a chain: no effect, the place where what
 * is drawn over the effects (`useOverlay`) goes.
 */
const places = new WeakSet<TPostEffect>();

/**
 * Marks `effect` as the place where what is drawn over the effects goes.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const markOverlayPlace = (effect: TPostEffect): void => {
    places.add(effect);
};

/**
 * Whether `effect` is the place where what is drawn over the effects goes, rather than an effect.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const isOverlayPlace = (effect: TPostEffect): boolean => places.has(effect);
