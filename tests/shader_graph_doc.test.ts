import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { emptyShaderGraph, parseShaderGraph, SHADER_GRAPH_FORMAT } from '../src/shader_composer/document';
import { compileNodePreviews, compileShaderGraph, inferGraphTypes } from '../src/shader_composer/compile_shader_graph';
import { defaultParams, NODE_CATALOG, NODE_DEFS, nodeDef } from '../src/shader_composer/catalog';
import { compileShader } from '../src/shader_composer/compile_shader';
import { compilePreviewShader } from '../src/shader_composer/compile_preview_shader';
import { composerTextureSample, composerTime, composerUv } from '../src/shader_composer/inputs';
import { composerAdd, composerMix, composerMul, composerSin } from '../src/shader_composer/math';
import { composerSwizzle, composerVec4 } from '../src/shader_composer/constructors';
import { createMaterial } from '../src/gameobjects/material/create_material';
import { loadShader } from '../src/loaders/shader/load_shader';
import { newShader } from '../src/loaders/shader/new_shader';
import { createScene } from '../src/scene';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TGraphEdgeDoc, TGraphNodeDoc, TShaderGraphDoc } from '../src/shader_composer/types/t_shader_graph_doc';

/**
 * The `.shader` file: a shader drawn as nodes, saved as JSON.
 *
 * Its whole promise is that a graph wired on a canvas and the same graph written with the composer
 * functions are **the same shader**. So most of these build it both ways and compare what comes
 * out: while that holds, the file inherits every check the code already makes, and the two cannot
 * drift.
 */

const graph = (
    target: 'sprite2d' | 'mesh3d',
    nodes: (Omit<TGraphNodeDoc, 'pos'> & { pos?: [number, number] })[],
    edges: TGraphEdgeDoc[],
): TShaderGraphDoc => ({
    format: SHADER_GRAPH_FORMAT,
    kind: 'shadergraph',
    target,
    nodes: nodes.map((n) => ({ pos: [0, 0] as [number, number], ...n })),
    edges,
});

const edge = (from: string, to: string, input: string, out = 'value'): TGraphEdgeDoc =>
    ({ from, out, to, in: input });

describe('parseShaderGraph', () => {
    it('reads a well-formed document', () => {
        const doc = parseShaderGraph(JSON.stringify(graph('mesh3d', [{ id: 'a', type: 'uv' }], [])));
        expect(doc.target).toBe('mesh3d');
        expect(doc.nodes).toHaveLength(1);
        expect(doc.nodes[0]).toEqual({ id: 'a', type: 'uv', pos: [0, 0] });
    });

    it('accepts already-parsed JSON as well as text', () => {
        const object = graph('sprite2d', [{ id: 'a', type: 'time' }], []);
        expect(parseShaderGraph(object)).toEqual(parseShaderGraph(JSON.stringify(object)));
    });

    it('a document with no nodes or edges arrays is empty, not broken', () => {
        const doc = parseShaderGraph('{"format":1,"kind":"shadergraph","target":"mesh3d"}');
        expect(doc.nodes).toEqual([]);
        expect(doc.edges).toEqual([]);
    });

    it('rejects malformed JSON, wrong kind, unknown target and duplicate ids', () => {
        expect(() => parseShaderGraph('{ nope')).toThrow(/not valid JSON/);
        expect(() => parseShaderGraph('{"kind":"scene"}')).toThrow(/"kind": "shadergraph"/);
        expect(() => parseShaderGraph('{"kind":"shadergraph","target":"raytrace"}')).toThrow(/"target" must be/);
        expect(() => parseShaderGraph(graph('mesh3d', [{ id: 'a', type: 'uv' }, { id: 'a', type: 'time' }], [])))
            .toThrow(/two nodes share the id "a"/);
    });

    it('rejects a node with no id or type, and a malformed position', () => {
        expect(() => parseShaderGraph({ kind: 'shadergraph', target: 'mesh3d', nodes: [{ type: 'uv' }] }))
            .toThrow(/nodes\[0\] has no "id"/);
        expect(() => parseShaderGraph({ kind: 'shadergraph', target: 'mesh3d', nodes: [{ id: 'a' }] }))
            .toThrow(/node "a" has no "type"/);
        expect(() => parseShaderGraph({ kind: 'shadergraph', target: 'mesh3d', nodes: [{ id: 'a', type: 'uv', pos: [1] }] }))
            .toThrow(/malformed "pos"/);
    });

    it('refuses a format from a newer engine rather than guessing at it', () => {
        expect(() => parseShaderGraph({ kind: 'shadergraph', format: 99, target: 'mesh3d' }))
            .toThrow(/newer than this engine understands/);
    });

    it('an empty graph round-trips through JSON unchanged', () => {
        const fresh = emptyShaderGraph('sprite2d');
        expect(parseShaderGraph(JSON.stringify(fresh))).toEqual(fresh);
    });
});

