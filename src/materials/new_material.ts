import { getColor } from '../color';
import { createRecord } from '../gameobjects/create_record';
import { applyShader, rememberOverrides } from './apply_shader';
import { deriveSignature, MATERIAL_RULES } from './derive_signature';
import { checkParameterRoom } from './check_parameter_room';
import { compileShader } from '../shader_composer/compile_shader';
import { composeSurface, REFLECTION_MAP } from '../shader_composer/surface/compose_surface';
import { MAP_NAME, MAX_MATERIAL_MAPS } from '../render/shared/material_maps';
import type { TMaterial, TMaterialMap, TMaterialOcclusion, TMaterialReflection, TMaterialNormalMap, TMaterialReflectionRecord, TMeshMaterial, TSpriteMaterial } from './types/t_material';
import type { TMaterialOptions, TMeshMaterialOptions, TSpriteMaterialOptions } from './types/t_material_options';
import type { TShader } from '../loaders/shader/types/t_shader';
import type { TTexture } from '../loaders';

/**
 * Whether a cull was asked for in a word the engine knows. Anything else is left out, and draws as
 * `'back'`, which is what it would have done before the option existed.
 */
const isCullMode = (value: unknown): value is 'back' | 'front' | 'none' => value === 'back' || value === 'front' || value === 'none';

/**
 * The cutoff asked for, checked: a number from 0 to 1, or nothing. Anything else is a fence drawn
 * as a solid square, or as nothing, with no word why, so it is refused.
 */
const cutoffOf = (value: unknown): number | undefined => {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error(`[NacatamalOn] createMaterial: alphaCutoff is ${String(value)}, and it takes the alpha below which a pixel is cut out, from 0 to 1 (0.5 is the usual).`);
    }
    return value;
};

/**
 * Whether a `vertexSnap` asks for anything: `true`, or a row count above zero.
 */
const isSnapping = (value: boolean | number | undefined): boolean =>
    value === true || (typeof value === 'number' && Number.isFinite(value) && value > 0);

/**
 * The extra maps as the record keeps them: each one in the long form, after checking there are few
 * enough and that each name can be part of a function name in a shader.
 */
const mapsOf = (asked: Record<string, TTexture | TMaterialMap> | undefined): Record<string, TMaterialMap> | undefined => {
    if (asked === undefined) {
        return undefined;
    }
    const names = Object.keys(asked);
    if (names.length > MAX_MATERIAL_MAPS) {
        throw new Error(`[NacatamalOn] createMaterial: a material carries at most ${MAX_MATERIAL_MAPS} maps, and was given ${names.length} (${names.join(', ')}).`);
    }
    const maps: Record<string, TMaterialMap> = {};
    for (const name of names) {
        if (!MAP_NAME.test(name)) {
            throw new Error(`[NacatamalOn] createMaterial: '${name}' cannot name a map: the shader reads it as sampleMap_${name}, so it has to be a letter-first lowercase name of letters and digits, such as 'noise' or 'env'.`);
        }
        const given = asked[name]!;
        maps[name] = 'type' in given && given.type === 'texture' ? { texture: given } : { ...(given as TMaterialMap) };
        checkWrap(maps[name]!.wrap, `the map '${name}' wrap`);
    }
    return maps;
};

/**
 * The maps with the reflection's picture added under its own name, held at its edges (a round
 * picture has nothing past them). Refused when that name is already taken or there is no room left,
 * naming why.
 */
const withReflection = (maps: Record<string, TMaterialMap> | undefined, reflection: TMaterialReflectionRecord): Record<string, TMaterialMap> => {
    const own = { ...maps };
    // A material's own record spread into another carries both, the same picture twice: one of them.
    if (REFLECTION_MAP in own) {
        if (own[REFLECTION_MAP]!.texture !== reflection.texture) {
            throw new Error(`[NacatamalOn] createMaterial: the map '${REFLECTION_MAP}' is where reflection keeps its picture. Give that map another name, or the picture to reflection.`);
        }
        delete own[REFLECTION_MAP];
    }
    if (Object.keys(own).length >= MAX_MATERIAL_MAPS) {
        throw new Error(`[NacatamalOn] createMaterial: reflection takes one of a material's ${MAX_MATERIAL_MAPS} maps, and all of them are taken (${Object.keys(own).join(', ')}).`);
    }
    return { ...own, [REFLECTION_MAP]: { texture: reflection.texture, wrap: 'clamp' } };
};

