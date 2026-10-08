import type { TColor } from '../../color';
import type { TTexture } from '../../loaders';
import type { TShader } from '../../loaders/shader/types/t_shader';
import type { TMaterialShader, TUniformType, TUniformSignature, TUniformValues } from './t_uniforms';

/**
 * What both kinds of material have: a shader of your own, and the knobs on it.
 *
 * All four sources are `null` on a material that only describes a surface, which is every material
 * a game has until it asks for an effect.
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TShaderHalf = {
    id: string;
    type: 'material';
    /**
     * A name for reading in a warning. Never looked up by: a material is a value, not a resource.
     */
    name: string | null;
    /**
     * The fragment hook in WGSL, which is what WebGPU compiles.
     */
    fragment: string | null;
    /**
     * The same hook written again in GLSL, which is what WebGL2 compiles.
     */
    fragmentGlsl: string | null;
    /**
     * The vertex hook in WGSL. Only a 3D material has one: a sprite is a flat square.
     */
    vertex: string | null;
    /**
     * The same, in GLSL.
     */
    vertexGlsl: string | null;
    /**
     * The knobs, or `null` when there is no shader of your own to turn.
     */
    uniforms: TUniformValues | null;
    /**
     * What kind each knob is. Fixed once, because the compiled shader was built against it.
     */
    uniformSig: TUniformSignature | null;
    /**
     * The file this came from, or `null` when the source was written inline.
     */
    effect: TShader | null;
};

/**
 * A material for flat things: a shader and nothing else.
 *
 * **The picture and the colour are not here, and that is the design.** A sprite carries its own, and
 * carries them *per sprite*: they travel in the instance buffer next to its place and its size, so a
 * thousand sprites in one draw can be a thousand different colours. Putting the colour on something
 * shared would mean one of these per sprite to vary it, which is the opposite of what a material is
 * for. A sprite keeps its own texture and its own tint, and its material is only the effect over
 * the top.
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSpriteMaterial = TShaderHalf & {
    shader: 'sprite2d';
};

/**
 * What a model's picture does past its edge.
 *
 * A model's corners may ask for any part of the plane, not only the picture's own square: a ladder
 * of UVs from 0 to 20 across a field is how one small patch of grass covers a whole hillside, and it
 * is how nearly every level of the era was textured. `'repeat'` tiles the picture, `'mirror'` tiles
 * it flipped every other time so its seams meet themselves, and `'clamp'` stretches its last row and
 * column outwards.
 *
 * Repeating is the default for a model, as it is in glTF. A sprite and a
 * map never repeat: they read one frame of a sheet, and the next frame over is not theirs to show.
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTextureWrap = 'repeat' | 'clamp' | 'mirror';

/**
 * One extra picture a model's material carries for its shader to read, besides the picture it is
 * covered with: a reflection, a mask, a fine detail, a ripple.
 *
 * The shader reads it by name, `sampleMap_<name>(uv)`, with the same wrap and filtering choices the
 * main picture has.
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMaterialMap = {
    /**
     * The picture. One still loading reads as white until it lands; the model is drawn meanwhile.
     */
    texture: TTexture;
    /**
     * What the picture does past its edge. Default `'repeat'`.
     */
    wrap?: TTextureWrap | { u: TTextureWrap; v: TTextureWrap };
    /**
     * How it is read between pixels. Omitted, the material's own `smooth` decides.
     */
    smooth?: boolean;
};

/**
 * A material for models: a surface, and optionally a shader over it.
 *
 * Here the surface **is** the material's, because that is what a hundred crates want to share. They
 * are one shape and one surface and a hundred placements, and a colour per crate would be a
 * parameter nobody asked for.
 *
 * That is the other half of the split: in three dimensions the material owns the look, in two the
 * object does.
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMeshMaterial = TShaderHalf & {
    shader: 'mesh3d';
    /**
     * The picture on it, or `null` for a plain surface of its tint.
     */
    texture: TTexture | null;
    /**
     * Multiplies the picture. White leaves it alone, and is the whole colour without one.
     */
    tint: TColor;
    /**
     * Light it gives off by itself, which no lamp has to reach. Black is none.
     */
    emissive: TColor;
    /**
     * The colour of its shine. Black is a surface that does not shine at all.
     */
    specular: TColor;
    /**
     * How tight the shine is: higher is a smaller, harder highlight.
     */
    shininess: number;
    /**
     * How solid it is, `0` to `1`. Multiplies the tint's own.
     */
    alpha: number;
    /**
     * Drawn as see-through even at full `alpha`: for a shader that works out its own alpha, or a
     * picture with see-through parts. Omitted, it is see-through when `alpha` or its tint's own is
     * below `1`. A see-through model is drawn after the solid ones, furthest first, and hides nothing.
     */
    transparent?: boolean;
    /**
     * How the picture is read between pixels. Omitted, the game decides.
     */
    smooth?: boolean;
    /**
     * What the picture does past its edge: `'repeat'` (the default) tiles it, `'mirror'` tiles it
     * flipped every other time, and `'clamp'` stretches its last row and column. A pair sets each
     * way on its own (`u` across, `v` down), which is how a fence repeats sideways and not upwards.
     */
    wrap?: TTextureWrap | { u: TTextureWrap; v: TTextureWrap };
    /**
     * Extra pictures for its shader to read, by name, up to four: `sampleMap_<name>(uv)` in the
     * shader reads the one under that name. Read every frame, so swapping one shows at once.
     */
    maps?: Record<string, TMaterialMap>;
    /**
     * Its corners land on a coarse grid of the screen, the way the PlayStation drew them: a model
     * shivers as it moves and its edges crawl as the camera turns.
     *
     * A number is how many rows that grid has, and the columns follow the view's shape so its cells
     * stay square: `120` is the classic shiver at any resolution, smaller is wilder. `true` uses the
     * game's own rows, which is honest but subtle, because the picture is already drawn on that grid
     * and a corner moves less than half a pixel. The real console shivered more than that: its maths
     * ran on low-precision numbers, which is why a coarser grid is what reads as "PlayStation".
     * Default `false`, no snapping.
     */
    vertexSnap?: boolean | number;
    /**
     * Its picture is stretched straight across the screen, without correcting for depth, the way the
     * PlayStation drew it: a floor or a wall bends and swims as the camera comes close.
     *
     * The warp grows with the size of a triangle on screen, so a big flat plane shows it most and a
     * finely cut one hides it, which is what the games of the time did to keep it down. Default
     * `false`, the picture held true to the surface.
     */
    affine?: boolean;
};

/**
 * A surface, a shader, or both, that one or many things can be drawn with.
 *
 * Two shapes and not one with half its fields unused, because a field that means nothing half the
 * time is a field that lies. Which one you have is written on `shader`, so asking narrows it.
 *
 * A material is an **atomic value**: nothing caches it and nothing looks it up by name. Two things
 * share one by being handed the same one.
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMaterial = TSpriteMaterial | TMeshMaterial;

export type { TMaterialShader, TUniformType, TUniformSignature, TUniformValues };
