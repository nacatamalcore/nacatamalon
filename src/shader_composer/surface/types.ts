import type { TComposerNode } from '../types/t_composer_node';

/**
 * Light cut into flat bands, the cartoon look, as `toon()` writes it down.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TToonLook = {
    look: 'toon';
    /**
     * How many bands of light, from the darkest to the full.
     */
    bands: number;
    /**
     * How bright the darkest band is, `0` black to `1` as lit as the rest.
     */
    shadow: number;
    /**
     * Where the shine is cut into one hard spot, `0` everywhere it shines to `1` nowhere.
     */
    spot: number;
};

/**
 * No light at all: the surface as it is painted, as `unlit()` writes it down.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TUnlitLook = {
    look: 'unlit';
};

/**
 * Dots of ink in the shadow, the way printed comics shaded, as `mangaDots()` writes it down.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMangaDotsLook = {
    look: 'mangaDots';
    /**
     * How far apart the dots are, in game pixels.
     */
    spacing: number;
    /**
     * How big a dot grows in full shadow, as a part of the gap between dots. Past `0.5` they touch.
     */
    size: number;
    /**
     * The colour of the ink, `[r, g, b]` from `0` to `1`.
     */
    ink: number[];
};

/**
 * A light along the edge that turns away from the camera, as `rim()` writes it down.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRimLook = {
    look: 'rim';
    /**
     * The colour the edge goes towards, `[r, g, b]` from `0` to `1`.
     */
    color: number[];
    /**
     * How tightly it keeps to the silhouette: higher is thinner.
     */
    power: number;
    /**
     * How far the edge goes towards the colour, `0` none to `1` all the way.
     */
    strength: number;
};

/**
 * How a material's surface is lit: one of these, in place of the engine's own light.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TLightingLook = TToonLook | TUnlitLook;

/**
 * Something done to a surface once it is lit: as many as wanted, in order.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TStepLook = TMangaDotsLook | TRimLook;

/**
 * Any look, as it is written down: plain data, so a scene document can keep it and a material can
 * be made from it again.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TLook = TLightingLook | TStepLook;

/**
 * A surface on its way through the looks: what it is made of, the light reaching it, and, once
 * something has worked it out, its colour.
 *
 * `shade` is how much of it is in shadow, `0` to `1`, when a lighting look has said so: what lets a
 * step after it put ink exactly where the bands went dark. `null` until one has.
 *
 * @internal
 */
export type TSurfaceState = {
    base: TComposerNode;
    light: TComposerNode;
    shine: TComposerNode;
    emissive: TComposerNode;
    shade: TComposerNode | null;
    color: TComposerNode | null;
};