/**
 * A `wrap` checked: one word the engine knows, or one for each way. A word it does not know would
 * leave the card with no sampler to read the picture by, so it is refused, naming where it was.
 */
const checkWrap = (wrap: unknown, where: string): void => {
    const known = (word: unknown): boolean => word === 'repeat' || word === 'clamp' || word === 'mirror';
    if (wrap === undefined || known(wrap)) {
        return;
    }
    const pair = wrap as { u?: unknown; v?: unknown } | null;
    if (typeof pair === 'object' && pair !== null && known(pair.u) && known(pair.v)) {
        return;
    }
    throw new Error(`[NacatamalOn] createMaterial: ${where} is ${JSON.stringify(wrap)}, and it takes 'repeat', 'clamp' or 'mirror', or { u, v } with one of them each way.`);
};

/**
 * The occlusion as the record keeps it: always the long form, checked. A strength outside 0 to 1 or
 * a coordinate the engine has no name for would shade the model wrong with no word why, so both are
 * refused.
 */
const occlusionOf = (asked: TTexture | TMaterialOcclusion | null | undefined): TMaterialOcclusion | undefined => {
    // `null` is none too: a material's own record says so, and one spread into another passes it on.
    if (asked === undefined || asked === null) {
        return undefined;
    }
    const occlusion: TMaterialOcclusion = 'type' in asked && asked.type === 'texture' ? { texture: asked } : { ...(asked as TMaterialOcclusion) };
    const { texture, strength, uv } = occlusion;
    if (typeof texture !== 'object' || texture === null || texture.type !== 'texture') {
        throw new Error('[NacatamalOn] createMaterial: occlusion has no picture. Give it a texture, alone or as { texture, strength, uv }.');
    }
    if (strength !== undefined && (typeof strength !== 'number' || !Number.isFinite(strength) || strength < 0 || strength > 1)) {
        throw new Error(`[NacatamalOn] createMaterial: occlusion.strength is ${String(strength)}, and it takes how much of the occlusion is applied, from 0 to 1.`);
    }
    if (uv !== undefined && uv !== 'uv' && uv !== 'uv2') {
        throw new Error(`[NacatamalOn] createMaterial: occlusion.uv is '${String(uv)}', and it takes 'uv' or 'uv2', the picture coordinate the occlusion is laid out by.`);
    }
    checkWrap(occlusion.wrap, 'occlusion.wrap');
    return occlusion;
};

/**
 * The reflection as the record keeps it: the long form with both numbers, checked. A number outside
 * 0 to 1 would reflect more light than reaches the surface, so it is refused.
 */
