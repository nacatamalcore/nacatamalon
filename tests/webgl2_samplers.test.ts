import { describe, expect, it } from 'bun:test';
import { createMeshMaterials } from '../src/render/webgl2/material/mesh_materials';
import { MESH_SHADOW_UNIT, MESH_TEXTURE_UNIT } from '../src/render/webgl2/bindings';
import type { TDrawShader } from '../src/render/interface/draw/t_draw_material';

/**
 * Which texture unit each sampler of a model program is pointed at.
 *
 * This file exists because of one bug and the way it failed. A model program declares two samplers
 * now: the picture, read as a picture, and the shadow map, read as a comparison. Leave the second
 * one unassigned and it sits on unit 0 beside the first, which this card refuses outright, throwing
 * **the whole draw** away.
 *
 * So the thing does not come out dark, or striped, or in the wrong place. It does not come out.
 * Every model with an effect of its own silently disappears, and nothing anywhere says why: the
 * shader compiled, the program linked, the frame was recorded, the console is clean.
 *
 * A unit is one integer set at build time, so nothing else would ever catch this except drawing it
 * and looking.
 */

/**
 * A context that records what each sampler was pointed at, and agrees to everything else.
 */
const recordingGl = () => {
    const units = new Map<string, number>();
    const gl = new Proxy({
        // The name comes back as the location, so what was set can be read back by name.
        getUniformLocation: (_program: unknown, name: string) => name,
        uniform1i: (name: string, unit: number) => { units.set(name, unit); },
    } as Record<string, unknown>, {
        get: (target, key: string) => (key in target ? target[key] : () => ({})),
    }) as unknown as WebGL2RenderingContext;

    return { gl, units };
};

/**
 * A material with a colour hook of its own, which is what a blob shadow's disc is.
 */
const withEffect: TDrawShader = {
    id: 'blob-shadow',
    name: 'blob-shadow',
    fragment: 'fn effect() {}',
    fragmentGlsl: 'vec4 effect(vec4 surface, FragContext ctx) { return surface; }',
    vertex: null,
    vertexGlsl: null,
    uniforms: { softness: 0.4 },
    uniformSig: { softness: 'f32' },
} as unknown as TDrawShader;

describe('a model effect compiled on WebGL2', () => {
    it('puts its two samplers on two different units, which is what lets it draw at all', () => {
        const { gl, units } = recordingGl();

        createMeshMaterials(gl).get(withEffect);

        expect(units.get('meshTexture')).toBe(MESH_TEXTURE_UNIT);
        expect(units.get('shadowMap')).toBe(MESH_SHADOW_UNIT);
        // The claim underneath both numbers, stated so that changing either one has to be deliberate.
        expect(units.get('shadowMap')).not.toBe(units.get('meshTexture'));
    });
});
