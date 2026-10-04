import type {
    TGraphCommentDoc, TGraphEdgeDoc, TGraphNodeDoc, TGraphTarget, TParamValue, TShaderGraphDoc,
} from './types/t_shader_graph_doc';

// The `.shader` format: a node graph as plain JSON. This file owns only its shape, checking it
// and nothing else. Compiling is `compile_shader_graph.ts` and what each node means is the
// catalogue. Kept apart because an editor reads and writes files all the time and compiles only
// when something changed, and because a broken file should fail with a message about the file,
// not with a compiler error from three layers down.

/**
 * The version of the `.shader` format. It only goes up for a change an older reader could not
 * survive; a new optional field does not move it.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SHADER_GRAPH_FORMAT = 1;

/**
 * A new graph for `target`, with only the output node in it: what a new `.shader` starts as.
 *
 * Nothing is wired, so it compiles to nothing and the material draws with the engine's own shader.
 * A new file is valid from the start rather than broken until finished.
 *
 * @param target The family it is for.
 * @returns The empty graph.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const emptyShaderGraph = (target: TGraphTarget): TShaderGraphDoc => ({
    format: SHADER_GRAPH_FORMAT,
    kind: 'shadergraph',
    target,
    nodes: [{ id: 'out_color', type: 'output.color', pos: [420, 160] }],
    edges: [],
});

const fail = (src: string, message: string): never => {
    throw new Error(`[NacatamalOn] shader graph "${src}": ${message}`);
};

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Checks one entry of `nodes`, naming it by position when it has no id to be named by.
 */
const readNode = (raw: unknown, index: number, src: string): TGraphNodeDoc => {
    if (!isObject(raw)) {
        return fail(src, `nodes[${index}] is not an object.`);
    }
    const { id, type, pos, params } = raw;

    if (typeof id !== 'string' || id.length === 0) {
        return fail(src, `nodes[${index}] has no "id".`);
    }
    if (typeof type !== 'string' || type.length === 0) {
        return fail(src, `node "${id}" has no "type".`);
    }

    // A missing place is fine: the graph still means the same, the node just lands at the origin
    // and the editor lays it out. A broken one is not, because quietly reading it as [0, 0] would
    // pile nodes on top of each other with no hint why.
    let position: [number, number] = [0, 0];
    if (pos !== undefined) {
        if (!Array.isArray(pos) || pos.length !== 2 || pos.some((n) => typeof n !== 'number')) {
            return fail(src, `node "${id}" has a malformed "pos": expected [x, y].`);
        }
        position = [pos[0] as number, pos[1] as number];
    }

    if (params !== undefined && !isObject(params)) {
        return fail(src, `node "${id}" has a malformed "params": expected an object.`);
    }

    return { id, type, pos: position, ...(params === undefined ? {} : { params: params as Record<string, TParamValue> }) };
};

/**
 * Checks one entry of `comments`.
 *
 * More forgiving than a node, because nothing compiled depends on a note: a missing size takes a
 * default. Only something that is not a note at all (not an object, a body that is not text) is
 * refused, since that says the file is not what it claims.
 */
const readComment = (raw: unknown, index: number, src: string): TGraphCommentDoc => {
    if (!isObject(raw)) {
        return fail(src, `comments[${index}] is not an object.`);
    }
    const { id, text, pos, size, color } = raw;

    if (typeof id !== 'string' || id.length === 0) {
        return fail(src, `comments[${index}] has no "id".`);
    }
    if (text !== undefined && typeof text !== 'string') {
        return fail(src, `comment "${id}" has a malformed "text".`);
    }

    const pair = (value: unknown, name: string, fallback: [number, number]): [number, number] => {
        if (value === undefined) {
            return fallback;
        }
        if (!Array.isArray(value) || value.length !== 2 || value.some((n) => typeof n !== 'number')) {
            return fail(src, `comment "${id}" has a malformed "${name}": expected [x, y].`);
        }
        return [value[0] as number, value[1] as number];
    };

    const triple = Array.isArray(color) && color.length === 3 && color.every((n) => typeof n === 'number')
        ? ([color[0], color[1], color[2]] as [number, number, number])
        : undefined;

    return {
        id,
        text: typeof text === 'string' ? text : '',
        pos: pair(pos, 'pos', [0, 0]),
        size: pair(size, 'size', [240, 160]),
        ...(triple === undefined ? {} : { color: triple }),
    };
};

/**
 * Checks one entry of `edges`.
 */
const readEdge = (raw: unknown, index: number, src: string): TGraphEdgeDoc => {
    if (!isObject(raw)) {
        return fail(src, `edges[${index}] is not an object.`);
    }
    const { from, out, to, in: input } = raw;
    for (const [key, value] of [['from', from], ['out', out], ['to', to], ['in', input]] as const) {
        if (typeof value !== 'string' || value.length === 0) {
            return fail(src, `edges[${index}] has no "${key}".`);
        }
    }
    return { from: from as string, out: out as string, to: to as string, in: input as string };
};

/**
 * Reads a `.shader` file and checks its shape.
 *
 * It takes the text of the file or JSON already parsed, because both callers exist: a game loading
 * it has text in hand, and an editor holds a graph it has just changed and wants checked before it
 * writes it. A broken shape (a node with no id, a place that is not two numbers, an unknown family)
 * is refused here, naming the node. What the graph **means** (a kind of node nobody knows, a wire
 * into an input that does not exist, a loop) is `compileShaderGraph`'s, which knows the catalogue.
 *
 * @param source The file's text, or its JSON.
 * @param src Where it came from, for the error messages.
 * @returns The graph.
 *
 * @example
 * ```ts
 * const graph = parseShaderGraph(await (await fetch('/shaders/glow.shader')).text(), '/shaders/glow.shader');
 * ```
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const parseShaderGraph = (source: string | unknown, src = '<inline>'): TShaderGraphDoc => {
    let raw: unknown = source;
    if (typeof source === 'string') {
        try {
            raw = JSON.parse(source);
        } catch (error) {
            return fail(src, `not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    if (!isObject(raw)) {
        return fail(src, 'the file must hold a JSON object.');
    }
    if (raw.kind !== 'shadergraph') {
        return fail(src, `expected "kind": "shadergraph", got ${JSON.stringify(raw.kind)}.`);
    }

    const format = typeof raw.format === 'number' ? raw.format : SHADER_GRAPH_FORMAT;
    if (format > SHADER_GRAPH_FORMAT) {
        return fail(src, `format ${format} is newer than this engine understands (${SHADER_GRAPH_FORMAT}).`);
    }

    if (raw.target !== 'sprite2d' && raw.target !== 'mesh3d') {
        return fail(src, `"target" must be "sprite2d" or "mesh3d", got ${JSON.stringify(raw.target)}.`);
    }

    const nodes = Array.isArray(raw.nodes) ? raw.nodes.map((n, i) => readNode(n, i, src)) : [];
    const edges = Array.isArray(raw.edges) ? raw.edges.map((e, i) => readEdge(e, i, src)) : [];
    const comments = Array.isArray(raw.comments) ? raw.comments.map((c, i) => readComment(c, i, src)) : undefined;

    const seen = new Set<string>();
    for (const n of nodes) {
        if (seen.has(n.id)) {
            fail(src, `two nodes share the id "${n.id}".`);
        }
        seen.add(n.id);
    }

    return {
        format,
        kind: 'shadergraph',
        target: raw.target,
        nodes,
        edges,
        // Left out rather than empty when the file had none, so a graph nobody annotated comes back
        // without a field it never had.
        ...(comments === undefined ? {} : { comments }),
    };
};
