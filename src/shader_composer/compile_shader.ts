import { composerFloat, composerVec4 } from './constructors';
import { collectHelpers, collectUniforms, emitBody } from './emit';
import { WGSL_TARGET } from './targets/wgsl';
import { GLSL_TARGET } from './targets/glsl';
import type { TUniformValues } from '../materials/types/t_uniforms';
import type { TComposerNode } from './types/t_composer_node';
import type { TShaderTarget, TStageCtx } from './types/t_shader_target';
import type { TCompiledShader, TShaderGraph } from './types/t_shader_graph';
import type { TGraphTarget } from './types/t_shader_graph_doc';

/**
 * One language's worth of output, before the two are put together.
 */
type TEmitted = { fragment: string | null; vertex: string | null; uniforms: TUniformValues };

/**
 * A colour result as a `vec4`: a `vec3` gains an alpha of 1, anything else is refused.
 */
const asColor = (n: TComposerNode): TComposerNode => {
    if (n.type === 'vec4<f32>') {
        return n;
    }
    if (n.type === 'vec3<f32>') {
        return composerVec4(n, composerFloat(1));
    }
    throw new Error(`[NacatamalOn] shader composer: "color" must be a vec3 or a vec4, got a ${n.type}.`);
};

/**
 * Writes the graph out in one language.
 */
const emitShader = (graph: TShaderGraph, target: TShaderTarget): TEmitted => {
    const { color, position } = graph;
    // Read as the wider family on purpose: the type already keeps `'post'` out, and this is for
    // whoever calls it from plain JavaScript.
    const shader: string = graph.shader;

    if (shader === 'post') {
        throw new Error('[NacatamalOn] shader composer: a screen-wide effect cannot be composed yet. Use sprite2d or mesh3d.');
    }
    if (shader === 'sprite2d') {
        if (position !== undefined) {
            throw new Error('[NacatamalOn] shader composer: a sprite2d shader has no vertex stage, so it takes no "position".');
        }
        if (color === undefined) {
            throw new Error('[NacatamalOn] shader composer: a sprite2d shader needs a "color".');
        }
    } else if (color === undefined && position === undefined) {
        throw new Error('[NacatamalOn] shader composer: a mesh3d shader needs a "color", a "position" or both.');
    }

    if (position !== undefined && position.type !== 'vec3<f32>') {
        throw new Error(`[NacatamalOn] shader composer: "position" must be a vec3, got a ${position.type}.`);
    }

    const colorStage: TStageCtx = shader === 'sprite2d' ? 'sprite2d.frag' : 'mesh3d.frag';

    const colorBody = color === undefined ? null : emitBody(asColor(color), colorStage, target);
    let fragment = colorBody === null ? null : target.fn(colorStage, colorBody.lines, colorBody.result);
    const positionBody = position === undefined ? null : emitBody(position, 'mesh3d.vert', target);
    let vertex = positionBody === null ? null : target.fn('mesh3d.vert', positionBody.lines, positionBody.result);

    // The helpers go in once. Both hooks end up in one shader, and a function at the top of it can
    // be called from anywhere below, so one written before the colour hook serves the vertex too.
    const roots = [color, position].filter((root): root is TComposerNode => root !== undefined);
    const helperText = collectHelpers(roots, target).join('\n\n');
    if (helperText.length > 0) {
        if (fragment !== null) {
            fragment = `${helperText}\n\n${fragment}`;
        } else if (vertex !== null) {
            vertex = `${helperText}\n\n${vertex}`;
        }
    }

    return { fragment, vertex, uniforms: collectUniforms(roots) };
};

/**
 * Turns a composed graph into the fields a material takes, **in both languages**.
 *
 * The result spreads straight into `createMaterial`, and whichever backend draws it takes the half
 * it speaks. Nothing at the call site names a backend, and that is the point: the values are
 * typed, so the second language is a second walk over the graph rather than a translation, and the
 * two halves cannot drift apart because nobody wrote either.
 *
 * On the way it works out anything used twice only once, reads each leaf the way its stage offers
 * it (and refuses one read where it does not exist), gathers every parameter into `uniforms`, and
 * writes each noise function once.
 *
 * The family comes back in the type, so the result spreads into a material for sprites or for
 * models and the material knows which it is.
 *
 * A sprite shader needs `color` and has no vertex stage. A model shader takes `color`, `position`
 * or both, and a stage left out keeps the engine's own. `color` may be a `vec3` (alpha 1) or a
 * `vec4`; `position` is a `vec3`.
 *
 * @param graph The family, and the results.
 * @returns The fields for `createMaterial`.
 *
 * @example
 * ```ts
 * const Level = () => {
 *     const glow = compileShader({
 *         shader: 'mesh3d',
 *         color: composerMix(composerSurface(), composerVec4(0.3, 0.7, 1, 1), composerFresnel(3)),
 *         position: composerAdd(composerVertexPosition(), composerMul(composerVertexNormal(), composerUniform('swell', 0.1))),
 *     });
 *     const material = createMaterial({ tint: getColor('#e08a3a'), ...glow });
 *
 *     createMesh({ geometry: useIcoSphereGeometry(), material });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const compileShader = <S extends TGraphTarget>(graph: TShaderGraph<S>): TCompiledShader<S> => {
    const wgsl = emitShader(graph, WGSL_TARGET);
    const glsl = emitShader(graph, GLSL_TARGET);
    return {
        shader: graph.shader,
        fragment: wgsl.fragment ?? undefined,
        vertex: wgsl.vertex ?? undefined,
        fragmentGlsl: glsl.fragment ?? undefined,
        vertexGlsl: glsl.vertex ?? undefined,
        uniforms: wgsl.uniforms,
    };
};