describe('compileShaderGraph', () => {
    it('a fresh graph compiles to no custom stages, so the material keeps the built-in look', () => {
        const parsed = compileShaderGraph(emptyShaderGraph('sprite2d'));
        expect(parsed).toEqual({ shader: 'sprite2d', fragment: null, vertex: null, fragmentGlsl: null, vertexGlsl: null, uniforms: {}, uniformSig: {} });
    });

    it('a wired graph emits exactly what the same graph composed in code emits', () => {
        // color = vec4(uv.x * sin(time), 0, 0, 1): wired, then written.
        const doc = graph('sprite2d', [
            { id: 'uv', type: 'uv' },
            { id: 'split', type: 'split' },
            { id: 't', type: 'time' },
            { id: 's', type: 'sin' },
            { id: 'm', type: 'mul' },
            { id: 'rgba', type: 'vec4' },
            { id: 'out', type: 'output.color' },
        ], [
            edge('uv', 'split', 'value'),
            edge('t', 's', 'a'),
            edge('split', 'm', 'a', 'x'),
            edge('s', 'm', 'b'),
            edge('m', 'rgba', 'x'),
            edge('rgba', 'out', 'color'),
        ]);

        const wired = compileShaderGraph(doc);
        const written = compileShader({
            shader: 'sprite2d',
            color: composerVec4(composerMul(composerSwizzle(composerUv(), 'x'), composerSin(composerTime())), 0, 0, 1),
        });

        expect(wired.fragment).toBe(written.fragment!);
        expect(wired.vertex).toBeNull();
    });

    it('a mesh3d vertex displacement compiles the vertex stage and leaves the fragment alone', () => {
        const doc = graph('mesh3d', [
            { id: 'p', type: 'vertexPosition' },
            { id: 'n', type: 'vertexNormal' },
            { id: 'amp', type: 'uniform', params: { name: 'amp', type: 'f32', value: 0.15 } },
            { id: 'push', type: 'mul' },
            { id: 'sum', type: 'add' },
            { id: 'out', type: 'output.position' },
        ], [
            edge('n', 'push', 'a'),
            edge('amp', 'push', 'b'),
            edge('p', 'sum', 'a'),
            edge('push', 'sum', 'b'),
            edge('sum', 'out', 'position'),
        ]);

        const wired = compileShaderGraph(doc);
        expect(wired.fragment).toBeNull();
        expect(wired.vertex).toContain('fn vertex(pos: vec3<f32>, ctx: VertContext) -> vec3<f32>');
        expect(wired.uniforms).toEqual({ amp: 0.15 });
        expect(wired.uniformSig).toEqual({ amp: 'f32' });
    });

    it('parameters are collected with the signature the inspector needs', () => {
        const doc = graph('sprite2d', [
            { id: 'tint', type: 'uniform', params: { name: 'tint', type: 'vec3<f32>', value: [1, 0.5, 0] } },
            { id: 'gain', type: 'uniform', params: { name: 'gain', type: 'f32', value: 2 } },
            { id: 'lit', type: 'mul' },
            { id: 'rgba', type: 'combine.rgba' },
            { id: 'out', type: 'output.color' },
        ], [
            edge('tint', 'lit', 'a'),
            edge('gain', 'lit', 'b'),
            edge('lit', 'rgba', 'rgb'),
            edge('rgba', 'out', 'color'),
        ]);

        const parsed = compileShaderGraph(doc);
        expect(parsed.uniforms).toEqual({ tint: [1, 0.5, 0], gain: 2 });
        expect(parsed.uniformSig).toEqual({ tint: 'vec3<f32>', gain: 'f32' });
        expect(parsed.fragment).toContain('mu.tint');
        expect(parsed.fragment).toContain('mu.gain');
    });

    it('the uniform node reshapes its stored value to the type it declares', () => {
        // The editor switches the type selector without rewriting the value; a scalar
        // splats rather than emitting a vec3 built from one component.
        const doc = graph('sprite2d', [
            { id: 'u', type: 'uniform', params: { name: 'k', type: 'vec3<f32>', value: 0.25 } },
            { id: 'rgba', type: 'combine.rgba' },
            { id: 'out', type: 'output.color' },
        ], [edge('u', 'rgba', 'rgb'), edge('rgba', 'out', 'color')]);

        expect(compileShaderGraph(doc).uniforms).toEqual({ k: [0.25, 0.25, 0.25] });
    });

    it('an unconnected port falls back to its declared default', () => {
        // `mix` with nothing wired is still a valid, compilable node: the reason you can
        // drop one on the canvas and see something rather than an error.
        const doc = graph('sprite2d', [
            { id: 'm', type: 'mix' },
            { id: 'rgba', type: 'vec4' },
            { id: 'out', type: 'output.color' },
        ], [edge('m', 'rgba', 'x'), edge('rgba', 'out', 'color')]);

        // The defaults are the catalog's: mix(0, 1, 0.5), emitted as the call itself.
        const wired = compileShaderGraph(doc);
        const written = compileShader({ shader: 'sprite2d', color: composerVec4(composerMix(0, 1, 0.5), 0, 0, 1) });
        expect(wired.fragment).toBe(written.fragment!);
        expect(wired.fragment).toContain('mix(0.0, 1.0, 0.5)');
    });

    it('a texture coordinate defaults to the fragment\'s own uv, not to zero', () => {
        // The port's default is a *node* thunk, not a constant: an unwired Texture Sample
        // has to mean "sample here", which is the only useful reading of it.
        const doc = graph('sprite2d', [
            { id: 'tex', type: 'textureSample' },
            { id: 'out', type: 'output.color' },
        ], [edge('tex', 'out', 'color')]);

        const wired = compileShaderGraph(doc);
        const written = compileShader({ shader: 'sprite2d', color: composerTextureSample(composerUv()) });
        expect(wired.fragment).toBe(written.fragment!);
        expect(wired.fragment).toContain('sampleTexture(uv)');
    });

    it('nodes nothing reaches are ignored, so a work-in-progress canvas still compiles', () => {
        const doc = graph('sprite2d', [
            { id: 'c', type: 'const.color', params: { value: [1, 0, 0, 1] } },
            { id: 'out', type: 'output.color' },
            { id: 'orphan', type: 'cellularNoise' },
        ], [edge('c', 'out', 'color')]);

        expect(() => compileShaderGraph(doc)).not.toThrow();
        // The orphan needs a connection it does not have: proof it was never visited.
        expect(compileShaderGraph(doc).fragment).not.toContain('sgCellular3');
    });

    it('shared sub-expressions are hoisted once, the same as in a code graph', () => {
        const doc = graph('sprite2d', [
            { id: 't', type: 'time' },
            { id: 's', type: 'sin' },
            { id: 'a', type: 'add' },
            { id: 'rgba', type: 'vec4' },
            { id: 'out', type: 'output.color' },
        ], [
            edge('t', 's', 'a'),
            edge('s', 'a', 'a'),
            edge('s', 'a', 'b'),
            edge('a', 'rgba', 'x'),
            edge('rgba', 'out', 'color'),
        ]);

        const wired = compileShaderGraph(doc);
        const shared = composerSin(composerTime());
        const written = compileShader({ shader: 'sprite2d', color: composerVec4(composerAdd(shared, shared), 0, 0, 1) });
        expect(wired.fragment).toBe(written.fragment!);
        expect(wired.fragment).toContain('let v0 = sin(mu.time);');
    });
});