const reflectionOf = (asked: TTexture | TMaterialReflection | null | undefined): TMaterialReflectionRecord | undefined => {
    if (asked === undefined || asked === null) {
        return undefined;
    }
    if (typeof asked !== 'object') {
        throw new Error('[NacatamalOn] createMaterial: reflection has no picture. Give it a texture of the surroundings, alone or as { texture, front, edge }.');
    }
    const given: TMaterialReflection = 'type' in asked && asked.type === 'texture' ? { texture: asked } : (asked as TMaterialReflection);
    if (typeof given.texture !== 'object' || given.texture === null || given.texture.type !== 'texture') {
        throw new Error('[NacatamalOn] createMaterial: reflection has no picture. Give it a texture of the surroundings, alone or as { texture, front, edge }.');
    }
    const checked = (value: number | undefined, fallback: number, field: string): number => {
        if (value === undefined) {
            return fallback;
        }
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
            throw new Error(field === 'metal'
                ? `[NacatamalOn] createMaterial: reflection.metal is ${String(value)}, and it takes how much what is reflected takes the surface's colour, from 0 (a mirror) to 1 (gold).`
                : `[NacatamalOn] createMaterial: reflection.${field} is ${String(value)}, and it takes how much is reflected, from 0 to 1 (0.04 a glossy plastic in front, 0.9 chrome).`);
        }
        return value;
    };
    if (given.read !== undefined && given.read !== 'round' && given.read !== 'cube' && given.read !== 'screen') {
        throw new Error(`[NacatamalOn] createMaterial: reflection.read is ${String(given.read)}, and it takes 'round' (a picture of the surroundings), 'cube' (useEnvironment's) or 'screen' (a mirror's, from useMirror).`);
    }
    if (given.blur !== undefined && (typeof given.blur !== 'number' || !Number.isFinite(given.blur) || given.blur < 0)) {
        throw new Error(`[NacatamalOn] createMaterial: reflection.blur is ${String(given.blur)}, and it takes how soft a mirror is, in pixels, from 0.`);
    }
    return {
        texture: given.texture,
        front: checked(given.front, 0.04, 'front'),
        edge: checked(given.edge, 1, 'edge'),
        metal: checked(given.metal, 0, 'metal'),
        ...(given.read === 'screen' ? { read: 'screen' as const, blur: given.blur ?? 0 } : {}),
        ...(given.read === 'cube' ? { read: 'cube' as const } : {}),
    };
};

/**
 * Makes again the colour hook of a material that reflects, as one cut out by its alpha: its holes
 * stay holes, rather than being filled in where it reflects. For a cutoff that comes after the
 * material was made, as a model file's does once it lands. The uniforms are the same, so only the
 * source changes, and the renderer picks up the new one.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const cutReflection = (material: TMeshMaterial): void => {
    if (material.reflection === undefined) {
        return;
    }
    const remade = compileShader({ shader: 'mesh3d', color: composeSurface(material.lighting, material.steps, { ...material.reflection, cut: true }) });
    // Its normal map, when it has one, named again, or the shader would give it no slot.
    const named = material.normalMap === undefined ? '' : NORMAL_MAP_LINE;
    material.fragment = remade.fragment === undefined || remade.fragment === null ? null : named + remade.fragment;
    material.fragmentGlsl = remade.fragmentGlsl === undefined || remade.fragmentGlsl === null ? null : named + remade.fragmentGlsl;
};

/**
 * The map a normal map takes, and the number its strength is: reserved names, which the ending of a
 * material's shader looks for to bend its facing (see mesh_material_shader.ts, `bumpedBy`).
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const NORMAL_MAP = 'normalMap';
export const NORMAL_STRENGTH = 'normalStrength';

/**
 * The line a material with a normal map begins its colour hook with: it names the map, which is how
 * a shader's maps get their slots (see material_maps.ts); the ending reads it, not the hook.
 */
const NORMAL_MAP_LINE = `// Bent by its normal map: the ending reads sampleMap_${NORMAL_MAP}(uv).\n`;

type THook = { fragment: string | null; fragmentGlsl: string | null };
let plainHook: THook | null = null;

/**
 * The colour hook that is the engine's own ending, word for word: what a material with a normal map
 * and nothing else of its own is drawn with. Made once.
 */
const plainSurfaceHook = (): THook => {
    if (plainHook === null) {
        const made = compileShader({ shader: 'mesh3d', color: composeSurface(undefined, undefined, null) });
        plainHook = { fragment: made.fragment ?? null, fragmentGlsl: made.fragmentGlsl ?? null };
    }
    return plainHook;
};

/**
 * A material's colour hook as it was given or made, without the line its normal map adds; and whether
 * that is the engine's own ending, which a material with only a normal map was given. What a scene
 * document writes, so the line is not written twice and a hook nobody wrote is not written at all.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const hookWithoutNormalMap = (code: string | null): { code: string | null; plain: boolean } => {
    const bare = code !== null && code.startsWith(NORMAL_MAP_LINE) ? code.slice(NORMAL_MAP_LINE.length) : code;
    const plain = bare !== null && (bare === plainSurfaceHook().fragment || bare === plainSurfaceHook().fragmentGlsl);
    return { code: bare, plain };
};

/**
 * A normal map as the record keeps it, checked: its picture and how far it bends, `0` to `1`... or more.
 */
