import { MAP_NAME } from '../render/shared/material_maps';
import { newNode } from './new_node';
import { valueType } from './value_type';
import { MATERIAL_RULES } from '../materials/derive_signature';
import type { TComposerNode } from './types/t_composer_node';

/**
 * The texture coordinate (`vec2`). There in every stage; in a model's vertex graph it is the
 * corner's own.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerUv = (): TComposerNode => newNode('input', 'vec2<f32>', [], { input: 'uv' });

/**
 * Seconds since the game started (`f32`), which the engine writes for every material. Anything that
 * moves on its own is driven by this, with no code per frame.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerTime = (): TComposerNode => newNode('input', 'f32', [], { input: 'time' });

/**
 * The game's size in pixels (`vec2`), which the engine writes for every material. For keeping a
 * pattern square, or for effects measured in pixels.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerResolution = (): TComposerNode => newNode('input', 'vec2<f32>', [], { input: 'resolution' });

/**
 * The colour the engine would have drawn here (`vec4`): the picture, already read and already
 * tinted (and on a model, painted by its corners' colour), before any light. Where most colour effects start. Colour stage only.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerSurface = (): TComposerNode => newNode('input', 'vec4<f32>', [], { input: 'surface' });

/**
 * Which way the surface faces, in the world (`vec3`). Models only, colour stage; in a vertex graph
 * use `composerVertexNormal`.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerWorldNormal = (): TComposerNode => newNode('input', 'vec3<f32>', [], { input: 'worldNormal' });

/**
 * Where this point of the surface is, in the world (`vec3`). Models only, colour stage.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerWorldPos = (): TComposerNode => newNode('input', 'vec3<f32>', [], { input: 'worldPos' });

/**
 * The direction from this point towards the camera, one unit long (`vec3`). What a rim or a shine
 * is worked out from. Models only, colour stage.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerViewDir = (): TComposerNode => newNode('input', 'vec3<f32>', [], { input: 'viewDir' });

/**
 * How much light reaches this point, and of what colour (`vec3`).
 *
 * It is handed over **on its own** so a graph can light things its own way, in hard bands or with
 * a rim. The engine's own look is the surface times this, plus `composerEmissive`. The light is
 * worked out at the corners and blended in between, as the consoles of the era did. Models only,
 * colour stage.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerLight = (): TComposerNode => newNode('input', 'vec3<f32>', [], { input: 'light' });

/**
 * The light the material gives off by itself (`vec3`), so a graph can rebuild the engine's own
 * look exactly. Models only, colour stage.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerEmissive = (): TComposerNode => newNode('input', 'vec3<f32>', [], { input: 'emissive' });

/**
 * Where the corner is, in the model's own space (`vec3`): the value a `position` graph moves, to
 * make it wobble, swell or jitter. Models only, vertex stage.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerVertexPosition = (): TComposerNode => newNode('input', 'vec3<f32>', [], { input: 'vertexPosition' });

/**
 * Which way the corner faces, in the model's own space (`vec3`). Moving a corner along it swells
 * the model. Models only, vertex stage.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerVertexNormal = (): TComposerNode => newNode('input', 'vec3<f32>', [], { input: 'vertexNormal' });

/**
 * The colour painted on the model's corners (`vec4`), smeared across each triangle. Models only, in
 * either stage.
 *
 * It is already part of `composerSurface`. On its own it is for using the paint as something other
 * than colour: how much a corner sways in the wind, or how much of a second picture shows through,
 * which is how the era blended grass into a dirt path without a second texture pass.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerVertexColor = (): TComposerNode => newNode('input', 'vec4<f32>', [], { input: 'vertexColor' });

/**
 * The highlight the lamps put on the surface (`vec3`), already shadowed: the shine a material's
 * `specular` and `shininess` ask for. The built-in look adds it on top of the lit colour. Models
 * only, colour stage.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerShine = (): TComposerNode => newNode('input', 'vec3<f32>', [], { input: 'shine' });

/**
 * Where the surface's reflection of the world lands on a round picture of its surroundings (`vec2`):
 * read a map there and the model looks like chrome, the reflection the consoles of the era made with
 * a second texture. Use it as the coordinate of `composerMapSample`. Models only, colour stage.
 * @returns The node, to use as the input of another.
 *
 * @example
 * ```ts
 * const chrome = composerMapSample('env', composerEnvUv());
 * ```
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerEnvUv = (): TComposerNode => newNode('input', 'vec2<f32>', [], { input: 'envUv' });

/**
 * Reads the material's own picture, tinted, at any coordinate (`vec4`). What waves, pixelation, a
 * colour split or a blur are made of: `composerSurface()` is this read at the fragment's own
 * coordinate. Colour stage only.
 * @param coord - Where to read the picture, in `0`-`1`.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerTextureSample = (coord: TComposerNode): TComposerNode => newNode('texture', 'vec4<f32>', [coord]);

/**
 * Reads one of the material's extra maps by name, at any coordinate (`vec4`): a reflection, a mask, a
 * detail, a ripple. The material carries the picture under the same name in its `maps`; one it does
 * not carry reads white. Colour stage of a model only.
 * @param name - The map's name, as the material's `maps` gives it: lowercase first, letters and digits.
 * @param coord - Where to read it, in `0`-`1`.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerMapSample = (name: string, coord: TComposerNode): TComposerNode => {
    if (!MAP_NAME.test(name)) {
        throw new Error(`[NacatamalOn] shader composer: '${name}' cannot name a map. It has to be a letter-first lowercase name of letters and digits, such as 'noise'.`);
    }
    return newNode('texture', 'vec4<f32>', [coord], { params: [name] });
};

/**
 * A parameter with a name, which the game can change while it runs.
 *
 * What `value` looks like sets its type (a number, or a list of two, three or four) and is what it
 * starts at. `compileShader` gathers every parameter of the graph into the material's `uniforms`,
 * so writing `material.uniforms.<name>` moves it on the next frame. `time` and `resolution` are
 * taken: the engine writes those, and they are read with `composerTime` and `composerResolution`.
 * @param name - What the game calls it: `material.uniforms.<name>`.
 * @param value - What it starts at. A number, or a list of two, three or four.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerUniform = (name: string, value: number | number[]): TComposerNode => {
    if (MATERIAL_RULES.reserved.has(name)) {
        throw new Error(
            `[NacatamalOn] shader composer: the parameter name "${name}" is taken by the engine. ` +
            'Read it with composerTime() or composerResolution() and call your own something else.',
        );
    }
    return newNode('uniform', valueType(value), [], { uniform: { name, value } });
};

/**
 * Where on the screen the surface is, in the game's pixels (`vec2`): `(0, 0)` at the top left, the
 * game's width and height at the bottom right, whatever the size of the window. A dot screen, a
 * hatch or a dither laid over a model lines up with the screen through this rather than sliding
 * with the model. Models only, colour stage.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerScreenPos = (): TComposerNode => newNode('input', 'vec2<f32>', [], { input: 'screenPos' });

/**
 * A second picture coordinate (`vec2`): the file's own, or the first again when it had none. For a
 * second picture laid over the first by coordinates of its own: baked light, a decal, a detail.
 * Models only, in either stage.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerUv2 = (): TComposerNode => newNode('input', 'vec2<f32>', [], { input: 'uv2' });

/**
 * Which side of the triangle is being drawn (`f32`): `1` the side facing the camera, `0` the other.
 * Only ever `0` on a material that keeps the other side (`cull: 'front'` or `'none'`): mixed by it, a
 * liquid seen from below takes another colour, or a leaf is lighter underneath. Models only, colour
 * stage.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerFrontFacing = (): TComposerNode => newNode('input', 'f32', [], { input: 'frontFacing' });

/**
 * What the vertex stage carried to this pixel (`vec4`): the graph's `carry`, worked out at each
 * corner and smeared across the triangle. How high a wave lifted the water here, for foam on its
 * crests; a light of the graph's own worked out at the corners, the look of the era; where the point
 * was in the model's own space, for bands or a fill line that stay on the model as it moves. A `carry`
 * smaller than four numbers is filled out with zeros, and none at all reads as zeros. Models only,
 * colour stage.
 * @returns The node, to use as the input of another.
 *
 * @example
 * ```ts
 * const lift = composerMul(composerSin(composerAdd(composerX(composerVertexPosition()), composerTime())), 0.2);
 * const sea = compileShader({
 *     shader: 'mesh3d',
 *     position: composerAdd(composerVertexPosition(), composerMul(composerVertexNormal(), lift)),
 *     carry: lift,
 *     color: composerMix(composerSurface(), composerVec4(1, 1, 1, 1), composerSmoothstep(0.12, 0.2, composerX(composerCarry()))),
 * });
 * ```
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerCarry = (): TComposerNode => newNode('input', 'vec4<f32>', [], { input: 'carry' });

/**
 * Which way across the surface the picture runs, in the world (`vec3`, one long, square to the
 * normal). With the bitangent and the normal it is the frame a relief or a ripple moves the picture
 * in. Models only, colour stage.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerWorldTangent = (): TComposerNode => newNode('input', 'vec3<f32>', [], { input: 'worldTangent' });

/**
 * Which way down the surface the picture runs, in the world (`vec3`): the normal crossed with the
 * tangent, turned over where the picture is mirrored. Models only, colour stage.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerWorldBitangent = (): TComposerNode => newNode('input', 'vec3<f32>', [], { input: 'worldBitangent' });

/**
 * Which way across the surface the picture runs, in the model's own space (`vec3`). Models only,
 * vertex stage.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerVertexTangent = (): TComposerNode => newNode('input', 'vec3<f32>', [], { input: 'vertexTangent' });

/**
 * Which way down the surface the picture runs, in the model's own space (`vec3`). Models only,
 * vertex stage.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerVertexBitangent = (): TComposerNode => newNode('input', 'vec3<f32>', [], { input: 'vertexBitangent' });
