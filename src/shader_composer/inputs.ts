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
