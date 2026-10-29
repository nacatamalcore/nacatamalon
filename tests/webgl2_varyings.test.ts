import { describe, expect, it } from 'bun:test';
import { buildMeshMaterialShaderGlsl, buildMeshMaterialShadowShaderGlsl } from '../src/render/webgl2/material/mesh_material_shader';
import { meshVertexGlsl } from '../src/render/webgl2/mesh/mesh_shader';
import { skinnedVertexGlsl } from '../src/render/webgl2/mesh/skinned_shader';
import type { TCullMode } from '../src/materials';

/**
 * What a model's vertex stage hands to its colour stage on WebGL2, counted the way the card counts it.
 *
 * WebGL2 promises 15 rows of four numbers for it (`MAX_VARYING_VECTORS`), and some phones give no
 * more. A desktop gives far more, so a shader that asks for 16 compiles here and fails only there,
 * where nobody is looking. This counts every combination a model can be drawn with and fails past 15,
 * so whatever is added next (a tangent of its own, another `carry`) is caught here instead.
 */

/** The most rows WebGL2 promises. */
const ROWS = 15;

const SIZES: Record<string, number> = { float: 1, int: 1, uint: 1, vec2: 2, ivec2: 2, uvec2: 2, vec3: 3, ivec3: 3, uvec3: 3, vec4: 4, ivec4: 4, uvec4: 4 };

/** What a vertex stage writes out: the size of each, in numbers. */
const outputsOf = (vertex: string): number[] =>
    [...vertex.matchAll(/^\s*(?:(?:flat|smooth|centroid|highp|mediump|lowp)\s+)*out\s+(?:(?:highp|mediump|lowp)\s+)?(\w+)\s+\w+\s*;/gm)].map((match) => {
        const size = SIZES[match[1]!];
        if (size === undefined) throw new Error(`a varying of a kind this does not count: ${match[1]}`);
        return size;
    });

/**
 * How many rows those take, packed as GLSL ES 3.00 says a card must at least manage ("Counting of
 * Inputs and Outputs"): each four-wide on a row of its own, each three-wide on a row with its last
 * column left, the two-wides two to a row, and the single numbers into whatever columns are left
 * before they start rows of their own.
 */
const rowsOf = (sizes: readonly number[]): number => {
    const count = (size: number) => sizes.filter((s) => s === size).length;
    const fours = count(4);
    const threes = count(3);
    const twos = count(2);
    let ones = count(1);
    let rows = fours + threes + Math.ceil(twos / 2);
    // A three-wide leaves one column, and an odd two-wide a row with two.
    let spare = threes + (twos % 2) * 2;
    const fit = Math.min(spare, ones);
    ones -= fit;
    spare -= fit;
    rows += Math.ceil(ones / 4);
    return rows;
};

const CULLS: TCullMode[] = ['back', 'front', 'none'];

/** Every vertex stage a model can be drawn with, by name. */
const stages = (): Array<[string, string]> => {
    const all: Array<[string, string]> = [];
    for (const cull of CULLS) {
        all.push([`built-in, ${cull}`, meshVertexGlsl(cull)]);
        all.push([`built-in with bones, ${cull}`, skinnedVertexGlsl(cull)]);
        for (const skinned of [false, true]) {
            const bones = skinned ? ' with bones' : '';
            all.push([`material${bones}, ${cull}`, buildMeshMaterialShaderGlsl(null, null, {}, [], skinned, cull).vertex]);
            // With both hooks and a map: the hooks add no rows of their own, and this is what pins it.
            const hooked = buildMeshMaterialShaderGlsl(
                'vec4 effect(vec4 surface, FragContext ctx) { return surface * ctx.carry; }',
                'vec3 vertex(vec3 pos, VertContext ctx) { carry = vec4(pos, 1.0); return pos; }',
                { strength: 'f32' },
                ['dissolve'],
                skinned,
                cull,
            );
            all.push([`material with hooks${bones}, ${cull}`, hooked.vertex]);
        }
    }
    for (const skinned of [false, true]) {
        const bones = skinned ? ' with bones' : '';
        all.push([`material shadow${bones}`, buildMeshMaterialShadowShaderGlsl(null, {}, skinned).vertex]);
        all.push([`material shadow cut out${bones}`, buildMeshMaterialShadowShaderGlsl(null, {}, skinned, { fragment: null, mapNames: [] }).vertex]);
    }
    return all;
};

describe('what a model hands from its corners to its pixels on WebGL2', () => {
    it('counts rows the way the card does', () => {
        expect(rowsOf([4, 4])).toBe(2);
        // A single number goes in the column a three-wide leaves.
        expect(rowsOf([3, 3, 1])).toBe(2);
        // Two two-wides share a row, and a third starts another.
        expect(rowsOf([2, 2, 2])).toBe(2);
        expect(rowsOf([1, 1, 1, 1, 1])).toBe(2);
    });

    it('fits in the 15 rows WebGL2 promises, every way a model can be drawn', () => {
        const over = stages()
            .map(([name, vertex]) => ({ name, rows: rowsOf(outputsOf(vertex)) }))
            .filter(({ rows }) => rows > ROWS);
        expect(over).toEqual([]);
    });

    it('leaves one row in a material drawn on both sides, with the second picture in spare columns', () => {
        // Six four-wides (the colour, the tangent, carry and the three of the far side's light), seven
        // three-wides, two of them carrying the second picture's place in their fourth column, and the
        // fog in another's: fourteen. Anything new past one row more has to find a spare column, or
        // the material stops compiling on the phones that give 15.
        const vertex = buildMeshMaterialShaderGlsl(null, null, {}, [], false, 'none').vertex;
        expect(rowsOf(outputsOf(vertex))).toBe(14);
        expect(rowsOf(outputsOf(buildMeshMaterialShaderGlsl(null, null, {}, [], false, 'back').vertex))).toBe(12);
    });
});
