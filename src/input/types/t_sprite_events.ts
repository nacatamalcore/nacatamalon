import type { TPointerDragListener, TPointerListener } from './t_pointer';

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
    /**
     * Pressed with the main button (or a finger) and moved far enough not to be a click: a few
     * pixels of the page, more for a finger, which shakes. Once it starts, the press is a drag and
     * not a click: letting go over it does not call `onClick`. The cursor turns into an open hand
     * over something that can be dragged, and a closed one while it is.
     *
     * Nothing moves by itself: the events say what the pointer did, and the game decides what that
     * does (follow it, pull a slingshot back, turn a dial). `useDraggable` is the one that moves it.
     */
    onDragStart?: TPointerDragListener;
    /**
     * The pointer that started the drag moved, wherever it is: over the sprite or not, in the game
     * or off its edge. Called right after `onDragStart` too, so the first move is not lost.
     */
    onDrag?: TPointerDragListener;
    /**
     * The pointer that dragged it let go, with `target` and `hits` saying what it was let go over.
     */
    onDragEnd?: TPointerDragListener;
};

/**
 * The option names above, to pick them out of `createSprite`'s options.
 *
 * @internal
 */
export const SPRITE_EVENT_NAMES = ['onPointerOver', 'onPointerOut', 'onPointerMove', 'onPointerDown', 'onPointerUp', 'onClick', 'onDragStart', 'onDrag', 'onDragEnd'] as const;
