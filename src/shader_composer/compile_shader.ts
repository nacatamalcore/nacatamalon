import { composerFloat, composerVec4 } from './constructors';
import { composerVertexPosition } from './inputs';
import { collectHelpers, collectUniforms, emitBodies, emitBody } from './emit';
import { WGSL_TARGET } from './targets/wgsl';
import { GLSL_TARGET } from './targets/glsl';
import { composeSurface } from './surface/compose_surface';
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
 * What a graph carries, as the `vec4` the shader keeps it in: a smaller one is filled out with zeros,
 * anything else is refused.
 */
const asCarry = (n: TComposerNode): TComposerNode => {
    switch (n.type) {
        case 'vec4<f32>': return n;
        case 'vec3<f32>': return composerVec4(n, 0);
        case 'vec2<f32>': return composerVec4(n, 0, 0);
        case 'f32': return composerVec4(n, 0, 0, 0);
        default: throw new Error(`[NacatamalOn] shader composer: "carry" is up to four numbers (a number, a vec2, a vec3 or a vec4), got a ${n.type}.`);
    }
};

/**
 * Writes the graph out in one language.
 */
const emitShader = (graph: TShaderGraph, target: TShaderTarget): TEmitted => {
    const { color, carry } = graph;
    // Read as the wider family on purpose: the type already keeps `'post'` out, and this is for
    // whoever calls it from plain JavaScript.
    const shader: string = graph.shader;

    if (shader === 'post') {
        throw new Error('[NacatamalOn] shader composer: a screen-wide effect cannot be composed yet. Use sprite2d or mesh3d.');
    }
    if (shader === 'sprite2d') {
        if (graph.position !== undefined) {
            throw new Error('[NacatamalOn] shader composer: a sprite2d shader has no vertex stage, so it takes no "position".');
        }
        if (carry !== undefined) {
            throw new Error('[NacatamalOn] shader composer: a sprite2d shader has no vertex stage, so it carries nothing: it takes no "carry".');
        }
        if (color === undefined) {
            throw new Error('[NacatamalOn] shader composer: a sprite2d shader needs a "color".');
        }
    } else if (color === undefined && graph.position === undefined) {
        throw new Error('[NacatamalOn] shader composer: a mesh3d shader needs a "color", a "position" or both.');
    }

    // Carried with no corner moved, the corner stays where it is: the hook is there to carry.
    const position = graph.position ?? (carry === undefined ? undefined : composerVertexPosition());
    if (position !== undefined && position.type !== 'vec3<f32>') {
        throw new Error(`[NacatamalOn] shader composer: "position" must be a vec3, got a ${position.type}.`);
    }

    const colorStage: TStageCtx = shader === 'sprite2d' ? 'sprite2d.frag' : 'mesh3d.frag';

    const colorBody = color === undefined ? null : emitBody(asColor(color), colorStage, target);
    let fragment = colorBody === null ? null : target.fn(colorStage, colorBody.lines, colorBody.result);
    // The corner and what it carries, written together so a wave they both come from is worked out
    // once; what it carries is put in the shader's carry before the corner is handed back.
    const carried = carry === undefined ? undefined : asCarry(carry);
    const vertexRoots = [position, carried].filter((root): root is TComposerNode => root !== undefined);
    const vertexBody = position === undefined ? null : emitBodies(vertexRoots, 'mesh3d.vert', target);
    let vertex = vertexBody === null
        ? null
        : target.fn(
            'mesh3d.vert',
            carried === undefined ? vertexBody.lines : [...vertexBody.lines, `    carry = ${vertexBody.results[1]};`],
            vertexBody.results[0],
        );

    const roots = [color, position, carried].filter((root): root is TComposerNode => root !== undefined);

    // In GLSL the two hooks are two programs, compiled apart, and the vertex cannot see a function
    // written in the fragment: each hook takes the helpers its own half of the graph calls.
    if (target.language === 'glsl') {
        const prepend = (root: TComposerNode | undefined, hook: string | null): string | null => {
            const text = root === undefined || hook === null ? '' : collectHelpers([root], target).join('\n\n');
            return text.length > 0 ? `${text}\n\n${hook}` : hook;
        };
        const vertexHelpers = (hook: string | null): string | null => {
            const text = hook === null ? '' : collectHelpers(vertexRoots, target).join('\n\n');
            return text.length > 0 ? `${text}\n\n${hook}` : hook;
        };
        return { fragment: prepend(color, fragment), vertex: vertexHelpers(vertex), uniforms: collectUniforms(roots) };
    }

    // The helpers go in once. Both hooks end up in one shader, where a function anywhere can be called
    // from anywhere, so they go with the corner hook when there is one: the shadow of a model is drawn
    // with that hook alone, and a helper left with the colour would not be there to call.
    const helperText = collectHelpers(roots, target).join('\n\n');
    if (helperText.length > 0) {
        if (vertex !== null) {
            vertex = `${helperText}\n\n${vertex}`;
        } else if (fragment !== null) {
            fragment = `${helperText}\n\n${fragment}`;
        }
    }

    return { fragment, vertex, uniforms: collectUniforms(roots) };
};

/**
 * A graph whose colour is made by looks, turned into one with that colour written out: the looks are
 * a recipe, and this is where it is followed. A graph with neither is handed back as it is.
 */
const withLooks = <S extends TGraphTarget>(graph: TShaderGraph<S>): TShaderGraph<S> => {
    const looked = graph.lighting !== undefined || (graph.steps !== undefined && graph.steps.length > 0);
    if (!looked) {
        return graph;
    }
    // Read as the wider family, for whoever calls it from plain JavaScript.
    const shader: string = graph.shader;
    if (shader !== 'mesh3d') {
        throw new Error('[NacatamalOn] shader composer: lighting and steps are for a model\'s surface, so they need shader: \'mesh3d\'.');
    }
    if (graph.color !== undefined) {
        throw new Error('[NacatamalOn] shader composer: lighting and steps make the colour, so a graph with them takes no "color" of its own.');
    }
    return { ...graph, color: composeSurface(graph.lighting, graph.steps) };
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
export const compileShader = <S extends TGraphTarget>(asked: TShaderGraph<S>): TCompiledShader<S> => {
    const graph = withLooks(asked);
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
