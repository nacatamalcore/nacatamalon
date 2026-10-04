import { describe, expect, it } from 'bun:test';
import { readMaterial } from '../src/loaders/gltf/read_material';
import type { TGltfDoc } from '../src/loaders/gltf/types/t_gltf_doc';

/**
 * The colour numbers of a glTF material.
 *
 * The format stores them in linear light and this engine draws in screen colours, so they are
 * converted on the way in. The expected values are what another famous web 3D framework puts on
 * screen for the same file (measured on `Mixer/mixer.glb`): without the conversion its purple came
 * out as 108, 16, 204.
 */

const docWith = (material: NonNullable<TGltfDoc['materials']>[number]): TGltfDoc =>
    ({ asset: { version: '2.0' }, materials: [material] }) as TGltfDoc;

const to255 = (c: number): number => Math.round(c * 255);

describe('readMaterial see-through', () => {
    it('takes a blended surface as see-through, whatever its alpha', () => {
        // A picture with see-through parts is the usual reason: its colour factor stays at 1.
        expect(readMaterial(docWith({ alphaMode: 'BLEND' }), 0).transparent).toBe(true);
    });

    it('leaves a solid or a cut-out one alone', () => {
        expect(readMaterial(docWith({}), 0).transparent).toBe(false);
        expect(readMaterial(docWith({ alphaMode: 'OPAQUE' }), 0).transparent).toBe(false);
        // Cutting holes at a threshold is not blending, and this engine does not do it yet.
        expect(readMaterial(docWith({ alphaMode: 'MASK' }), 0).transparent).toBe(false);
    });
});

describe('readMaterial colours', () => {
    it('shows a base colour as another famous web 3D framework does', () => {
        const { tint } = readMaterial(docWith({ pbrMetallicRoughness: { baseColorFactor: [0.42161691188812256, 0.06374958902597427, 0.8000156879425049, 0.5] } }), 0);

        expect([to255(tint.r), to255(tint.g), to255(tint.b)]).toEqual([174, 71, 231]);
        expect(tint.a).toBe(0.5);
    });

    it('multiplies a glow by its strength before converting it', () => {
        const { emissive } = readMaterial(docWith({
            emissiveFactor: [0.1, 0.5, 0.9],
            extensions: { KHR_materials_emissive_strength: { emissiveStrength: 4 } },
        }), 0);

        expect(emissive.r).toBeCloseTo(0.6653, 3);
        expect(emissive.g).toBeGreaterThan(1);
        expect(emissive.b).toBeGreaterThan(1);
    });

    it('leaves a plain white surface white', () => {
        const { tint, emissive } = readMaterial(docWith({}), 0);

        expect(tint).toEqual({ r: 1, g: 1, b: 1, a: 1 });
        expect(emissive).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    });
});