const normalMapOf = (asked: TMeshMaterialOptions['normalMap']): Required<TMaterialNormalMap> | undefined => {
    if (asked === undefined || asked === null) {
        return undefined;
    }
    const given = 'type' in asked && asked.type === 'texture' ? { texture: asked as TTexture } : asked as { texture: TTexture; strength?: number };
    if (typeof given.texture !== 'object' || given.texture === null || given.texture.type !== 'texture') {
        throw new Error('[NacatamalOn] createMaterial: normalMap has no picture. Give it the picture, alone or as { texture, strength }.');
    }
    const strength = given.strength ?? 1;
    if (typeof strength !== 'number' || !Number.isFinite(strength) || strength < 0) {
        throw new Error(`[NacatamalOn] createMaterial: normalMap.strength is ${String(strength)}, and it takes how far the map bends the surface, from 0 (flat) up, 1 as the map says.`);
    }
    return { texture: given.texture, strength };
};

/**
 * The options of a material with a normal map, made ready for it: the map among its maps, its strength
 * among its numbers, lit at every pixel unless it says otherwise (bent facings at the corners only
 * smear), and a colour hook that names the map, so the shader gives it a slot. One with none is made
 * the engine's own ending, as a material with only a reflection is.
 */
const withNormalMap = (options: TMeshMaterialOptions, effect: TShader | null): TMeshMaterialOptions => {
    const bump = normalMapOf(options.normalMap);
    if (bump === undefined) {
        return options;
    }
    if (effect !== null) {
        throw new Error('[NacatamalOn] createMaterial: a normal map goes with a shader written at the call site or with looks, not with an effect from a file: the file is read later, and the map needs a slot in it from the start.');
    }
    if (options.maps !== undefined && NORMAL_MAP in options.maps) {
        throw new Error(`[NacatamalOn] createMaterial: the map '${NORMAL_MAP}' is where normalMap keeps its picture. Give that map another name.`);
    }
    const named = NORMAL_MAP_LINE;
    const plain = options.fragment === undefined && options.fragmentGlsl === undefined ? plainSurfaceHook() : null;
    const fragment = plain?.fragment ?? options.fragment;
    const fragmentGlsl = plain?.fragmentGlsl ?? options.fragmentGlsl;
    const given = options.uniforms ?? {};
    if (!(NORMAL_STRENGTH in given)) given[NORMAL_STRENGTH] = bump.strength;
    return {
        ...options,
        ...(fragment !== undefined && fragment !== null ? { fragment: named + fragment } : {}),
        ...(fragmentGlsl !== undefined && fragmentGlsl !== null ? { fragmentGlsl: named + fragmentGlsl } : {}),
        uniforms: given,
        maps: { ...(options.maps ?? {}), [NORMAL_MAP]: { texture: bump.texture, ...(options.wrap !== undefined ? { wrap: options.wrap } : {}) } },
        perPixel: options.perPixel ?? true,
    };
};

/**
 * The shader a material's looks make, or `null` when it has none. Refuses what contradicts them: a
 * colour hook of its own (the looks make the colour), and a material for sprites (looks light a
 * model's surface).
 */
