import type { TLightingLook, TStepLook } from '../../shader_composer/surface/types';
import type { TColor } from '../../color';
import type { TTexture } from '../../loaders';
import type { TShader } from '../../loaders/shader/types/t_shader';
import type { TUniformValues } from './t_uniforms';
import type { TMaterialMap, TTextureWrap } from './t_material';

/**
 * The shader half of what a material can be asked for, which both kinds share.
 *
 * Writing the source here is the quick way in, for an effect that lives with the scene that uses it.
 * `effect` is the other way: a file, which several scenes can share and which an editor can open.
 * Giving both is a contradiction, and the file wins.
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMaterialShaderOptions = {
    /**
     * A name, which is what a warning about this material will call it.
     */
    name?: string;
    /**
     * The fragment hook, in WGSL.
     *
     * For a model, `fn effect(surface: vec4<f32>, ctx: FragContext) -> vec4<f32>`, where `ctx` has:
     * `uv`; `normal`, `worldPos` and `viewDir` in the world; `light`, `shine` and `emissive`, the
     * light reaching it already worked out; `color`, the colour painted on the corners; `screen`,
     * where it is on the screen in the game's pixels, `(0, 0)` at the top left; `tangent` and
     * `bitangent`, the way across and down the surface the picture runs, in the world; and `uv2`, a
     * second picture coordinate (the file's own, or `uv` again). The corner hook's `VertContext`
     * has `normal`, `uv`, `color`, `tangent`, `bitangent` and `uv2`, before anything is moved.
     */
    fragment?: string;
    /**
     * The same hook in GLSL, without which the effect is WebGPU only.
     */
    fragmentGlsl?: string;
    /**
     * The vertex hook, in WGSL. 3D only: a sprite is a flat square and has nothing to move.
     */
    vertex?: string;
    /**
     * The same, in GLSL.
     */
    vertexGlsl?: string;
    /**
     * The knobs, with the values they start at. Their kinds are read off these, and fixed from then
     * on, because how they are packed for the card depends on them.
     *
     * Kept as given, not copied: the object you pass in is the one the renderer reads, so writing a
     * number into it is read by the next frame. That is how a shader is driven by the game, and it
     * is the same rule a text's style follows.
     */
    uniforms?: TUniformValues;
    /**
     * A file from `useLoadShader`, or the name one was loaded under.
     */
    effect?: TShader | string;
};

/**
 * What `createMaterial` is asked for when the material is for models.
 *
 * Everything about the surface is optional and defaults to a plain matt white one, so a material
 * that only carries an effect says only that.
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMeshMaterialOptions = TMaterialShaderOptions & {
    shader: 'mesh3d';
    /**
     * A picture for the surface, from `useLoadTexture`.
     */
    texture?: TTexture;
    /**
     * The name a picture was loaded under, for a material built where the picture is not at hand.
     */
    key?: string;
    /**
     * Multiplies the picture, and is the whole colour without one. Default white.
     */
    tint?: TColor;
    /**
     * Light it gives off by itself. Default none.
     */
    emissive?: TColor;
    /**
     * The colour of its shine. Default none, which is matt.
     */
    specular?: TColor;
    /**
     * How tight that shine is. Default `32`.
     */
    shininess?: number;
    /**
     * How solid it is, `0` to `1`. Default `1`.
     */
    alpha?: number;
    /**
     * Drawn as see-through even at full `alpha`: for a shader that works out its own alpha, or a
     * picture with see-through parts. Omitted, it is see-through when `alpha` or its tint's own is
     * below `1`. A see-through model is drawn after the solid ones, furthest first, and hides nothing.
     */
    transparent?: boolean;
    /**
     * Overrides the game's `smooth` for anything drawn with this.
     */
    smooth?: boolean;
    /**
     * What the picture does past its edge: `'repeat'` (the default for a model) tiles it, `'mirror'` tiles it
     * flipped every other time, and `'clamp'` stretches its last row and column. A pair sets each
     * way on its own (`u` across, `v` down), which is how a fence repeats sideways and not upwards.
     */
    wrap?: TTextureWrap | { u: TTextureWrap; v: TTextureWrap };
    /**
     * Extra pictures for the shader to read by name, up to four, each a texture or a texture with its
     * own `wrap` and `smooth`. In the shader, `sampleMap_<name>(uv)` reads the one under that name.
     *
     * @example
     * ```ts
     * createMaterial({
     *     shader: 'mesh3d',
     *     texture: bricks,
     *     maps: { noise: createPixelTexture(noise) },
     *     fragment: `fn effect(surface: vec4<f32>, ctx: FragContext) -> vec4<f32> {
     *         if (sampleMap_noise(ctx.uv).r < mu.cut) { return vec4<f32>(0.0); }
     *         return vec4<f32>(surface.rgb * ctx.light, surface.a);
     *     }`,
     *     uniforms: { cut: 0.3 },
     * });
     * ```
     */
    maps?: Record<string, TTexture | TMaterialMap>;
    /**
     * Its corners land on a coarse grid of the screen, the way the PlayStation drew them: a model
     * shivers as it moves and its edges crawl as the camera turns. A number is how many rows the grid
     * has (`120` is the classic look, smaller is wilder); `true` uses the game's own rows, which is
     * subtle. Default `false`.
     */
    vertexSnap?: boolean | number;
    /**
     * Its picture is stretched straight across the screen without correcting for depth, the way the
     * PlayStation drew it: big flat surfaces bend and swim as the camera comes close. Default `false`.
     */
    affine?: boolean;
    /**
     * How the surface is lit, in place of the engine's light: `toonLighting()` (flat bands) or `unlitLighting()` (no
     * light at all). One only. Its numbers become knobs of the material (`toonShadow`...), so they can
     * be turned while the game runs. It makes the colour, so it is not given with `fragment` or
     * `effect`; a `vertex` hook may go with it.
     */
    lighting?: TLightingLook;
    /**
     * What is done to the surface once it is lit, in order: `mangaDots()` (ink in the shadow),
     * `rim()` (a lit edge). On `lighting` when there is one, on the engine's light when not. Their
     * numbers become knobs too (`mangaDotsSpacing`, `rimColor`; a second of one kind is `rim2Color`).
     */
    steps?: readonly TStepLook[];
};

/**
 * What `createMaterial` is asked for when the material is for flat things.
 *
 * There is nothing here about a picture or a colour, because those belong to the sprite. This is the
 * effect and its knobs, and nothing else.
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSpriteMaterialOptions = TMaterialShaderOptions & {
    /**
     * Left out, a material is for sprites: that is the commoner of the two by a long way.
     */
    shader?: 'sprite2d';
};

/**
 * What `createMaterial` is asked for. `shader` decides which of the two you are making.
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMaterialOptions = TSpriteMaterialOptions | TMeshMaterialOptions;
