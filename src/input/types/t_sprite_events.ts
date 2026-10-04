import type { TPointerListener } from './t_pointer';

/**
 * What a sprite or a text can react to by itself: in `createSprite`'s or `createText`'s options, or
 * connected later with `listen`. Every one receives where the pointer is and what is under it. A text
 * reacts anywhere inside its block, the gaps between letters included.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSpriteEvents = {
    /**
     * The pointer comes over the sprite.
     */
    onPointerOver?: TPointerListener;
    /**
     * The pointer stops being over it, or leaves the game.
     */
    onPointerOut?: TPointerListener;
    /**
     * The pointer moves while over it.
     */
    onPointerMove?: TPointerListener;
    /**
     * A button is pressed, or a finger touches, over it.
     */
    onPointerDown?: TPointerListener;
    /**
     * A button is released, or a finger lifts, over it.
     */
    onPointerUp?: TPointerListener;
    /**
     * Pressed and released without leaving it. The cursor turns into a hand over it.
     */
    onClick?: TPointerListener;
};

/**
 * The option names above, to pick them out of `createSprite`'s options.
 *
 * @internal
 */
export const SPRITE_EVENT_NAMES = ['onPointerOver', 'onPointerOut', 'onPointerMove', 'onPointerDown', 'onPointerUp', 'onClick'] as const;