describe('compileShaderGraph: errors name the culprit', () => {
    it('a cycle is reported instead of hanging', () => {
        const doc = graph('sprite2d', [
            { id: 'a', type: 'add' },
            { id: 'b', type: 'add' },
            { id: 'rgba', type: 'vec4' },
            { id: 'out', type: 'output.color' },
        ], [
            edge('a', 'b', 'a'),
            edge('b', 'a', 'a'),
            edge('a', 'rgba', 'x'),
            edge('rgba', 'out', 'color'),
        ]);

        expect(() => compileShaderGraph(doc)).toThrow(/loops back on itself/);
    });

    it('a required port with nothing wired says which node and which port', () => {
        const doc = graph('sprite2d', [
            { id: 'n', type: 'normalize' },
            { id: 'out', type: 'output.color' },
        ], [edge('n', 'out', 'color')]);

        expect(() => compileShaderGraph(doc)).toThrow(/node "n" \(Normalize\) needs something wired into its "A" input/);
    });

    it('an operand type clash surfaces with the node that caused it', () => {
        const doc = graph('sprite2d', [
            { id: 'a', type: 'const.vec2', params: { value: [1, 2] } },
            { id: 'b', type: 'const.vec3', params: { value: [1, 2, 3] } },
            { id: 'sum', type: 'add' },
            { id: 'out', type: 'output.color' },
        ], [edge('a', 'sum', 'a'), edge('b', 'sum', 'b'), edge('sum', 'out', 'color')]);

        expect(() => compileShaderGraph(doc)).toThrow(/node "sum" \(Add\): cannot "\+" a vec2<f32> with a vec3<f32>/);
    });

    it('a stage-illegal input is rejected with the stage named', () => {
        // `light()` only exists in a mesh fragment; wiring it into the vertex output is a
        // graph that cannot compile, and saying so beats emitting broken WGSL.
        const doc = graph('mesh3d', [
            { id: 'l', type: 'light' },
            { id: 'out', type: 'output.position' },
        ], [edge('l', 'out', 'position')]);

        expect(() => compileShaderGraph(doc)).toThrow(/light is not available in a model vertex/);
    });

    it('a wire from an output a node does not have is named, not silently dropped', () => {
        const doc = graph('sprite2d', [
            { id: 'uv', type: 'uv' },
            { id: 'split', type: 'split' },
            { id: 'rgba', type: 'vec4' },
            { id: 'out', type: 'output.color' },
        ], [
            edge('uv', 'split', 'value'),
            // `uv` is a vec2: it has no z.
            edge('split', 'rgba', 'x', 'z'),
            edge('rgba', 'out', 'color'),
        ]);

        expect(() => compileShaderGraph(doc)).toThrow(/node "split" \(Split\) does not make "z"/);
    });

    it('two wires into one port is an error, not a coin flip', () => {
        const doc = graph('sprite2d', [
            { id: 'a', type: 'time' },
            { id: 'b', type: 'time' },
            { id: 's', type: 'sin' },
            { id: 'rgba', type: 'vec4' },
            { id: 'out', type: 'output.color' },
        ], [
            edge('a', 's', 'a'),
            edge('b', 's', 'a'),
            edge('s', 'rgba', 'x'),
            edge('rgba', 'out', 'color'),
        ]);

        expect(() => compileShaderGraph(doc)).toThrow(/has two wires; an input takes one/);
    });

    it('an edge to a node that is not there is caught before any codegen', () => {
        const doc = graph('sprite2d', [{ id: 'out', type: 'output.color' }], [edge('ghost', 'out', 'color')]);
        expect(() => compileShaderGraph(doc)).toThrow(/unknown node "ghost"/);
    });

    it('an unknown node type names the type', () => {
        const doc = graph('sprite2d', [
            { id: 'x', type: 'raymarch' },
            { id: 'out', type: 'output.color' },
        ], [edge('x', 'out', 'color')]);

        expect(() => compileShaderGraph(doc)).toThrow(/unknown node type "raymarch"/);
    });

    it('two color outputs is an error: the graph would have no single result', () => {
        const doc = graph('sprite2d', [
            { id: 'o1', type: 'output.color' },
            { id: 'o2', type: 'output.color' },
        ], []);
        expect(() => compileShaderGraph(doc)).toThrow(/has 2 "Color Output" nodes; it can have one/);
    });

    it('the file name appears in every message, so a failing asset identifies itself', () => {
        const doc = graph('sprite2d', [{ id: 'out', type: 'output.color' }], [edge('ghost', 'out', 'color')]);
        expect(() => compileShaderGraph(doc, 'assets/shaders/glow.shader'))
            .toThrow(/shader graph "assets\/shaders\/glow.shader"/);
    });
});

