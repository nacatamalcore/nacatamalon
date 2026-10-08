import type { TColor } from '../../../color';
import type { TBitmapFont } from '../../../loaders';
import type { TTextStyle } from './t_text_style';
import type { TPointerListener } from '../../../input';

/**
 * What `createText` is asked for.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTextOptions = {
    /**
     * An effect of its own, from `createMaterial`. Omitted is the built-in shader.
     */
    material?: TSpriteMaterial;
    /**
     * This text's own values for that material's knobs.
     */
    uniforms?: TUniformValues;
    /**
     * What it says. `\n` starts a new line.
     */
    text: string;
    /**
     * A font from `useLoadBitmapFont`. Left out, the engine's own: Nacatamal Arcade, an 8 px arcade font
     * with lowercase, accents and the Spanish ñ, ¿ and ¡, carried inside the engine so nothing has to
     * be loaded.
     */
    font?: TBitmapFont;
    /**
     * Size, alignment and spacing. Kept as given, not copied: pass the same object to several texts
     * and changing it changes all of them. For one text of its own, spread it: `{ ...heading, fontSize: 24 }`.
     */
    style?: TTextStyle;
    /**
     * Its colour. Default white, the font as drawn.
     */
    tint?: TColor;
    /**
     * Where it is. `x` and `y` are its top-left corner unless `anchor` says otherwise. Only what is
     * given: the rest is no turn and a scale of 1, so `{ x, y }` is enough.
     */
    transform?: Partial<{ x: number; y: number; rotation: number; scaleX: number; scaleY: number }>;
    /**
     * Which point of the block sits on `x`, `y`, in 0-1: `{ x: 0.5, y: 0 }` centres a title. Default top-left.
     */
    anchor?: { x: number; y: number };
    /**
     * Draw order within its scene, as for a sprite.
     */
    zIndex?: number;
    /**
     * Crisp (`false`) or blended (`true`) when scaled. Default: the game's `smooth`.
     */
    smooth?: boolean;
    /**
     * Whether it is drawn. Default `true`.
     */
    visible?: boolean;
    /**
     * Called when the mouse or a finger comes over the text. The whole block counts, gaps between
     * letters and spaces included, so a menu option does not flicker as the pointer crosses it.
     */
    onPointerOver?: TPointerListener;
    /**
     * Called when the pointer stops being over the text, or leaves the game.
     */
    onPointerOut?: TPointerListener;
    /**
     * Called when the pointer moves while over the text.
     */
    onPointerMove?: TPointerListener;
    /**
     * Called when a button is pressed, or a finger touches, over the text.
     */
    onPointerDown?: TPointerListener;
    /**
     * Called when a button is released, or a finger lifts, over the text.
     */
    onPointerUp?: TPointerListener;
    /**
     * Called when the text is pressed and released without leaving it. The cursor turns into a hand over it.
     */
    onClick?: TPointerListener;
};

import type { TSpriteMaterial, TUniformValues } from '../../../materials';
