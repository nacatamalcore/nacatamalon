import { describe, expect, it } from 'bun:test';
import { compileShader } from '../src/shader_composer/compile_shader';
import { compileShaderGraph } from '../src/shader_composer/compile_shader_graph';
import { composerSwizzle, composerVec2, composerVec3, composerVec4 } from '../src/shader_composer/constructors';
import { composerAtan2 } from '../src/shader_composer/math';
import { composerTextureSample, composerUv } from '../src/shader_composer/inputs';
import { composerPolar } from '../src/shader_composer/effects';
import { NODE_CATALOG } from '../src/shader_composer/catalog';
import { SHADER_GRAPH_FORMAT } from '../src/shader_composer/document';
import type { TComposerNode } from '../src/shader_composer/types/t_composer_node';
import type { TShaderGraphDoc } from '../src/shader_composer/types/t_shader_graph_doc';

/**
 * A place read round a centre: how far from it and how far round, worked out here from the very
 * nodes the shader is written from, so what is checked is what the card runs.
 */

/** What a node comes to at one place, lane by lane, for the pieces a polar read is made of. */
const evaluate = (node: TComposerNode, uv: [number, number]): number[] => {
    const args = node.deps.map((dep) => evaluate(dep, uv));
    const lanes = (a: number[], b: number[], f: (x: number, y: number) => number): number[] => {
        const n = Math.max(a.length, b.length);
        return Array.from({ length: n }, (_, i) => f(a.length === 1 ? a[0]! : a[i]!, b.length === 1 ? b[0]! : b[i]!));
    };
    switch (node.kind) {
        case 'literal': return [node.params![0] as number];
        case 'input':
            if (node.input === 'uv') return [...uv];
            throw new Error(`no ${node.input} here`);
        case 'construct': {
            const flat = args.flat();
            const size = node.type === 'f32' ? 1 : Number(node.type[3]);
            return flat.length === 1 ? Array(size).fill(flat[0]) : flat;
        }
        case 'swizzle': return [...String(node.params![0])].map((c) => args[0]!['xyzw'.indexOf(c)]!);
        case 'binop': {
            const op = node.params![0];
            return lanes(args[0]!, args[1]!, (x, y) => (op === '+' ? x + y : op === '-' ? x - y : op === '*' ? x * y : x / y));
        }
        case 'call': {
            const fn = String(node.params![0]);
            if (fn === 'length') return [Math.hypot(...args[0]!)];
            if (fn.startsWith('sgAtan2')) return lanes(args[0]!, args[1]!, Math.atan2);
            throw new Error(`no ${fn} here`);
        }
        default: throw new Error(`no ${node.kind} here`);
    }
};

const polarAt = (u: number, v: number, center?: [number, number]): [number, number] => {
    const node = center === undefined ? composerPolar() : composerPolar(composerUv(), composerVec2(...center));
    const [distance, turn] = evaluate(node, [u, v]);
    return [distance!, turn!];
};

