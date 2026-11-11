import type { TLightingLook, TStepLook } from '../../shader_composer/surface/types';
import type { TColorOption } from '../../color';
import type { TTexture } from '../../loaders';
import type { TShader } from '../../loaders/shader/types/t_shader';
import type { TUniformValues } from './t_uniforms';
import type { TCullMode, TMaterialMap, TMaterialNormalMap, TMaterialOcclusion, TMaterialReflection, TTextureWrap } from './t_material';

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
     * `uv`; `normal`, `worldPos` and `viewDir` in the world; `cameraPos`, where the camera stands
     * in the world, so `distance(ctx.cameraPos, ctx.worldPos)` is how far away this is; `light`, `shine` and `emissive`, the
     * light reaching it already worked out; `color`, the colour painted on the corners; `screen`,
     * where it is on the screen in the game's pixels, `(0, 0)` at the top left; `tangent` and
     * `bitangent`, the way across and down the surface the picture runs, in the world; `uv2`, a
     * second picture coordinate (the file's own or `createGeometry`'s `uv2`, or `uv` again; stretched
     * as `uv` is when affine);
     * `frontFacing`; `carry`, what the corner hook carried here (see `vertex`); and `occlusion`, how
     * open the place is to the light from all around, 1 to 0 (see `occlusion`, already in `light`).
     * The corner hook's `VertContext` has `normal`, `uv`, `color`, `tangent`, `bitangent` and `uv2`,
     * before anything is moved, and, on a model drawn as many (`createMeshInstances`), `instance`,
     * the four numbers of the instance the corner belongs to, and `origin`, where that instance
     * stands; both are zeros on a single model.
     */
    fragment?: string;
    /**
     * The same hook in GLSL, without which the effect is WebGPU only: on WebGL2 the material draws
     * with the built-in shader and says so once. To write it once for both cards, build it with the
     * shader composer (`compileShader`), which gives `fragment` and `fragmentGlsl` together.
     */
    fragmentGlsl?: string;
    /**
     * The vertex hook, in WGSL: `fn vertex(pos: vec3<f32>, ctx: VertContext) -> vec3<f32>`, where the
     * corner ends up. 3D only: a sprite is a flat square and has nothing to move.
     *
     * On a model drawn as many (`createMeshInstances`) it runs after the instance has placed the
     * corner: `pos`, `ctx.normal` and `ctx.tangent` are in the space the whole group stands in, so a
     * wind crossing a meadow is one direction for every blade, and `pos.y - ctx.origin.y` is how far
     * up its own instance a corner is.
     *
     * It can also hand four numbers on to the fragment hook by writing them into `carry`
     * (`carry = vec4<f32>(lift, 0.0, 0.0, 0.0);`, `carry = vec4(lift, 0.0, 0.0, 0.0);` in GLSL),
     * which reads them as `ctx.carry`, smeared across the triangle: how high a wave lifted a corner, for foam on its
     * crests; a light of its own worked out at the corners, the look of the era; `pos` itself, where
     * the corner is in the model's own space, for bands or a fill line that stay on the model as it
     * moves and turns.
     * Nothing written is zeros.
     *
     * It can also say which way the surface faces at the corner, for the light, by writing it into
     * `surfaceNormal` (`surfaceNormal = vec3<f32>(0.0, 1.0, 0.0);`), in the space `pos` is in: a blade
     * of grass lit as if it faced up rather than sideways, a flat card lit as if it were round. It is
     * brought back to length one. Nothing written, the surface is measured where the hook moved it
     * (below). The composer's `compileShader({ normal })` writes it.
     *
     * It reads the material's uniforms (`mu`) and its `maps` (`sampleMap_<name>(uv)`), so a picture can
     * move the corners: a height map, footprints pressed into snow, ripples drawn into a texture. The
     * surface is measured again where the hook moved it, by calling it at two places beside each
     * corner with the same `ctx`, and lit by that. So read a map at a place worked out from `pos`,
     * not at `ctx.uv`: read at `ctx.uv`, the places beside it rise just as much, and the moved surface
     * is lit as if it were still flat. On a plane `width` by `depth`,
     * `pos.xz / vec2<f32>(width, depth) + 0.5` is its `uv`. Give a height map `smooth: true` in
     * `maps`: read pixel by pixel (the game's default), each pixel is a flat step, and the surface
     * comes out in terraces lit flat, with walls where one step meets the next.
     */
    vertex?: string;
    /**
     * The same, in GLSL, without which the corners are not moved on WebGL2. `compileShader` gives
     * both from one graph, as for `fragmentGlsl`.
     */
    vertexGlsl?: string;
    /**
     * The uniforms, with the values they start at. Their kinds are read off these, and fixed from then
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
    /**
     * Which of the engine's shaders it is built on, its family: `'mesh3d'`, the one that lights
     * models. Not your code: that is `effect` (or `fragment`), and its file says the same family on
     * its `// @shader mesh3d` line.
     */
    shader: 'mesh3d';
    /**
     * A picture for the surface, from `useLoadTexture`. One loaded with `mipmaps: true` is read far
     * away from a smaller copy of itself, so a floor running into the distance does not shimmer.
     */
    texture?: TTexture;
    /**
     * The name a picture was loaded under, for a material built where the picture is not at hand.
     */
    key?: string;
    /**
     * Multiplies the picture, and is the whole colour without one. Default white.
     */
    tint?: TColorOption;
    /**
     * Light it gives off by itself. Default none.
     */
    emissive?: TColorOption;
    /**
     * A picture the glow comes through, multiplied by `emissive`: white where it glows, black where
     * it does not, the lit windows of a building or the screen of an arcade cabinet. Read with the
     * same edges and corners as `texture`. Default none, the glow the same all over.
     */
    emissiveTexture?: TTexture;
    /**
     * Where the light from all around is kept out of its creases, the shading a modelling program
     * calls occlusion: a picture whose red is white where the surface is open and black where it is
     * shut in. It darkens only the scene's `ambient`, never a lamp or the sun. The picture alone, or
     * `{ texture, strength, uv, wrap }` to apply less of it, lay it out by a second picture coordinate
     * or give it edges of its own (see {@link TMaterialOcclusion}). Default none.
     */
    occlusion?: TTexture | TMaterialOcclusion;
    /**
     * The colour of its shine. Default none, which is matt.
     */
    specular?: TColorOption;
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
     * How it lands on what is behind it. `'alpha'` (the default) covers it as far as its alpha says.
     * `'additive'` adds its colour instead, so it can only brighten: a flash, a hologram, a shield,
     * a beam of light, a magic circle. Its alpha says how much of it is added. An additive model is
     * always drawn as see-through (after the solid ones, hiding nothing, whatever `transparent`
     * says), casts no shadow, since light added blocks none, and fades into the fog by adding less
     * rather than by turning the fog's colour.
     */
    blend?: 'alpha' | 'additive';
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
     * own `wrap` and `smooth`. In the shader, `sampleMap_<name>(uv)` reads the one under that name,
     * in the fragment hook and in the vertex hook alike (see `vertex`).
     *
     * A picture made with mipmaps (`useLoadTexture({ mipmaps: true })`) is read in the fragment hook
     * from the copy its size on the screen asks for, judged by how the model's own `ctx.uv` runs
     * across the screen, inside a branch too. Read at a place that runs faster, say how much faster
     * with `sampleMapScaled_<name>(uv, scale)`: `sampleMapScaled_detail(ctx.uv * 8.0, vec2(8.0))`.
     * Otherwise a picture repeated eight times is read eight times too sharp far away and shimmers.
     * A scale of `vec2(0.0)` reads the picture itself, for a place that does not follow the surface
     * (`envUv(ctx)`). `sampleTexture` and `sampleTextureScaled` do the same for `texture`. The vertex
     * hook always reads the picture itself.
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
     * subtle. Left out, the scene's render style decides (`useRenderStyle`), and with none it is off;
     * `false`, or `0`, says no to that style.
     */
    vertexSnap?: boolean | number;
    /**
     * Its picture is stretched straight across the screen without correcting for depth, the way the
     * PlayStation drew it: big flat surfaces bend and swim as the camera comes close. Left out, the
     * scene's render style decides (`useRenderStyle`), and with none it is off; `false` says no to it.
     */
    affine?: boolean;
    /**
     * Its light is worked out at every pixel rather than at its corners. The engine's own light is
     * worked out at the corners and smeared across each triangle, the way the consoles of the era
     * did it; a shine that falls between corners is lost, or comes out shaped like the triangles.
     * Worked out at every pixel, a shine is a round, clean spot that slides across the surface
     * however few triangles the model has: the look of the computer graphics of the time, glossy
     * plastic and chrome. It costs more per pixel, and a shader of your own receives that light in
     * `ctx.light` and `ctx.shine` without changing. It can be changed while the game runs. Left out,
     * the scene's render style decides (`useRenderStyle`), and with none it is off; `false` says no
     * to that style.
     */
    perPixel?: boolean;
    /**
     * What its surface reflects: a round picture of its surroundings, and how much it reflects in
     * front and at the edge (see {@link TMaterialReflection}). The picture alone is a glossy plastic
     * (`front: 0.04`, `edge: 1`); `front: 0.9` is chrome. It goes over the light, under the shine and
     * the glow, and with `lighting` and `steps` too. It makes part of the colour, so it is not given
     * with `fragment` or `effect`: a shader of your own reads a map at `envUv(ctx)` instead. The
     * picture takes the map `reflection`, one of the four, and the two numbers are the uniforms
     * `reflectionFront` and `reflectionEdge`. Default none.
     *
     * @example
     * ```ts
     * declare const studio: TTexture;
     *
     * createMaterial({ shader: 'mesh3d', tint: '#d8322a', specular: '#ffffff', shininess: 60, reflection: studio });
     * createMaterial({ shader: 'mesh3d', tint: '#c0c4cc', reflection: { texture: studio, front: 0.9 } });
     * ```
     */
    reflection?: TTexture | TMaterialReflection;
    /**
     * A normal map that bends its surface at every pixel, so a flat wall catches the light as carved
     * stone or brick would: the picture alone, or `{ texture, strength }` (`0` flat, `1` as the map
     * says, the default). It needs the model's tangents, which every built-in shape and model file has.
     * The material is lit at every pixel unless it says `perPixel: false`. The picture takes the map
     * `normalMap`, one of the four, and the strength is the uniform `normalStrength`. Not with an
     * `effect` from a file. Default none.
     *
     * @example
     * ```ts
     * import { normalsFromHeight, createPixelTexture } from 'nacatamalon/pixels';
     * import type { TPixels } from 'nacatamalon/pixels';
     * declare const stone: TPixels;
     *
     * createMaterial({ shader: 'mesh3d', texture: createPixelTexture(stone), normalMap: createPixelTexture(normalsFromHeight(stone, { depth: 4 })) });
     * ```
     */
    normalMap?: TTexture | TMaterialNormalMap;
    /**
     * Which side of its triangles is thrown away. `'back'` (the default) is a shape seen from
     * outside; `'front'` one seen from inside, such as a dome of sky; `'none'` draws both sides, each
     * lit as the side it is, for a leaf, a sheet or the top of a liquid. A colour hook tells the two
     * sides apart with `ctx.frontFacing`.
     */
    cull?: TCullMode;
    /**
     * Cuts its picture out instead of blending it: a pixel whose alpha is below this number is not
     * drawn, every other one is drawn solid. For a fence, a leaf, grass or a paper figure, which then
     * hides what is behind it and casts the shadow of its shape. `0.5` is the usual; from 0 to 1.
     * Omitted, nothing is cut.
     */
    alphaCutoff?: number;
    /**
     * How the surface is lit, in place of the engine's light: `toonLighting()` (flat bands) or `unlitLighting()` (no
     * light at all). One only. Its numbers become uniforms of the material (`toonShadow`...), so they can
     * be turned while the game runs. It makes the colour, so it is not given with `fragment` or
     * `effect`; a `vertex` hook may go with it.
     */
    lighting?: TLightingLook;
    /**
     * What is done to the surface once it is lit, in order: `mangaDots()` (ink in the shadow),
     * `rim()` (a lit edge). On `lighting` when there is one, on the engine's light when not. Their
     * numbers become uniforms too (`mangaDotsSize`, `rimColor`; a second of one kind is `rim2Color`).
     */
    steps?: readonly TStepLook[];
};

