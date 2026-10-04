import { compileShader } from './compile_shader';
import { compilePreviewShader } from './compile_preview_shader';
import { nodeDef } from './catalog';
import { createResolver, rethrowAt } from './create_resolver';
import { deriveSignature } from '../materials/derive_signature';
import type { TUniformType } from '../materials/types/t_uniforms';
import type { TComposerNode } from './types/t_composer_node';
import type { TShaderGraphDoc } from './types/t_shader_graph_doc';
import type { TNodeDef } from './types/t_node_def';
import type { TGraphTypeInfo, TNodePreview } from './types/t_graph_type_info';
import type { TParsedShader } from '../loaders/shader/types/t_parsed_shader';

/**
 * Compiles a `.shader` file into what a material needs: its hooks in both languages, its
 * parameters and their types. The same shape reading a `.wgsl` gives, so nothing that uses a
 * shader file can tell the two apart.
 *
 * It writes no shader code of its own. It turns the file into the same values the composer
 * functions build and hands them to `compileShader`, so a graph drawn on a canvas and the same
 * graph written in code cannot drift, and every check the composer functions make applies to a
 * wired graph too.
 *
 * Only what reaches an output is built: a node nothing is wired to adds nothing, so a canvas with a
 * few loose nodes on it still compiles. A loop is caught and named. An output left unwired keeps
 * the engine's own for that stage, so a new file is valid and its material draws with the engine's
 * shader until something is connected.
 *
 * @param doc The graph, from `parseShaderGraph`.
 * @param src Where it came from, for the error messages.
 * @returns The hooks and parameters.
 *
 * @example
 * ```ts
 * const src = '/shaders/glow.shader';
 * const parsed = compileShaderGraph(parseShaderGraph(await (await fetch(src)).text(), src), src);
 * ```
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const compileShaderGraph = (doc: TShaderGraphDoc, src = '<inline>'): TParsedShader => {
    const { readPort } = createResolver(doc, src);

    /**
     * What is wired into the one endpoint of `type`, or `undefined` if there is none.
     */
    const rootOf = (type: string): TComposerNode | undefined => {
        const endpoints = doc.nodes.filter((n) => n.type === type);
        if (endpoints.length > 1) {
            throw new Error(
                `[NacatamalOn] shader graph "${src}": the graph has ${endpoints.length} "${nodeDef(type).label}" nodes; it can have one.`,
            );
        }
        if (endpoints.length === 0) {
            return undefined;
        }
        const def = nodeDef(type);
        return readPort(endpoints[0], def, def.inputs[0]) ?? undefined;
    };

    const color = rootOf('output.color');
    const position = doc.target === 'mesh3d' ? rootOf('output.position') : undefined;

    // Nothing wired is how every new file starts. It is not an error: it is a material with no
    // hooks of its own, which draws with the engine's shader like a `.wgsl` nobody assigned yet.
    if (color === undefined && position === undefined) {
        return { shader: doc.target, fragment: null, vertex: null, fragmentGlsl: null, vertexGlsl: null, uniforms: {}, uniformSig: {} };
    }

    try {
        const compiled = compileShader({ shader: doc.target, color, position });
        return {
            shader: compiled.shader,
            fragment: compiled.fragment ?? null,
            vertex: compiled.vertex ?? null,
            fragmentGlsl: compiled.fragmentGlsl ?? null,
            vertexGlsl: compiled.vertexGlsl ?? null,
            uniforms: compiled.uniforms,
            uniformSig: deriveSignature(compiled.uniforms),
        };
    } catch (error) {
        return rethrowAt(error, 'compiling the graph', src);
    }
};

/**
 * An error without the engine's prefix, for an editor to show next to a node.
 */
const message = (error: unknown): string =>
    (error instanceof Error ? error.message : String(error))
        .replace(/^\[NacatamalOn\]\s*/, '')
        .replace(/^shader graph "[^"]*":\s*/, '');

/**
 * Works out the type of every output in a graph without compiling it, gathering problems instead
 * of throwing.
 *
 * An editor asks this on every change: to colour a socket by what it carries, to grey out a node
 * that does not work, and, by asking whether a wire still type-checks, to refuse one while it is
 * being dragged. It runs the compiler's own walk rather than a second type system, so what the
 * editor shows and what the compiler says are the same answer.
 *
 * Unlike `compileShaderGraph` it visits every node, not only those an output reaches, because a
 * node loose on the canvas still needs its sockets coloured.
 *
 * @param doc The graph.
 * @param src Where it came from, for the messages.
 * @returns The types, the problems per node, and any problem with the file as a whole.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const inferGraphTypes = (doc: TShaderGraphDoc, src = '<inline>'): TGraphTypeInfo => {
    const outputs: Record<string, Record<string, TUniformType>> = {};
    const errors: Record<string, string> = {};

    let resolver: ReturnType<typeof createResolver>;
    try {
        resolver = createResolver(doc, src);
    } catch (error) {
        return { outputs, errors, fatal: message(error) };
    }

    for (const node of doc.nodes) {
        let def: TNodeDef;
        try {
            def = nodeDef(node.type);
        } catch (error) {
            errors[node.id] = message(error);
            continue;
        }

        try {
            if (def.role === 'output') {
                // An endpoint makes no value, it is where one goes. What matters is whether what is
                // wired into it works, which is the error the compiler would give here too.
                outputs[node.id] = {};
                for (const port of def.inputs) {
                    resolver.readPort(node, def, port);
                }
            } else {
                const built = resolver.resolve(node.id);
                outputs[node.id] = Object.fromEntries(Object.entries(built).map(([port, n]) => [port, n.type]));
            }
        } catch (error) {
            errors[node.id] = message(error);
        }
    }
    return { outputs, errors, fatal: null };
};

/**
 * A small picture for every node of a graph that makes a value: what lets a canvas show what each
 * node **evaluates to**, not only what it is called.
 *
 * All at once rather than one by one, so they share the single walk they all need. By node id and
 * then by output, so a node with several outputs (`split`) shows each one. A node that does not
 * work, and the endpoints, which make no value of their own, are simply missing.
 *
 * For an editor's thumbnails, not for a game, and with no promise between versions.
 *
 * @param doc The graph.
 * @param src Where it came from.
 * @returns The pictures, by node and output.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const compileNodePreviews = (
    doc: TShaderGraphDoc,
    src = '<inline>',
): Record<string, Record<string, TNodePreview>> => {
    const previews: Record<string, Record<string, TNodePreview>> = {};

    let resolver: ReturnType<typeof createResolver>;
    try {
        resolver = createResolver(doc, src);
    } catch {
        // A problem with the whole file (a wire to a node that is not there) leaves no graph to
        // picture; the canvas shows that on its own.
        return previews;
    }

    for (const node of doc.nodes) {
        try {
            if (nodeDef(node.type).role === 'output') {
                continue;
            }
            const built = resolver.resolve(node.id);
            const ports: Record<string, TNodePreview> = {};
            for (const [port, value] of Object.entries(built)) {
                const compiled = compilePreviewShader(value);
                ports[port] = {
                    fragment: compiled.fragment,
                    uniforms: compiled.uniforms,
                    uniformSig: deriveSignature(compiled.uniforms),
                };
            }
            previews[node.id] = ports;
        } catch {
            // A node that does not work has no value to show, and already carries its error.
        }
    }
    return previews;
};