describe('inferGraphTypes: what an editor draws with', () => {
    it('types every socket, including nodes no output reaches', () => {
        const doc = graph('sprite2d', [
            { id: 'uv', type: 'uv' },
            { id: 'split', type: 'split' },
            { id: 'floating', type: 'const.color', params: { value: [1, 0, 0, 1] } },
            { id: 'out', type: 'output.color' },
        ], [edge('uv', 'split', 'value')]);

        const info = inferGraphTypes(doc);
        expect(info.fatal).toBeNull();
        expect(info.outputs.uv).toEqual({ value: 'vec2<f32>' });
        // A vec2 in means only x and y come out: which is exactly what the canvas must show.
        expect(info.outputs.split).toEqual({ x: 'f32', y: 'f32' });
        // Unreachable, but still drawn, so still typed.
        expect(info.outputs.floating).toEqual({ value: 'vec4<f32>' });
    });

    it('a failing node is reported without stopping the rest', () => {
        const doc = graph('sprite2d', [
            { id: 'bad', type: 'normalize' },
            { id: 'good', type: 'time' },
            { id: 'out', type: 'output.color' },
        ], []);

        const info = inferGraphTypes(doc);
        expect(info.errors.bad).toMatch(/needs something wired/);
        expect(info.outputs.bad).toBeUndefined();
        // The whole point of collecting rather than throwing: the rest of the canvas still draws.
        expect(info.outputs.good).toEqual({ value: 'f32' });
    });

    it('a cycle marks only the nodes in it, and the walk keeps going after', () => {
        const doc = graph('sprite2d', [
            { id: 'a', type: 'add' },
            { id: 'b', type: 'add' },
            { id: 'later', type: 'time' },
            { id: 'out', type: 'output.color' },
        ], [edge('a', 'b', 'a'), edge('b', 'a', 'a')]);

        const info = inferGraphTypes(doc);
        expect(info.errors.a).toMatch(/loops back on itself/);
        expect(info.errors.b).toMatch(/loops back on itself/);
        // The regression this guards: an unwound `visiting` set. A node visited after a cycle
        // must not inherit its failure.
        expect(info.errors.later).toBeUndefined();
        expect(info.outputs.later).toEqual({ value: 'f32' });
    });

    it('a node fed by a failing one reports the real error, not a loop', () => {
        // The failing node is asked for twice: once on its own and once through the wire. If its
        // "being built" mark stayed behind after it threw, the second time would look like a loop.
        const doc = graph('sprite2d', [
            { id: 'a', type: 'const.vec2', params: { value: [1, 2] } },
            { id: 'b', type: 'const.vec3', params: { value: [1, 2, 3] } },
            { id: 'sum', type: 'add' },
            { id: 'after', type: 'abs' },
            { id: 'out', type: 'output.color' },
        ], [edge('a', 'sum', 'a'), edge('b', 'sum', 'b'), edge('sum', 'after', 'a')]);

        const info = inferGraphTypes(doc);
        expect(info.errors.sum).toMatch(/cannot "\+"/);
        expect(info.errors.after).toMatch(/cannot "\+"/);
        expect(info.errors.after).not.toMatch(/loops back/);
    });

    it('a document-level problem comes back as fatal, not as a per-node error', () => {
        const doc = graph('sprite2d', [{ id: 'out', type: 'output.color' }], [edge('ghost', 'out', 'color')]);
        const info = inferGraphTypes(doc);
        expect(info.fatal).toMatch(/unknown node "ghost"/);
    });

    it('it agrees with the compiler about whether a graph is valid', () => {
        // The property the editor leans on when it validates a wire mid-drag: if inference
        // reports no error at a node, compiling must not fail there either.
        const ok = graph('sprite2d', [
            { id: 'c', type: 'const.color', params: { value: [1, 0, 0, 1] } },
            { id: 'out', type: 'output.color' },
        ], [edge('c', 'out', 'color')]);
        expect(inferGraphTypes(ok).errors).toEqual({});
        expect(() => compileShaderGraph(ok)).not.toThrow();

        const bad = graph('sprite2d', [
            { id: 'a', type: 'const.vec2', params: { value: [1, 2] } },
            { id: 'b', type: 'const.vec3', params: { value: [1, 2, 3] } },
            { id: 'sum', type: 'add' },
            { id: 'out', type: 'output.color' },
        ], [edge('a', 'sum', 'a'), edge('b', 'sum', 'b'), edge('sum', 'out', 'color')]);
        expect(inferGraphTypes(bad).errors.sum).toMatch(/cannot "\+"/);
        expect(() => compileShaderGraph(bad)).toThrow();
    });
});