const looksOf = (options: TMaterialOptions, effect: TShader | null, reflection: TMaterialReflectionRecord | undefined) => {
    const { lighting, steps } = options as TMeshMaterialOptions;
    if (reflection !== undefined) {
        // It makes part of the colour, as the looks do, and goes with them.
        if (effect !== null || options.fragment !== undefined || options.fragmentGlsl !== undefined) {
            throw new Error('[NacatamalOn] createMaterial: reflection makes part of the colour, so a material with it has no fragment or effect of its own. A shader of your own reads a map at envUv(ctx) instead. A vertex hook may go with it.');
        }
        // One cut out by its alpha keeps its holes: the reflection does not make it more solid.
        const cut = (cutoffOf((options as TMeshMaterialOptions).alphaCutoff) ?? 0) > 0;
        return compileShader({ shader: 'mesh3d', color: composeSurface(lighting, steps, { ...reflection, cut }) });
    }
    if (lighting === undefined && (steps === undefined || steps.length === 0)) {
        return null;
    }
    if (options.shader !== 'mesh3d') {
        throw new Error("[NacatamalOn] createMaterial: lighting and steps light a model's surface, so they need shader: 'mesh3d'.");
    }
    if (effect !== null || options.fragment !== undefined || options.fragmentGlsl !== undefined) {
        throw new Error('[NacatamalOn] createMaterial: lighting and steps make the colour, so a material with them has no fragment or effect of its own. A vertex hook may go with them.');
    }
    return compileShader({ shader: 'mesh3d', lighting, steps });
};

