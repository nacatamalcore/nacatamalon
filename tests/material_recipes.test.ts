import { describe, expect, it } from 'bun:test';
import { createMaterial } from '../src/gameobjects/material/create_material';
import { anodized, brass, carPaint, ceramic, chrome, copper, glass, gold, hologram, matcap, neon, pearl, plastic, rubber } from '../src/materials';
import { groundBounce } from '../src/shader_composer/surface/looks';
import type { TTexture } from '../src/loaders';
import type { TMeshMaterial } from '../src/materials';

/**
 * The material recipes: nothing but options of a model's material, so what they make is what those
 * options make, and any of it can be changed with a spread.
 */

const studio: TTexture = { type: 'texture', key: 'studio', src: '', width: 1, height: 1, status: 'ready', gpu: null };

describe('the recipes', () => {
    it('are options a material takes as they are, lit at every pixel with a white shine', () => {
        for (const make of [plastic, ceramic, chrome]) {
            const options = make();
            expect(options.shader).toBe('mesh3d');
            expect(options.perPixel).toBe(true);
            expect(options.specular).toBe('#ffffff');
            // Nothing to reflect without surroundings: it shines, and reflects nothing.
            expect(options).not.toHaveProperty('reflection');
            const material = createMaterial(options) as TMeshMaterial;
            expect(material.perPixel).toBe(true);
            expect(material.reflection).toBeUndefined();
        }
    });

    it('reflect the surroundings they are given, each by its own amounts', () => {
        const made = (options: ReturnType<typeof plastic>) => (createMaterial(options) as TMeshMaterial).reflection;
        expect(made(plastic({ environment: studio }))).toEqual({ texture: studio, front: 0.04, edge: 0.9, metal: 0 });
        expect(made(ceramic({ environment: studio }))).toEqual({ texture: studio, front: 0.06, edge: 0.7, metal: 0 });
        expect(made(chrome({ environment: studio }))).toEqual({ texture: studio, front: 0.9, edge: 1, metal: 0 });
    });

    it('take a colour of their own, and open with a spread', () => {
        expect(plastic({ tint: '#2a7bd8' }).tint).toBe('#2a7bd8');
        const softer = createMaterial({ ...plastic({ environment: studio }), shininess: 20 }) as TMeshMaterial;
        expect(softer.shininess).toBe(20);
        expect(softer.reflection?.front).toBe(0.04);
    });

    it('are all made, each a material that takes them as they are', () => {
        for (const make of [plastic, ceramic, chrome, rubber, carPaint, glass, neon, pearl, hologram, gold, copper, brass, anodized]) {
            const material = createMaterial(make({ environment: studio })) as TMeshMaterial;
            expect(material.perPixel).toBe(true);
            expect(material.fragment).not.toBeNull();
        }
    });

    it('make the metals reflect and shine in their own colour, and the rest in white', () => {
        for (const make of [gold, copper, brass, anodized]) {
            const options = make({ environment: studio });
            expect(options.specular).toBe(options.tint);
            expect((createMaterial(options) as TMeshMaterial).reflection?.metal).toBe(1);
        }
        expect(anodized({ tint: '#a02ad8' }).specular).toBe('#a02ad8');
        for (const make of [rubber, carPaint, glass, pearl]) {
            expect((createMaterial(make({ environment: studio })) as TMeshMaterial).reflection?.metal).toBe(0);
        }
    });

    it('make glass and a hologram see-through, the hologram added to what is behind it', () => {
        const pane = createMaterial(glass({ environment: studio })) as TMeshMaterial;
        expect([pane.alpha, pane.transparent]).toEqual([0.2, true]);
        const ghost = createMaterial(hologram({ environment: studio })) as TMeshMaterial;
        expect([ghost.transparent, ghost.blend]).toEqual([true, 'additive']);
        // Light reflects nothing, whatever it is given.
        expect(ghost.reflection).toBeUndefined();
        expect(ghost.steps?.map((step) => step.look)).toEqual(['rim']);
    });

    it('make neon glow its own colour, and pearl turn another at its rim', () => {
        const tube = createMaterial(neon({ tint: '#3cf0ff' })) as TMeshMaterial;
        expect(tube.emissive).toEqual(tube.tint);
        expect(pearl().steps?.map((step) => step.look)).toEqual(['rim']);
    });
});

describe('the matcap', () => {
    const clay: TTexture = { type: 'texture', key: 'clay', src: '', width: 1, height: 1, status: 'ready', gpu: null };

    it('is the picture at full over no light, multiplied by the tint and the model\'s own picture', () => {
        const options = matcap(clay);
        expect(options.shader).toBe('mesh3d');
        expect(options.lighting).toEqual({ look: 'unlit' });
        expect(options).not.toHaveProperty('tint');
        const material = createMaterial(options) as TMeshMaterial;
        expect(material.reflection).toEqual({ texture: clay, front: 1, edge: 1, metal: 1 });
        expect(material.lighting).toEqual({ look: 'unlit' });
    });

    it('takes a colour to multiply it by', () => {
        expect(matcap(clay, { tint: '#3fb3b0' }).tint).toBe('#3fb3b0');
    });

    it('takes steps on top, the ground\'s bounce among them', () => {
        const material = createMaterial({ ...matcap(clay), steps: [groundBounce({ reach: 1.4 })] }) as TMeshMaterial;
        expect(material.steps?.map((step) => step.look)).toEqual(['groundBounce']);
        expect(material.uniforms).toMatchObject({ reflectionFront: 1, reflectionEdge: 1, reflectionMetal: 1, groundBounceReach: 1.4 });
    });
});