describe('the catalog is the single registry', () => {
    it('every node type is reachable by key and by list, with no duplicates', () => {
        expect(NODE_DEFS.length).toBe(Object.keys(NODE_CATALOG).length);
        for (const def of NODE_DEFS) expect(NODE_CATALOG[def.type]).toBe(def);
    });

    it('every definition is complete enough for the editor to render it', () => {
        for (const def of NODE_DEFS) {
            expect(def.label.length).toBeGreaterThan(0);
            expect(def.summary.length).toBeGreaterThan(0);
            // Input port names must be unique: they are how an edge addresses a socket.
            expect(new Set(def.inputs.map((p) => p.name)).size).toBe(def.inputs.length);
            expect(new Set(def.outputs.map((p) => p.name)).size).toBe(def.outputs.length);
            // Only the terminals may produce nothing.
            if (def.role !== 'output') expect(def.outputs.length).toBeGreaterThan(0);
        }
    });

    it('defaultParams gives a fresh copy, so two nodes never share an array', () => {
        const a = defaultParams('const.color');
        const b = defaultParams('const.color');
        expect(a).toEqual(b);
        expect(a.value).not.toBe(b.value);
    });

    it('an unknown type fails at lookup with a usable message', () => {
        expect(() => nodeDef('nope')).toThrow(/unknown node type "nope"/);
    });

    it('every node whose inputs all have defaults builds with nothing wired into it', () => {
        // What "drop a node on the canvas and it already does something" has to mean: the
        // node builds from its own defaults alone. Nodes with a required port are excluded
        // by construction: they advertise that a connection is needed.
        const standalone = NODE_DEFS.filter(
            (d) => d.role !== 'output' && d.inputs.every((p) => p.default !== undefined),
        );
        expect(standalone.length).toBeGreaterThan(20);

        for (const def of standalone) {
            const doc = graph(def.targets?.[0] ?? 'sprite2d', [
                { id: 'n', type: def.type },
                { id: 'out', type: 'output.color' },
            ], [edge('n', 'out', 'color')]);

            try {
                compileShaderGraph(doc);
            } catch (err) {
                // The only acceptable failure is the color root refusing a non-color type
                // (a `time` node is an f32, not a color): that is `compileShader` doing its
                // job, not the node failing to build.
                expect(String(err)).toMatch(/"color" must be a vec3 or a vec4|is not available in/);
            }
        }
    });
});

