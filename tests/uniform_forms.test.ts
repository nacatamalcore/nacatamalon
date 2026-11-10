import { describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useSelf } from '../src/hooks/spawn/use_self';
import { useTransform } from '../src/hooks/transform/use_transform';
import { useFilter } from '../src/hooks/filter/use_filter';
import { glow, outline, zoomBlur } from '../src/post';
import { parseSceneDoc, serializeScene } from '../src/scene/document';

import { deriveSignature, withFileKinds } from '../src/materials/derive_signature';
import { uniformNumbers, uniformsAsNumbers, writeUniform } from '../src/materials/uniform_numbers';
import { buildUniformLayout, writeUniformValues } from '../src/render/shared/material_uniforms';
import { createTestGame, startTestScene } from './helpers/test_game';

/**
 * A uniform takes the forms the rest of the engine takes for the same thing: a point as `{ x, y }`,
 * a colour as text or `{ r, g, b, a }`, as well as the card's own list. What is given at the start
 * and what is written into `uniforms` afterwards are the same forms.
 *
 * Pinned here: what each form becomes on the card, how many numbers a uniform is when nothing else
 * says, and that a file keeps numbers whatever form the game used.
 */

const numbers = (value: Parameters<typeof writeUniform>[3], count: number): number[] => {
    const out = new Float32Array(count);
    writeUniform(out, 0, count, value);
    return Array.from(out, (n) => Math.round(n * 1000) / 1000);
};

describe('a uniform given as a point or a colour', () => {
    it('becomes the card\'s numbers, as many as the uniform has', () => {
        expect(numbers({ x: 0.2, y: 0.8 }, 2)).toEqual([0.2, 0.8]);
        expect(numbers({ x: 1, y: 2 }, 3)).toEqual([1, 2, 0]);
        expect(numbers({ x: 1, y: 2, z: 3, w: 4 }, 4)).toEqual([1, 2, 3, 4]);
        expect(numbers('#ff8000', 3)).toEqual([1, 0.502, 0]);
        expect(numbers('#ff8000', 4)).toEqual([1, 0.502, 0, 1]);
        expect(numbers({ r: 0, g: 1, b: 0, a: 0.5 }, 4)).toEqual([0, 1, 0, 0.5]);
        // The card's own forms as before, a list longer than the uniform cut to it.
        expect(numbers([0.1, 0.2], 2)).toEqual([0.1, 0.2]);
        expect(numbers([1, 0, 0, 1], 3)).toEqual([1, 0, 0]);
        expect(numbers(7, 1)).toEqual([7]);
    });

    it('is as many numbers as it has when nothing else says: a point by its letters, a colour four', () => {
        expect(deriveSignature({ center: { x: 0.5, y: 0.5 }, at: { x: 0, y: 0, z: 0 }, tint: '#ffffff', glow: { r: 1, g: 1, b: 1, a: 1 }, amount: 1 })).toEqual({
            center: 'vec2<f32>', at: 'vec3<f32>', tint: 'vec4<f32>', glow: 'vec4<f32>', amount: 'f32',
        });
        expect(() => deriveSignature({ odd: { width: 3 } as never })).toThrow(/a point \(\{ x, y \}\) or a colour/);
    });

    it('keeps the kind a file declares, and takes the call site\'s only for what it added', () => {
        const file = { tint: 'vec3<f32>' as const, at: 'vec3<f32>' as const };
        const asked = deriveSignature({ tint: '#ff0000', at: { x: 1, y: 2 }, extra: '#00ff00' });
        expect(withFileKinds(file, asked)).toEqual({ tint: 'vec3<f32>', at: 'vec3<f32>', extra: 'vec4<f32>' });
    });

    it('refuses text that is not a colour where it is given, and leaves the uniform as it was if set to it later', () => {
        expect(() => deriveSignature({ tint: 'oragne' })).toThrow(/a point \(\{ x, y \}\) or a colour/);

        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const out = new Float32Array([0.5, 0.5, 0.5]);
        writeUniform(out, 0, 3, 'not-a-colour-at-all');
        writeUniform(out, 0, 3, 'not-a-colour-at-all');
        expect(Array.from(out)).toEqual([0.5, 0.5, 0.5]);
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });

    it('is one number, not a list of one, when the uniform is one number, and a point is kept exactly', () => {
        expect(uniformsAsNumbers({ a: { x: 2, y: 3 } }, { a: 'f32' })).toEqual({ a: 2 });
        expect(uniformNumbers({ x: 1234.56789, y: 1e-7 })).toEqual([1234.56789, 1e-7]);
        // A colour missing its alpha is opaque, and a list never spills into the next uniform.
        expect(numbers({ r: 1, g: 0, b: 0 } as never, 4)).toEqual([1, 0, 0, 1]);
        const out = new Float32Array([9, 9, 9]);
        writeUniform(out, 0, 2, [1, 2, 3, 4]);
        expect(Array.from(out)).toEqual([1, 2, 9]);
    });

    it('reaches the card where the layout puts it, written into an effect after it was made', () => {
        const effect = zoomBlur({ center: { x: 0.5, y: 0.5 } });
        const layout = buildUniformLayout(effect.uniformSig);
        const out = new Float32Array(layout.floatCount);

        effect.uniforms.center = { x: 0.25, y: 0.75 };
        writeUniformValues(out, layout, effect.uniforms, 0, 320, 240);
        expect(Array.from(out.subarray(layout.offsets.center!, layout.offsets.center! + 2))).toEqual([0.25, 0.75]);

        const shine = glow();
        const shineLayout = buildUniformLayout(shine.uniformSig);
        shine.uniforms.color = '#0000ff';
        writeUniformValues(out, shineLayout, shine.uniforms, 0, 320, 240);
        expect(Array.from(out.subarray(shineLayout.offsets.color!, shineLayout.offsets.color! + 3))).toEqual([0, 0, 1]);
    });

    it('is written to a file as numbers, as many as the uniform has, and read back the same', () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useSpawn(() => {
                useTransform({ x: 10, y: 10 });
                createSprite({ width: 4, height: 4 });
                const filter = useFilter({ effects: [outline({ thickness: 2 })] });
                filter.add(useSelf());
                filter.effects[0]!.uniforms.color = '#00ff00';
            }, { name: 'Hero' })();
            return createScene();
        });

        const doc = serializeScene(root);
        const component = doc.root.children[0]!.components.find((c) => c.type === 'filter') as { effects: { uniforms: Record<string, unknown> }[] };
        expect(component.effects[0]!.uniforms).toEqual({ color: [0, 1, 0], thickness: 2 });
        expect(parseSceneDoc(doc, '/scenes/level.scene')).toEqual(doc);
        expect(uniformNumbers({ x: 3, y: 4 })).toEqual([3, 4]);
    });
});
