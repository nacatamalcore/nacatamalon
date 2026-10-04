import { composerFloat, composerVec2, composerVec3, composerVec4 } from './constructors';
import { defaultParams, INPUT_BUILDERS, nodeDef } from './catalog';
import type { TComposerNode } from './types/t_composer_node';
import type { TGraphNodeDoc, TParamValue, TShaderGraphDoc } from './types/t_shader_graph_doc';
import type { TInputPort, TNodeDef, TPortDefault } from './types/t_node_def';

/**
 * How a node is named in an error: its id, and its label when the catalogue knows it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const describeNode = (node: TGraphNodeDoc, def?: TNodeDef): string =>
    `node "${node.id}"${def === undefined ? '' : ` (${def.label})`}`;

/**
 * Throws again an error from inside a node, this time naming the node. The composer functions'
 * messages are good but say nothing about where: "cannot add a vec2 with a vec3" is only useful
 * once you know which node did it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const rethrowAt = (error: unknown, where: string, src: string): never => {
    const message = error instanceof Error
        ? error.message.replace(/^\[NacatamalOn\]\s*(shader composer:\s*|shader graph:\s*)?/, '')
        : String(error);
    throw new Error(`[NacatamalOn] shader graph "${src}": ${where}: ${message}`);
};

/**
 * An unwired input's default, as a value.
 */
const defaultNode = (fallback: TPortDefault): TComposerNode => {
    if (typeof fallback === 'function') {
        return fallback();
    }
    if (typeof fallback === 'number') {
        return composerFloat(fallback);
    }
    if (fallback.length === 2) {
        return composerVec2(...fallback);
    }
    if (fallback.length === 3) {
        return composerVec3(...fallback);
    }
    return composerVec4(...fallback);
};

/**
 * What walking a graph offers: every output of a node, and the value feeding one of its inputs.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TResolver = {
    resolve: (id: string) => Record<string, TComposerNode>;
    readPort: (node: TGraphNodeDoc, def: TNodeDef, port: TInputPort) => TComposerNode | null;
};

/**
 * The walk over a `.shader` file, shared by compiling it and by typing it for an editor.
 *
 * A node is built the first time something asks for it and kept, and a loop is caught on the way
 * down. Problems come out as errors: the compiler lets them through and the type check catches
 * them node by node. That is why the "being built" mark is taken off in a `finally`: a node that
 * threw must not stay marked, or every node after it would be reported as a loop.
 *
 * The file as a whole is checked when this is made: a wire from or to a node that is not there,
 * or two wires into one input, throw straight away.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createResolver = (doc: TShaderGraphDoc, src: string): TResolver => {
    const byId = new Map<string, TGraphNodeDoc>(doc.nodes.map((n) => [n.id, n]));

    // One wire per input. A second one is a mistake the editor should prevent, and quietly keeping
    // either would make the shader depend on the order of an array.
    const incoming = new Map<string, Map<string, { from: string; out: string }>>();
    for (const edge of doc.edges) {
        if (!byId.has(edge.from)) {
            throw new Error(`[NacatamalOn] shader graph "${src}": a wire comes from unknown node "${edge.from}".`);
        }
        if (!byId.has(edge.to)) {
            throw new Error(`[NacatamalOn] shader graph "${src}": a wire goes to unknown node "${edge.to}".`);
        }

        const ports = incoming.get(edge.to) ?? new Map<string, { from: string; out: string }>();
        if (ports.has(edge.in)) {
            throw new Error(
                `[NacatamalOn] shader graph "${src}": input "${edge.in}" of node "${edge.to}" has two wires; an input takes one.`,
            );
        }
        ports.set(edge.in, { from: edge.from, out: edge.out });
        incoming.set(edge.to, ports);
    }

    // The catalogue's own message names the type but not the file, and a file that fails to load
    // has to say which file it is.
    const defOf = (node: TGraphNodeDoc): TNodeDef => {
        try {
            return nodeDef(node.type);
        } catch (error) {
            return rethrowAt(error, describeNode(node), src);
        }
    };

    const resolved = new Map<string, Record<string, TComposerNode>>();
    const visiting = new Set<string>();

    const readPort = (docNode: TGraphNodeDoc, def: TNodeDef, port: TInputPort): TComposerNode | null => {
        const edge = incoming.get(docNode.id)?.get(port.name);
        if (edge === undefined) {
            if (port.default !== undefined) {
                return defaultNode(port.default);
            }
            // An endpoint may be left empty: that stage keeps the engine's own. Any other node
            // needs something to work with.
            if (def.role === 'output') {
                return null;
            }
            throw new Error(
                `[NacatamalOn] shader graph "${src}": ${describeNode(docNode, def)} needs something wired into its "${port.label}" input.`,
            );
        }

        const source = byId.get(edge.from)!;
        const sourceDef = defOf(source);
        if (!sourceDef.outputs.some((o) => o.name === edge.out)) {
            throw new Error(`[NacatamalOn] shader graph "${src}": ${describeNode(source, sourceDef)} has no output "${edge.out}".`);
        }

        const value = resolve(edge.from)[edge.out];
        if (value === undefined) {
            // Declared but not made: only `split` does this, when what is plugged into it is
            // smaller than the output asked for.
            throw new Error(
                `[NacatamalOn] shader graph "${src}": ${describeNode(source, sourceDef)} does not make "${edge.out}" ` +
                'for the value wired into it.',
            );
        }
        return value;
    };

    const resolve = (id: string): Record<string, TComposerNode> => {
        const done = resolved.get(id);
        if (done !== undefined) {
            return done;
        }
        if (visiting.has(id)) {
            throw new Error(`[NacatamalOn] shader graph "${src}": the graph loops back on itself at node "${id}".`);
        }

        const docNode = byId.get(id);
        if (docNode === undefined) {
            throw new Error(`[NacatamalOn] shader graph "${src}": unknown node "${id}".`);
        }
        const def = defOf(docNode);
        visiting.add(id);

        try {
            const inputs: Record<string, TComposerNode> = {};
            for (const port of def.inputs) {
                const value = readPort(docNode, def, port);
                if (value !== null) {
                    inputs[port.name] = value;
                }
            }

            const params: Record<string, TParamValue> = { ...defaultParams(docNode.type), ...(docNode.params ?? {}) };

            let outputs: Record<string, TComposerNode>;
            const leaf = INPUT_BUILDERS[docNode.type];
            try {
                const built = leaf === undefined ? def.build(inputs, params) : leaf();
                outputs = typeof (built as TComposerNode).kind === 'string'
                    ? { value: built as TComposerNode }
                    : (built as Record<string, TComposerNode>);
            } catch (error) {
                return rethrowAt(error, describeNode(docNode, def), src);
            }

            resolved.set(id, outputs);
            return outputs;
        } finally {
            visiting.delete(id);
        }
    };

    return { resolve, readPort };
};
