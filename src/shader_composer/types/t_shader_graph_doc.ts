import type { TMaterialShader } from '../../materials/types/t_uniforms';

/**
 * A literal a node keeps in its own body instead of receiving through a wire: a swizzle mask, a
 * number of octaves, a colour. Only what JSON keeps intact and an inspector can show a control for.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParamValue = number | number[] | string;

/**
 * One node in a saved graph: which kind of node it is, where it sits on the canvas, and its
 * literals.
 *
 * **It does not describe itself.** Its inputs, outputs and code all come from the catalogue, looked
 * up by `type`, so a file stays small and a node learns something new when the catalogue changes
 * rather than when every file is rewritten.
 *
 * `pos` belongs to the editor and is in the file on purpose, like a box's place in a scene: how a
 * graph is laid out is part of what it says to whoever reads it.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGraphNodeDoc = {
    id: string;
    /**
     * Which entry of the catalogue this is.
     */
    type: string;
    /**
     * Where it sits on the canvas, `[x, y]`.
     */
    pos: [number, number];
    /**
     * Its literals. One left out takes the catalogue's value.
     */
    params?: Record<string, TParamValue>;
};

/**
 * A wire: output `out` of node `from` feeds input `in` of node `to`.
 *
 * By name rather than by position, so adding an input to a kind of node cannot quietly rewire
 * every file that uses it.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGraphEdgeDoc = {
    from: string;
    out: string;
    to: string;
    in: string;
};

/**
 * The families a graph file can be for: the two that draw things, deliberately not every family a
 * material has.
 *
 * `'post'` is missing because no node writes a screen-wide effect, so a graph claiming it would
 * compile to nothing. Spelling it as its own type makes that gap a compile error in the one place
 * that could open it, and the reader refuses the same value, so the two cannot disagree.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGraphTarget = Exclude<TMaterialShader, 'post'>;

/**
 * A note on the canvas: a titled rectangle behind the nodes, for grouping part of a graph and
 * saying what it is for.
 *
 * It has an array of its own rather than being a kind of node, because it is not one: no wires, no
 * value, no place in the graph. As a node, the compiler, the type check and the previews would each
 * need an exception for the one entry that is not part of the shader.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGraphCommentDoc = {
    id: string;
    /**
     * The note. May be empty while it is being written.
     */
    text: string;
    /**
     * Top-left corner, in the same space as a node's `pos`.
     */
    pos: [number, number];
    /**
     * Width and height: a note is resized, a node is not.
     */
    size: [number, number];
    /**
     * An accent, `[r, g, b]` from 0 to 1. Left out, the editor picks.
     */
    color?: [number, number, number];
};

/**
 * A `.shader` file: a shader drawn as nodes on a canvas.
 *
 * It sits next to a hand-written `.wgsl` and next to a graph composed in code, and all three end
 * up as the same thing, so a material cannot tell which one it was given. The file holds no shader
 * source in any language, only nodes and wires as plain JSON.
 *
 * `target` means what `@shader` means at the top of a `.wgsl`: it picks the hooks, so it is not a
 * preference but part of what gets compiled.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TShaderGraphDoc = {
    format: number;
    kind: 'shadergraph';
    target: TGraphTarget;
    nodes: TGraphNodeDoc[];
    edges: TGraphEdgeDoc[];
    /**
     * The notes on the canvas. A graph written by hand or by a tool has none, and then the field is
     * not there at all: it is a graph nobody annotated, not a missing field.
     */
    comments?: TGraphCommentDoc[];
};
