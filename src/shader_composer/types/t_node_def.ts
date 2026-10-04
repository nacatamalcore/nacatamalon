import type { TUniformType } from '../../materials/types/t_uniforms';
import type { TComposerNode } from './t_composer_node';
import type { TGraphTarget, TParamValue } from './t_shader_graph_doc';

/**
 * What an input gives when nothing is wired into it. A number or a list becomes a constant; a
 * function builds a value, which is how an input can fall back to something the shader reads
 * rather than to a constant (an unwired texture coordinate is the fragment's own, not zero). An
 * input with no default needs a wire.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPortDefault = number | number[] | (() => TComposerNode);

/**
 * One input of a node.
 *
 * `type` is a hint for the editor, for the colour of the socket and a first check while a wire is
 * being dragged. `null` marks an input that takes any size, like the operands of an add, whose real
 * type is whatever gets plugged in. The final word always comes from building the graph.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TInputPort = {
    name: string;
    label: string;
    type: TUniformType | null;
    default?: TPortDefault;
};

/**
 * One output of a node. Almost every node has exactly one, `value`; `split` is the exception that
 * makes naming them worth it.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TOutputPort = { name: string; label: string };

/**
 * How a literal is edited. `value` is the one that changes shape: how many numbers it holds
 * follows a sibling `select` (see the parameter node), which is what lets one node cover `f32` to
 * `vec4` instead of four nearly identical ones.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParamKind = 'number' | 'int' | 'text' | 'color' | 'select' | 'value';

/**
 * A literal a node keeps in its body: edited in the inspector, saved in the file, read when the
 * node is built.
 *
 * It is not an input because it cannot be wired: either it has to be known when the shader is
 * compiled (a swizzle mask, a number of octaves), or a wire would be a worse way to say it (a
 * colour).
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParamDef = {
    name: string;
    label: string;
    kind: TParamKind;
    default: TParamValue;
    options?: readonly string[];
    min?: number;
    max?: number;
    step?: number;
};

/**
 * The section of the palette a node belongs to. The editor orders them as `NODE_CATEGORIES` does,
 * by what you reach for and when, not alphabetically.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TNodeCategory = 'input' | 'constant' | 'math' | 'vector' | 'procedural' | 'effect' | 'output';

/**
 * Everything the engine and the editor know about one kind of node.
 *
 * `build` is handed its inputs already resolved (the wire, or the default) and its literals already
 * filled in, so it never deals with something missing: it calls the same composer functions a
 * graph written in code would. Returning a single value is short for `{ value: node }`.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TNodeDef = {
    type: string;
    label: string;
    category: TNodeCategory;
    /**
     * One line, for the palette's tooltip and the inspector's header.
     */
    summary: string;
    inputs: TInputPort[];
    outputs: TOutputPort[];
    params: TParamDef[];
    /**
     * What it returns when that never depends on its inputs, so the editor can colour an unwired socket.
     */
    outputType?: TUniformType;
    /**
     * The families it is offered in. Left out, both. The compiler still checks each stage.
     */
    targets?: readonly TGraphTarget[];
    /**
     * Set on the graph's endpoints, which the compiler reads itself and never builds.
     */
    role?: 'output';
    build: (
        inputs: Record<string, TComposerNode>,
        params: Record<string, TParamValue>,
    ) => TComposerNode | Record<string, TComposerNode>;
};