describe('composerPolar', () => {
    it('is how far from the middle, 1 at the middle of each edge, and 0 there', () => {
        expect(polarAt(0.5, 0.5)[0]).toBeCloseTo(0, 6);
        for (const [u, v] of [[1, 0.5], [0, 0.5], [0.5, 0], [0.5, 1]] as const) {
            expect(polarAt(u, v)[0]).toBeCloseTo(1, 6);
        }
        expect(polarAt(0.75, 0.5)[0]).toBeCloseTo(0.5, 6);
    });

    it('goes round as composerAtan2 does: 0 on the left, 0.5 on the right, growing down the picture', () => {
        expect(polarAt(0, 0.5 - 1e-9)[1]).toBeCloseTo(0, 6);
        expect(polarAt(1, 0.5)[1]).toBeCloseTo(0.5, 6);
        // Down a sprite's picture (+v) is a quarter on from the right; up it, a quarter back.
        expect(polarAt(0.5, 1)[1]).toBeCloseTo(0.75, 6);
        expect(polarAt(0.5, 0)[1]).toBeCloseTo(0.25, 6);
        // Within one turn everywhere.
        for (let i = 0; i < 64; i++) {
            const a = (i / 64) * Math.PI * 2;
            const turn = polarAt(0.5 + Math.cos(a) * 0.3, 0.5 + Math.sin(a) * 0.3)[1];
            expect(turn).toBeGreaterThanOrEqual(0);
            expect(turn).toBeLessThanOrEqual(1);
        }
    });

    it('reads round the centre it is given', () => {
        const [distance, turn] = polarAt(0.5, 0.25, [0.25, 0.25]);
        expect(distance).toBeCloseTo(0.5, 6);
        expect(turn).toBeCloseTo(0.5, 6);
    });

    it('compiles on both cards, for a sprite and a model, as a strip read round a ring', () => {
        for (const shader of ['sprite2d', 'mesh3d'] as const) {
            const color = composerTextureSample(composerSwizzle(composerPolar(), 'yx'));
            const compiled = compileShader({ shader, color });
            expect(compiled.fragment).toContain('atan2(');
            expect(compiled.fragmentGlsl).toContain('atan(');
        }
    });

    it('gives the centre itself one angle on every card, where neither language says what atan2 gives', () => {
        const compiled = compileShader({ shader: 'sprite2d', color: composerTextureSample(composerSwizzle(composerPolar(), 'yx')) });
        expect(compiled.fragment).toContain('select(atan2(y, x), f32(0.0), abs(x) + abs(y) == f32(0.0))');
        expect(compiled.fragmentGlsl).toContain('abs(x) + abs(y) == 0.0 ? 0.0 : atan(y, x)');
        // Which comes to a turn of 0.5 there: read as the right of the ring.
        expect(polarAt(0.5, 0.5)[1]).toBeCloseTo(0.5, 6);
        // Lane by lane too, for an atan2 of vectors.
        const lanes = compileShader({ shader: 'sprite2d', color: composerVec4(composerAtan2(composerUv(), composerUv()), 0, 1) });
        expect(lanes.fragment).toContain('select(atan2(y, x), vec2<f32>(0.0), abs(x) + abs(y) == vec2<f32>(0.0))');
        expect(lanes.fragmentGlsl).toContain('mix(atan(y, x), vec2(0.0), equal(abs(x) + abs(y), vec2(0.0)))');
    });

    it('refuses a place that is not two numbers, saying what it got', () => {
        expect(() => composerPolar(composerVec3(0, 0, 0))).toThrow(/vec2.*vec3/);
    });

    it('is a node in the editor\'s graph, wired by default to the picture\'s place and its middle', () => {
        const def = NODE_CATALOG.polar!;
        expect(def.category).toBe('vector');
        expect(def.inputs.map((p) => p.name)).toEqual(['uv', 'center']);
        expect(def.outputType).toBe('vec2<f32>');

        // Wired on a canvas with nothing in its inputs, it is the same shader as the call with none.
        const doc: TShaderGraphDoc = {
            format: SHADER_GRAPH_FORMAT,
            kind: 'shadergraph',
            target: 'sprite2d',
            nodes: [
                { id: 'p', type: 'polar', pos: [0, 0] },
                { id: 's', type: 'swizzle', params: { mask: 'yx' }, pos: [0, 0] },
                { id: 't', type: 'textureSample', pos: [0, 0] },
                { id: 'out', type: 'output.color', pos: [0, 0] },
            ],
            edges: [
                { from: 'p', out: 'value', to: 's', in: 'value' },
                { from: 's', out: 'value', to: 't', in: 'uv' },
                { from: 't', out: 'value', to: 'out', in: 'color' },
            ],
        };
        const written = compileShader({ shader: 'sprite2d', color: composerTextureSample(composerSwizzle(composerPolar(), 'yx')) });
        expect(compileShaderGraph(doc).fragment).toBe(written.fragment!);
    });
});