describe('a graph is the same shader as the code that writes it', () => {
    it('the glow example: fresnel rim over the lit surface', () => {
        const doc = graph('mesh3d', [
            { id: 'f', type: 'fresnel' },
            { id: 'rim', type: 'uniform', params: { name: 'rimColor', type: 'vec3<f32>', value: [0.3, 0.8, 1] } },
            { id: 'glow', type: 'mul' },
            { id: 'surf', type: 'surface' },
            { id: 'sw', type: 'swizzle', params: { mask: 'rgb' } },
            { id: 'sum', type: 'add' },
            { id: 'rgba', type: 'combine.rgba' },
            { id: 'out', type: 'output.color' },
        ], [
            edge('f', 'glow', 'b'),
            edge('rim', 'glow', 'a'),
            edge('surf', 'sw', 'value'),
            edge('sw', 'sum', 'a'),
            edge('glow', 'sum', 'b'),
            edge('sum', 'rgba', 'rgb'),
            edge('rgba', 'out', 'color'),
        ]);

        const wired = compileShaderGraph(doc);
        expect(wired.shader).toBe('mesh3d');
        expect(wired.fragment).toContain('fn effect(surface: vec4<f32>, ctx: FragContext) -> vec4<f32>');
        expect(wired.uniforms).toEqual({ rimColor: [0.3, 0.8, 1] });
        expect(wired.uniformSig).toEqual({ rimColor: 'vec3<f32>' });
    });

    it('noise helpers are emitted once even when two nodes need them', () => {
        const doc = graph('sprite2d', [
            { id: 'uv', type: 'uv' },
            { id: 'n1', type: 'simplexNoise' },
            { id: 'n2', type: 'fbm', params: { octaves: 3 } },
            { id: 'sum', type: 'add' },
            { id: 'rgba', type: 'vec4' },
            { id: 'out', type: 'output.color' },
        ], [
            edge('uv', 'n1', 'pos'),
            edge('uv', 'n2', 'pos'),
            edge('n1', 'sum', 'a'),
            edge('n2', 'sum', 'b'),
            edge('sum', 'rgba', 'x'),
            edge('rgba', 'out', 'color'),
        ]);

        const fragment = compileShaderGraph(doc).fragment!;
        expect(fragment.match(/fn sgNoise3\(/g)).toHaveLength(1);
        expect(fragment).toContain('fn sgFbm3o3(');
    });

    it('a uniform used at two different types is refused, as it is in code', () => {
        const doc = graph('sprite2d', [
            { id: 'a', type: 'uniform', params: { name: 'k', type: 'f32', value: 1 } },
            { id: 'b', type: 'uniform', params: { name: 'k', type: 'vec3<f32>', value: [1, 1, 1] } },
            { id: 'm', type: 'mul' },
            { id: 'rgba', type: 'combine.rgba' },
            { id: 'out', type: 'output.color' },
        ], [
            edge('a', 'm', 'a'),
            edge('b', 'm', 'b'),
            edge('m', 'rgba', 'rgb'),
            edge('rgba', 'out', 'color'),
        ]);

        expect(() => compileShaderGraph(doc)).toThrow(/used as two different types/);
    });

    it('a reserved uniform name is refused at the node that used it', () => {
        const doc = graph('sprite2d', [
            { id: 'u', type: 'uniform', params: { name: 'time', type: 'f32', value: 1 } },
            { id: 'rgba', type: 'vec4' },
            { id: 'out', type: 'output.color' },
        ], [edge('u', 'rgba', 'x'), edge('rgba', 'out', 'color')]);

        expect(() => compileShaderGraph(doc)).toThrow(/node "u" \(Parameter\): the parameter name "time" is taken/);
    });
});

/**
 * A fresnel rim over the lit surface: the shape a real `.shader` file has, ids and all.
 */
const GLOW_FIXTURE = JSON.stringify({
    format: 1,
    kind: 'shadergraph',
    target: 'mesh3d',
    nodes: [
        { id: 'surface', type: 'surface', pos: [40, 60] },
        { id: 'rgb', type: 'swizzle', pos: [300, 60], params: { mask: 'rgb' } },
        { id: 'fresnel', type: 'fresnel', pos: [40, 220] },
        { id: 'rimColor', type: 'uniform', pos: [40, 360], params: { name: 'rimColor', type: 'vec3<f32>', value: [0.3, 0.8, 1] } },
        { id: 'rim', type: 'mul', pos: [300, 280] },
        { id: 'lit', type: 'add', pos: [560, 160] },
        { id: 'rgba', type: 'combine.rgba', pos: [800, 160] },
        { id: 'out_color', type: 'output.color', pos: [1040, 160] },
    ],
    edges: [
        { from: 'surface', out: 'value', to: 'rgb', in: 'value' },
        { from: 'rimColor', out: 'value', to: 'rim', in: 'a' },
        { from: 'fresnel', out: 'value', to: 'rim', in: 'b' },
        { from: 'rgb', out: 'value', to: 'lit', in: 'a' },
        { from: 'rim', out: 'value', to: 'lit', in: 'b' },
        { from: 'lit', out: 'value', to: 'rgba', in: 'rgb' },
        { from: 'rgba', out: 'value', to: 'out_color', in: 'color' },
    ],
});

describe('node previews', () => {
    /**
     * A thumbnail is only useful if it can be drawn for *every* node: including the ones whose
     * value only exists on a 3D surface. That is what the preview stage buys, and what these pin.
     */
    it('every node that produces a value gets a preview', () => {
        const doc = parseShaderGraph(GLOW_FIXTURE);
        const previews = compileNodePreviews(doc);

        const valueNodes = doc.nodes.filter((n) => nodeDef(n.type).role !== 'output');
        expect(Object.keys(previews).sort()).toEqual(valueNodes.map((n) => n.id).sort());
        for (const ports of Object.values(previews)) {
            expect(ports.value.fragment).toContain('fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32>');
        }
    });

    it('the terminals have no preview: they hold no value of their own', () => {
        const previews = compileNodePreviews(parseShaderGraph(GLOW_FIXTURE));
        expect(previews.out_color).toBeUndefined();
    });

    it('a 3D-only input previews against the virtual sphere instead of failing', () => {
        // `worldNormal` has no meaning on a flat quad, and refusing to preview it would leave a
        // hole exactly where the interesting nodes are.
        const doc = graph('mesh3d', [
            { id: 'n', type: 'worldNormal' },
            { id: 'out', type: 'output.color' },
        ], [edge('n', 'out', 'color')]);

        const fragment = compileNodePreviews(doc).n.value.fragment;
        expect(fragment).toContain('sgPreviewNormal(uv)');
        expect(fragment).toContain('fn sgPreviewNormal(');
    });

    it('a value is mapped to colour by its type, so anything is visible', () => {
        const one = (type: string, id: string) =>
            compileNodePreviews(graph('sprite2d', [
                { id, type },
                { id: 'out', type: 'output.color' },
            ], []))[id].value.fragment;

        // f32 → greyscale (splatted), vec2 → red/green with a zero blue, vec4 → itself.
        expect(one('time', 't')).toContain('vec4<f32>(vec3<f32>(mu.time), 1.0)');
        expect(one('uv', 'u')).toContain('vec4<f32>(uv, 0.0, 1.0)');
        expect(one('surface', 's')).toMatch(/return color;/);
    });

    it('a node that cannot resolve simply has no preview, and does not stop the others', () => {
        const doc = graph('sprite2d', [
            { id: 'ok', type: 'time' },
            { id: 'broken', type: 'normalize' },
            { id: 'out', type: 'output.color' },
        ], []);

        const previews = compileNodePreviews(doc);
        expect(previews.ok).toBeDefined();
        expect(previews.broken).toBeUndefined();
    });

    it('a preview carries the parameters it reads, ready for the uniform buffer', () => {
        const doc = graph('mesh3d', [
            { id: 'u', type: 'uniform', params: { name: 'rim', type: 'vec3<f32>', value: [1, 0, 0] } },
            { id: 'out', type: 'output.color' },
        ], []);

        const preview = compileNodePreviews(doc).u.value;
        expect(preview.uniforms).toEqual({ rim: [1, 0, 0] });
        expect(preview.uniformSig).toEqual({ rim: 'vec3<f32>' });
    });

    it('the preview stage never leaves an input unresolved', () => {
        // Every context leaf must be previewable; a missing entry would be a node the editor
        // silently cannot draw, which is worse than a wrong-looking one.
        const inputs = NODE_DEFS.filter((d) => d.category === 'input' && d.inputs.length === 0);
        for (const def of inputs) {
            const doc = graph('mesh3d', [{ id: 'n', type: def.type }, { id: 'out', type: 'output.color' }], []);
            expect(compileNodePreviews(doc).n?.value.fragment).toBeTruthy();
        }
    });
});

describe('canvas comments', () => {
    /**
     * A comment is annotation, not shader. These pin the two properties that matter: it survives a
     * round-trip untouched, and it is invisible to everything that turns a graph into WGSL.
     */
    it('round-trips with its text, position, size and colour', () => {
        const source = {
            ...graph('mesh3d', [{ id: 'a', type: 'uv' }], []),
            comments: [{ id: 'note_1', text: 'rim lighting', pos: [10, 20], size: [300, 180], color: [1, 0.5, 0] }],
        };
        expect(parseShaderGraph(JSON.stringify(source)).comments).toEqual([
            { id: 'note_1', text: 'rim lighting', pos: [10, 20], size: [300, 180], color: [1, 0.5, 0] },
        ]);
    });

    it('a graph nobody annotated does not gain the field', () => {
        // Round-tripping must not rewrite a hand-written or MCP-authored file with an empty array.
        expect(parseShaderGraph(JSON.stringify(graph('mesh3d', [], []))).comments).toBeUndefined();
    });

    it('a comment with only a body gets sensible defaults rather than being refused', () => {
        const doc = parseShaderGraph({ kind: 'shadergraph', target: 'mesh3d', comments: [{ id: 'n', text: 'hi' }] });
        expect(doc.comments![0].pos).toEqual([0, 0]);
        expect(doc.comments![0].size).toEqual([240, 160]);
        expect(doc.comments![0].color).toBeUndefined();
    });

    it('an empty body is a comment being written, not a broken one', () => {
        const doc = parseShaderGraph({ kind: 'shadergraph', target: 'mesh3d', comments: [{ id: 'n' }] });
        expect(doc.comments![0].text).toBe('');
    });

    it('a malformed comment is named, like a malformed node is', () => {
        expect(() => parseShaderGraph({ kind: 'shadergraph', target: 'mesh3d', comments: [{}] }))
            .toThrow(/comments\[0\] has no "id"/);
        expect(() => parseShaderGraph({ kind: 'shadergraph', target: 'mesh3d', comments: [{ id: 'n', pos: [1] }] }))
            .toThrow(/comment "n" has a malformed "pos"/);
        expect(() => parseShaderGraph({ kind: 'shadergraph', target: 'mesh3d', comments: [{ id: 'n', text: 7 }] }))
            .toThrow(/comment "n" has a malformed "text"/);
    });

    it('comments change nothing about what the graph compiles to', () => {
        const bare = graph('mesh3d', [
            { id: 'n', type: 'worldNormal' },
            { id: 'rgba', type: 'combine.rgba' },
            { id: 'out', type: 'output.color' },
        ], [edge('n', 'rgba', 'rgb'), edge('rgba', 'out', 'color')]);
        const annotated = { ...bare, comments: [{ id: 'n', text: 'the rim', pos: [0, 0] as [number, number], size: [200, 200] as [number, number] }] };

        expect(compileShaderGraph(annotated)).toEqual(compileShaderGraph(bare));
        expect(Object.keys(compileNodePreviews(annotated))).toEqual(Object.keys(compileNodePreviews(bare)));
        expect(inferGraphTypes(annotated)).toEqual(inferGraphTypes(bare));
    });
});

describe('loading a .shader', () => {
    /**
     * The extension picks the reader, and everything after it cannot tell: a material built on a
     * `.shader` fills in exactly as one built on a `.wgsl` does.
     */
    afterEach(() => {
        mock.restore();
    });

    const serve = (files: Record<string, string>) =>
        spyOn(globalThis, 'fetch').mockImplementation((async (input: string) => {
            const body = files[input];
            if (body === undefined) {
                return new Response('missing', { status: 404 });
            }
            return new Response(body);
        }) as unknown as typeof fetch);

    const inScene = <T>(store: Parameters<typeof startTestScene>[0], body: () => T): T => {
        let made!: T;
        startTestScene(store, 'Level', () => {
            made = body();
            return createScene();
        });
        return made;
    };

    it('reads it as a graph and pours both languages into the material', async () => {
        const { store } = createTestGame();
        serve({ '/glow.shader': GLOW_FIXTURE });

        const shader = newShader('/glow.shader', '/glow.shader');
        const material = inScene(store, () => createMaterial({ shader: 'mesh3d', effect: shader }));
        await loadShader(store, shader);

        expect(shader.status).toBe('ready');
        expect(shader.shader).toBe('mesh3d');
        expect(material.fragment).toBe(compileShaderGraph(parseShaderGraph(GLOW_FIXTURE)).fragment);
        expect(material.fragmentGlsl).toContain('vec4 effect(vec4 surface, FragContext ctx)');
        expect(material.uniforms).toEqual({ rimColor: [0.3, 0.8, 1] });
    });

    it('refuses a second GLSL file, which could only contradict the graph', async () => {
        const { store } = createTestGame();
        const fetched = serve({ '/glow.shader': GLOW_FIXTURE, '/glow.glsl': 'vec4 effect(vec4 s, FragContext c) { return s; }' });
        const warn = spyOn(console, 'warn').mockImplementation(() => {});

        const shader = newShader('/glow.shader', '/glow.shader', '/glow.glsl');
        const material = inScene(store, () => createMaterial({ shader: 'mesh3d', effect: shader }));
        await loadShader(store, shader);

        expect(shader.status).toBe('error');
        expect(material.fragment).toBeNull();
        expect(String(warn.mock.calls[0][1])).toMatch(/node graph, which writes its own GLSL/);
        expect(fetched).not.toHaveBeenCalled();
    });

    it('parks a broken graph in error, naming the file, and the material draws built-in', async () => {
        const { store } = createTestGame();
        serve({ '/bad.shader': '{"kind":"shadergraph","target":"mesh3d","nodes":[{"id":"x","type":"raymarch"},{"id":"o","type":"output.color"}],"edges":[{"from":"x","out":"value","to":"o","in":"color"}]}' });
        const warn = spyOn(console, 'warn').mockImplementation(() => {});

        const shader = newShader('/bad.shader', '/bad.shader');
        const material = inScene(store, () => createMaterial({ shader: 'mesh3d', effect: shader }));
        await loadShader(store, shader);

        expect(shader.status).toBe('error');
        expect(material.fragment).toBeNull();
        expect(String(warn.mock.calls[0][1])).toMatch(/shader graph "\/bad.shader".*unknown node type "raymarch"/);
    });

    it('still reads anything else as WGSL', async () => {
        const { store } = createTestGame();
        serve({ '/plain.wgsl': 'fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> { return color; }' });

        const shader = newShader('/plain.wgsl', '/plain.wgsl');
        await loadShader(store, shader);

        expect(shader.status).toBe('ready');
        expect(shader.fragment).toContain('return color;');
    });
});

describe('the format keeps core\'s node names', () => {
    it('so a .shader made before the composer was renamed still opens', () => {
        // The functions are `composerSin`, `composerAdd`...; the file stores the kind of node, and
        // that is the format's, not the API's.
        for (const type of ['uv', 'time', 'sin', 'add', 'mul', 'mix', 'fresnel', 'simplexNoise', 'uniform', 'output.color']) {
            expect(NODE_CATALOG[type]).toBeDefined();
        }
    });
});

describe('compilePreviewShader', () => {
    it('writes a node\'s small picture in the language it is asked for, by name', () => {
        const value = composerSin(composerTime());

        const wgsl = compilePreviewShader(value);
        const glsl = compilePreviewShader(value, 'glsl');

        // Each in its own spelling: WGSL keeps the generic, GLSL drops it.
        expect(wgsl.fragment).toContain('vec4<f32>');
        expect(glsl.fragment).not.toContain('vec4<f32>');
        expect(glsl.fragment).toContain('vec4(');
        expect(compilePreviewShader(value, 'wgsl').fragment).toBe(wgsl.fragment);
    });
});
