import type { TColor } from '../../../color';
import type { TFont } from '../../../loaders';
import type { TTextStyle } from './t_text_style';

/**
 * A text in the scene, as `createText` gives it back: a string drawn with a bitmap font. Plain
 * data; change any field (`text` above all) and the next frame shows it.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TText = {
    id: string;
    type: 'text';
    /**
     * What it says. `\n` starts a new line.
     */
    text: string;
    font: TFont;
    /**
     * Size, alignment and spacing. Held by reference, so a shared style changes every text using it.
     */
    style: TTextStyle;
    tint: TColor;
    /**
     * Where the block is. Scale and rotation apply to the whole block, around its anchor.
     */
    transform: { x: number; y: number; rotation: number; scaleX: number; scaleY: number };
    /**
     * Where it ends up once everything above it has moved it, worked out once a frame while the tree
     * is walked. Left off when nothing above it has a placement of its own, which is the ordinary
     * case: then its own `transform` is already where it is.
     *
     * Set by the engine every frame and never authored or saved. Ask `worldOf` rather than reading
     * either field by hand.
     */
    worldTransform?: { x: number; y: number; rotation: number; scaleX: number; scaleY: number };
    /**
     * Which point of the block sits on its transform, in 0-1. Omitted is its top-left corner.
     */
    anchor?: { x: number; y: number };
    /**
     * Draw order within its scene, as for a sprite. The whole text moves as one.
     */
    zIndex?: number;
    /**
     * Crisp or blended when scaled. Omitted, the game's `smooth` decides.
     */
    smooth?: boolean;
    /**
     * Whether it is drawn at all. Omitted is drawn. Hidden, it keeps what it says and costs nothing
     * to show again, which is what a label that comes and goes wants.
     */
    visible?: boolean;
    /**
     * An effect of its own, from `createMaterial`. Omitted is the built-in shader.
     *
     * It is carried by every letter, and every letter carries the **same** one, so a title with an
     * effect on it is still one draw rather than one draw per character.
     */
    material?: TSpriteMaterial;
    /**
     * This text's own values for that material's knobs, laid over the material's own.
     */
    uniforms?: TUniformValues;
    /**
     * Set by `destroy` and never cleared.
     */
    destroyed: boolean;
};

import type { TSpriteMaterial, TUniformValues } from '../../../materials';