/**
 * What `createMaterial` is asked for when the material is for flat things.
 *
 * There is nothing here about a picture or a colour, because those belong to the sprite. This is the
 * effect and its uniforms, and nothing else.
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSpriteMaterialOptions = TMaterialShaderOptions & {
    /**
     * Which of the engine's shaders it is built on, its family: `'sprite2d'`, the one that draws
     * sprites and texts. Left out, it is this one, the commoner of the two by a long way. Not your
     * code: that is `effect` (or `fragment`).
     */
    shader?: 'sprite2d';
    /**
     * Extra pictures for the shader to read by name, up to four, each a texture or a texture with its
     * own `wrap` and `smooth`. In the shader, `sampleMap_<name>(uv)` reads the one under that name,
     * and `localUv()` is where this pixel is across what is drawn, 0 to 1: the whole sprite, one tile
     * of a map (`layerUv()` is across the whole layer), one letter of a text, one piece of a
     * nine-slice. A mask that stays put while the sprite animates is read there, and not at the `uv`
     * of the sheet.
     *
     * @example
     * ```ts
     * // The enemy crumbles into grain as `gone` goes from 0 to 1.
     * const crumble = createMaterial({
     *     maps: { grain: createPixelTexture(fillNoise(createPixels(32, 32), { scale: 4 })) },
     *     fragment: `fn effect(color: vec4f, uv: vec2f) -> vec4f {
     *         if (sampleMap_grain(localUv()).r < mu.gone) { return vec4f(0.0); }
     *         return color;
     *     }`,
     *     uniforms: { gone: 0 },
     * });
     * ```
     */
    maps?: Record<string, TTexture | TMaterialMap>;
};

/**
 * What `createMaterial` is asked for. `shader` decides which of the two you are making.
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMaterialOptions = TSpriteMaterialOptions | TMeshMaterialOptions;
