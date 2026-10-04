import type { TUniformType } from '../../materials/types/t_uniforms';
import type { TInputKind } from './t_composer_node';

/**
 * The place a graph output is written into: which built-in shader family, and which of its stages.
 * It picks the function a body is wrapped in, what each leaf reads, and which leaves exist at all.
 *
 * `preview.frag` is the odd one: the small picture an editor draws next to a node, on a flat
 * square, where every leaf has an answer.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TStageCtx = 'sprite2d.frag' | 'mesh3d.frag' | 'mesh3d.vert' | 'preview.frag';

/**
 * Everything about a shader language the compiler needs, and nothing about the graph.
 *
 * The line this type draws is the point of it. A graph is a set of typed values, and that does not
 * depend on any language: walking it, sharing repeated parts and checking what is legal where is
 * written once. What does depend on the language turns out to be a short list: how a type is
 * spelled, how a local is declared, how a function is wrapped, and what each leaf reads.
 *
 * Two of these exist, one per backend. Neither knows about the other, and a third would mean
 * filling in this table rather than touching the compiler.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TShaderTarget = {
    /**
     * Which language this writes. Picks a helper's source and names the language in errors.
     */
    readonly language: 'wgsl' | 'glsl';
    /**
     * How a type is written. WGSL keeps the engine's own spelling (`vec3<f32>`), GLSL drops the generic (`vec3`).
     */
    type(t: TUniformType): string;
    /**
     * One shared local, indented and ended. WGSL works the type out, GLSL has to be told it.
     */
    declare(type: TUniformType, name: string, expr: string): string;
    /**
     * Wraps a body in its function. It takes the stage rather than a signature, because the
     * signature is exactly what differs: WGSL writes the return type after an arrow, GLSL before
     * the name.
     */
    fn(stage: TStageCtx, lines: string[], result: string): string;
    /**
     * What a leaf reads, or `undefined` where that leaf does not exist.
     */
    input(kind: TInputKind, stage: TStageCtx): string | undefined;
    /**
     * The functions a node's small picture shades its pretend sphere with.
     */
    readonly previewPrelude: string;
};
