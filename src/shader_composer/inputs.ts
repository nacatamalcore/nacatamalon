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
