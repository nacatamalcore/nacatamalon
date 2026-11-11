import type { TLightingLook, TStepLook } from '../../shader_composer/surface/types';
import type { TColor } from '../../color';
import type { TTexture } from '../../loaders';
import type { TShader } from '../../loaders/shader/types/t_shader';
import type { TMaterialShader, TUniformType, TUniformSignature, TUniformValues } from './t_uniforms';

/**
 * What both kinds of material have: a shader of your own, and the uniforms on it.
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
     * The uniforms, or `null` when there is no shader of your own to turn.
     */
    uniforms: TUniformValues | null;
    /**
     * What kind each uniform is. Fixed once, because the compiled shader was built against it.
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
    /**
     * Extra pictures for its shader to read, by name, up to four: `sampleMap_<name>(uv)` reads the
     * one under that name, usually at `localUv()`, across what is drawn. Read every frame, so
     * swapping one shows at once.
     */
    maps?: Record<string, TMaterialMap>;
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
 * Which side of each triangle is thrown away, by which way it faces the camera.
 *
 * - `'back'`: the side facing away. A closed shape seen from outside, which is nearly everything,
 *   and half the work saved, since half of a closed shape always faces away.
 * - `'front'`: the side facing the camera. A shape seen from inside: a dome of sky, a room the camera
 *   stands in. It is lit from inside too.
 * - `'none'`: nothing. Both sides drawn, each lit as the side it is: a leaf, a sheet, a flag, the
 *   top of a liquid.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCullMode = 'back' | 'front' | 'none';

/**
 * One extra picture a material carries for its shader to read, besides the picture it is drawn
 * with: a reflection, a mask, a fine detail, a ripple.
 *
 * The shader reads it by name, `sampleMap_<name>(uv)`, with the same wrap and filtering choices the
 * main picture has. A picture with mipmaps is read by a model's colour hook from the copy its size
 * on the screen asks for; `sampleMapScaled_<name>(uv, scale)` reads it at a place that runs `scale`
 * times as fast as the model's picture coordinate (see `TMaterialOptions.maps`).
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMaterialMap = {
    /**
     * The picture. One still loading reads as white until it lands; what wears it is drawn meanwhile.
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
 * How much of the light from all around reaches each part of a model's surface: a crease, an
 * armpit, the gap between two pieces, where little of the room can see in.
 *
 * Its picture's red is how open a place is, white wide open and black shut in. It darkens only the
 * light from all around (the scene's `ambient`), never a lamp's or the sun's: a crease turned to the
 * sun is lit, and the same crease in the shade is darker than the open surface beside it. It is what
 * a model file calls its occlusion, the shading its author saw in the modelling program, and one
 * picture with the roughness and metalness in its other channels serves as it is.
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMaterialOcclusion = {
    /**
     * The picture, read in its red. One still loading reads as white, wide open, until it lands.
     */
    texture: TTexture;
    /**
     * How much of it is applied, `0` none to `1` all. Default `1`.
     */
    strength?: number;
    /**
     * Which picture coordinate it is laid out by: `'uv'`, the one the colour picture uses, or
     * `'uv2'`, a second one the model file brings or `createGeometry` is given (shapes with none read
     * their first again).
     * Default `'uv'`.
     */
    uv?: 'uv' | 'uv2';
    /**
     * What the picture does past its edge, one word for both ways or one each: `'repeat'`,
     * `'clamp'` or `'mirror'`. Omitted, what the colour picture does (the material's `wrap`). It is
     * read with the material's filtering.
     */
    wrap?: TTextureWrap | { u: TTextureWrap; v: TTextureWrap };
};

/**
 * What a model's surface reflects, and how much: a picture of its surroundings laid on it by which
 * way it faces from the camera, the chrome of the era's consoles and the glossy plastic of its
 * computer graphics.
 *
 * The picture is round, the surroundings as a ball of chrome would show them seen from in front: the
 * middle is what is behind the camera, and the rim what is behind the model. The reflection follows
 * the camera, as it did then.
 *
 * How much is reflected changes with the angle: `front` where the surface faces the camera, `edge`
 * where it turns away, and in between the way light does (more and more towards the edge, and fast
 * near it). Glossy plastic or paint reflects little in front and much at the edge (`front: 0.04`,
 * `edge: 1`); chrome reflects nearly everything everywhere (`front: 0.9`).
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMaterialReflection = {
    /**
     * The surroundings, as one round picture. One still loading reads as white until it lands.
     */
    texture: TTexture;
    /**
     * How much is reflected where the surface faces the camera, `0` to `1`. Default `0.04`, a glossy
     * plastic.
     */
    front?: number;
    /**
     * How much is reflected where the surface turns away from the camera, `0` to `1`. Default `1`.
     */
    edge?: number;
    /**
     * How much what is reflected takes the surface's own colour, `0` to `1`, as a metal's does: gold
     * reflects a white sky gold. Default `0`, the plain mirror of plastic, glass and chrome. What a
     * metal reflects is the surface's own colour, so it leaves a see-through surface as see-through
     * as it is, where a plain mirror's makes it more solid.
     */
    metal?: number;
    /**
     * How its picture is read: `'round'` (the default), a round picture of the surroundings, read at
     * where the reflection lands on it; `'cube'`, the six faces of a cube of them, three across and
     * two down, as `useEnvironment` draws them; `'screen'`, a picture of the world seen in a mirror,
     * read at the pixel's own place on the screen, as `useMirror` draws it. The last two are drawn by
     * code, so a scene document does not keep them: a scene saved while the game runs comes back with
     * the surface plain, and the code that gave it them gives them again.
     */
    read?: 'round' | 'cube' | 'screen';
    /**
     * How soft a mirror's picture is, in pixels (`read: 'screen'` only): `0`, the default, sharp; a
     * few for polished stone or a wet floor. A uniform, `reflectionBlur`, so it changes while it runs.
     */
    blur?: number;
};