/**
 * Builds the material record from what was asked for, with the lookups already done.
 *
 * The picture and the file are handed in rather than looked up here, because finding them needs the
 * running game and this has to work from a test with no game in it.
 *
 * A material given a file starts with **no source at all** and gets it when the bytes land. That is
 * not a half-built state: a material with nothing to compile draws through the built-in shader, so
 * the first frames of a scene look right rather than looking like nothing.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const newMaterial = (
    options: TMaterialOptions,
    texture: TTexture | null,
    effect: TShader | null,
): TMaterial => {
    const reflection = options.shader === 'mesh3d' ? reflectionOf((options as TMeshMaterialOptions).reflection) : undefined;
    const looks = looksOf(options, effect, reflection);
    if (looks !== null) {
        // The looks' uniforms are added to the bag the caller handed in (or a new one) without
        // overwriting what was asked: the call site says what a uniform is here.
        const given = options.uniforms ?? {};
        for (const [name, value] of Object.entries(looks.uniforms)) {
            if (!(name in given)) given[name] = value;
        }
        options = { ...options, fragment: looks.fragment, fragmentGlsl: looks.fragmentGlsl, uniforms: given };
    }
    if (options.shader === 'mesh3d') {
        options = withNormalMap(options as TMeshMaterialOptions, effect);
    }
    const asked = options.uniforms ?? {};
    // Written inline, the source is what it is from the start. From a file, everything stays empty
    // until it arrives, and `applyShader` fills it in.
    const written = effect === null;
    const inline = options.fragment ?? options.vertex ?? options.fragmentGlsl ?? options.vertexGlsl;
    // Whether this material has a shader of its own at all, now or later. Without one there are no
    // uniforms either, and `null` says that outright rather than leaving an empty bag that reads as
    // "an effect with no parameters".
    const shaded = effect !== null || inline !== undefined;

    const half = {
        name: options.name ?? null,
        fragment: written ? options.fragment ?? null : null,
        fragmentGlsl: written ? options.fragmentGlsl ?? null : null,
        vertex: written ? options.vertex ?? null : null,
        vertexGlsl: written ? options.vertexGlsl ?? null : null,
        // Handed back when it was handed in, even with no shader to read it yet: whoever passed a
        // bag holds on to it to write into, and `createMaterial`'s type promises it is there.
        uniforms: shaded ? asked : options.uniforms ?? null,
        uniformSig: shaded ? deriveSignature(asked) : null,
        effect,
    };
    if (half.uniformSig !== null) {
        checkParameterRoom(half.uniformSig, MATERIAL_RULES, half.name);
    }

    if (options.shader === 'mesh3d') {
        checkWrap((options as TMeshMaterialOptions).wrap, 'wrap');
    }
    const material: TMaterial = options.shader === 'mesh3d'
        ? createRecord('material', {
            ...half,
            shader: 'mesh3d',
            texture,
            tint: getColor((options as TMeshMaterialOptions).tint ?? 'white'),
            emissive: getColor((options as TMeshMaterialOptions).emissive ?? 'black'),
            // Left out when not asked for, so a material that never had one saves as before.
            ...((options as TMeshMaterialOptions).emissiveTexture !== undefined
                ? { emissiveTexture: (options as TMeshMaterialOptions).emissiveTexture }
                : {}),
            // The same: left out when not asked for.
            ...(occlusionOf((options as TMeshMaterialOptions).occlusion) !== undefined
                ? { occlusion: occlusionOf((options as TMeshMaterialOptions).occlusion) }
                : {}),
            specular: getColor((options as TMeshMaterialOptions).specular ?? 'black'),
            shininess: (options as TMeshMaterialOptions).shininess ?? 32,
            alpha: (options as TMeshMaterialOptions).alpha ?? 1,
            // Left as written: absent means "decided by the alpha", which is not the same as `false`.
            transparent: (options as TMeshMaterialOptions).transparent,
            // Left out unless asked, so a material that never mentioned it saves as before.
            ...((options as TMeshMaterialOptions).blend !== undefined ? { blend: (options as TMeshMaterialOptions).blend } : {}),
            smooth: (options as TMeshMaterialOptions).smooth,
            // Left out when not asked for: absent is repeat, and a default is not a decision.
            ...((options as TMeshMaterialOptions).wrap !== undefined ? { wrap: (options as TMeshMaterialOptions).wrap } : {}),
            // Left out when there are none, so a material that never had maps saves as before.
            ...(reflection !== undefined
                ? { maps: withReflection(mapsOf((options as TMeshMaterialOptions).maps), reflection), reflection }
                : (options as TMeshMaterialOptions).maps !== undefined ? { maps: mapsOf((options as TMeshMaterialOptions).maps) } : {}),
            // The same: left out unless asked, so a material that never mentioned it saves as before.
            // A `false` is kept too: it is the material saying no to a style that says yes.
            ...(isSnapping((options as TMeshMaterialOptions).vertexSnap)
                ? { vertexSnap: (options as TMeshMaterialOptions).vertexSnap }
                : (options as TMeshMaterialOptions).vertexSnap === false || (options as TMeshMaterialOptions).vertexSnap === 0 ? { vertexSnap: false } : {}),
            ...(typeof (options as TMeshMaterialOptions).affine === 'boolean' ? { affine: (options as TMeshMaterialOptions).affine } : {}),
            ...(typeof (options as TMeshMaterialOptions).perPixel === 'boolean' ? { perPixel: (options as TMeshMaterialOptions).perPixel } : {}),
            ...(normalMapOf((options as TMeshMaterialOptions).normalMap) !== undefined
                ? { normalMap: normalMapOf((options as TMeshMaterialOptions).normalMap)! }
                : {}),
            // The same: left out unless asked. Asked for, even `'back'` is kept, because it is then a
            // decision: the side a scene keeps of a model piece whose file says both.
            ...(isCullMode((options as TMeshMaterialOptions).cull) ? { cull: (options as TMeshMaterialOptions).cull } : {}),
            // The same: left out unless asked, so a material that cuts nothing saves as before.
            ...(cutoffOf((options as TMeshMaterialOptions).alphaCutoff) !== undefined ? { alphaCutoff: (options as TMeshMaterialOptions).alphaCutoff } : {}),
            // Kept as asked so a document can write the recipe rather than the shader it made.
            ...((options as TMeshMaterialOptions).lighting !== undefined ? { lighting: (options as TMeshMaterialOptions).lighting } : {}),
            ...((options as TMeshMaterialOptions).steps !== undefined && (options as TMeshMaterialOptions).steps!.length > 0
                ? { steps: [...(options as TMeshMaterialOptions).steps!] }
                : {}),
        }) as TMeshMaterial
        : createRecord('material', {
            ...half,
            shader: 'sprite2d',
            // Left out when there are none, so a material that never had maps saves as before.
            ...((options as TSpriteMaterialOptions).maps !== undefined ? { maps: mapsOf((options as TSpriteMaterialOptions).maps) } : {}),
        }) as TSpriteMaterial;

    if (effect !== null) {
        rememberOverrides(material, asked);
        effect.bound.push(material);
        // Already here, so there is nothing to wait for. Every other case is handled when it lands.
        if (effect.status === 'ready') {
            applyShader(material, effect);
        }
    }

    return material;
};