/**
 * A normal map: a picture whose colours are the directions a surface faces at each of its pixels, so a
 * flat wall catches the light as if it were carved, stone, brick, wood grain, rivets.
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMaterialNormalMap = {
    /**
     * The map: each pixel's colour a direction in the surface's own frame, red across the picture,
     * green up it, blue out of the surface (the usual lilac ones; `normalsFromHeight` makes one from a
     * picture of heights).
     */
    texture: TTexture;
    /**
     * How far it bends the surface: `0` flat, `1` as the map says, more to deepen it. Default `1`. A
     * uniform, `normalStrength`, so it changes while the game runs.
     */
    strength?: number;
};

/**
 * A material's reflection as it keeps it: every number filled in, and how it is read and softened
 * only when it is a mirror's.
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMaterialReflectionRecord = Required<Omit<TMaterialReflection, 'read' | 'blur'>> & Pick<TMaterialReflection, 'read' | 'blur'>;

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
     * A picture the glow comes through, multiplied by `emissive`: white where it glows, black where
     * it does not, the lit windows of a building or the screen of an arcade cabinet. Read with the
     * same edges and corners as `texture`. Omitted, the glow is the same all over.
     */
    emissiveTexture?: TTexture | null;
    /**
     * Where the light from all around is kept out of its creases. See {@link TMaterialOcclusion}.
     * Always the long form here, `{ texture, strength, uv, wrap }`, whichever was given to make it: to
     * change it later, write that. Omitted, nothing is.
     */
    occlusion?: TMaterialOcclusion | null;
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
     * How it lands on what is behind it: `'alpha'` covers, `'additive'` adds its colour, and is always
     * drawn see-through and casts no shadow. Omitted, `'alpha'`. Can be changed any frame.
     */
    blend?: 'alpha' | 'additive';
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
     * shader reads the one under that name, in the fragment hook or the vertex hook. Read every
     * frame, so swapping one shows at once.
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
     * Left out, the scene's render style decides (`useRenderStyle`), and with none there is no
     * snapping; `false`, or `0`, says no to that style.
     */
    vertexSnap?: boolean | number;
    /**
     * Its picture is stretched straight across the screen, without correcting for depth, the way the
     * PlayStation drew it: a floor or a wall bends and swims as the camera comes close.
     *
     * The warp grows with the size of a triangle on screen, so a big flat plane shows it most and a
     * finely cut one hides it, which is what the games of the time did to keep it down. Left out,
     * the scene's render style decides (`useRenderStyle`), and with none the picture is held true to
     * the surface; `false` says no to that style.
     */
    affine?: boolean;
    /**
     * Its light is worked out at every pixel rather than at its corners: a shine is a round, clean
     * spot that slides across the surface however few triangles the model has, where the engine's
     * own light, worked out at the corners and smeared across each triangle, loses it between them.
     * The look of the computer graphics of the era (glossy plastic, chrome) rather than of its
     * consoles.
     *
     * Drawn the way a material with a shader of its own is, whether it has one or not: that way
     * already carries which way the surface faces and where it is to every pixel, which the light
     * needs. A shader of your own receives it in `ctx.light` and `ctx.shine` without changing; one
     * written in WGSL only is drawn the built-in way on WebGL2, as always, and there the light is
     * worked out at the corners. Read every frame, so it can change while the game runs. Left out,
     * the scene's render style decides (`useRenderStyle`), and with none it is off; `false` says no
     * to that style.
     */
    perPixel?: boolean;
    /**
     * What its surface reflects, and how much in front and at the edge, as it was asked for (see
     * {@link TMaterialReflection}). Kept so it can be written down and made again, like `lighting`:
     * the picture is the material's map `reflection`, and the two numbers are its uniforms
     * `reflectionFront` and `reflectionEdge`, which are what change while the game runs. Left out
     * when it has none.
     */
    reflection?: TMaterialReflectionRecord;
    /**
     * The normal map that bends its surface, as it was made with, its strength filled in. Kept so it
     * can be written down and made again. Left out when it has none.
     */
    normalMap?: Required<TMaterialNormalMap>;
    /**
     * Which side of its triangles is thrown away: `'back'`, `'front'` or `'none'` (see
     * {@link TCullMode}). Omitted, `'back'`. Read every frame, so it can change while the game runs.
     */
    cull?: TCullMode;
    /**
     * Cuts its picture out instead of blending it: a pixel whose alpha is below this number is not
     * drawn at all, and every other one is drawn solid. A fence, a leaf, grass, hair or a paper
     * figure, with the shape of its picture and none of its square. Solid, so it hides what is behind
     * it, needs no sorting, and casts the shadow of its shape. The edge is as hard as the picture is
     * read: pixel steps without `smooth`, rounded with it. The alpha is the picture's times the tint,
     * the corners' colour and `alpha`, or what a colour hook returns. `0.5` is the usual. Omitted, nothing is
     * cut. Read every frame, so it can change while the game runs.
     */
    alphaCutoff?: number;
    /**
     * The lighting look it was made with, kept so it can be written down and made again. Left out
     * when it has none.
     */
    lighting?: TLightingLook;
    /**
     * The steps it was made with, for the same reason. Left out when it has none.
     */
    steps?: readonly TStepLook[];
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
