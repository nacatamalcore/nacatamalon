import { describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createMesh } from '../src/gameobjects/mesh/create_mesh';
import { useCubeGeometry } from '../src/hooks/geometry/use_cube_geometry';
import { parseSceneDoc, sceneFromDoc, serializeScene } from '../src/scene/document';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TMeshMaterialDoc } from '../src/scene/document/types/t_component_doc';
import { compileShader } from '../src/shader_composer/compile_shader';
import { composerSurface } from '../src/shader_composer/inputs';
import { lookKnobs } from '../src/shader_composer/surface/compose_surface';
import { MATERIAL_LOOKS, mangaDots, rim, toon, toonLighting, unlit, unlitLighting } from '../src/shader_composer/surface/looks';
import { createMaterial } from '../src/gameobjects/material/create_material';
import type { TLook } from '../src/shader_composer/surface/types';
import type { TMeshMaterial, TMeshMaterialOptions } from '../src/materials';

/**
 * Looks: how a model's surface is lit (one), and what is done to it after (any number, in order).
 * Each is plain data that a material turns into a shader through the composer, so every one has to
 * come out in both languages, alone and with the others.
 */

const looked = (lighting?: TLook, steps?: TLook[]) => compileShader({ shader: 'mesh3d', lighting, steps });

describe('each look', () => {
    it('is plain data with its defaults', () => {
        expect(toonLighting()).toEqual({ look: 'toon', bands: 2, shadow: 0.45, spot: 0.75 });
        expect(unlitLighting()).toEqual({ look: 'unlit' });
        expect(mangaDots()).toEqual({ look: 'mangaDots', spacing: 5, size: 0.3, ink: [0.16, 0.1, 0.26] });
        expect(rim({ color: '#ff0000' })).toMatchObject({ look: 'rim', color: [1, 0, 0], power: 4, strength: 0.7 });
    });

    it('keeps the names the lighting looks had in 0.2.4, making the same looks', () => {
        expect(toon({ bands: 3 })).toEqual(toonLighting({ bands: 3 }));
        expect(unlit()).toEqual(unlitLighting());
    });

    it('is refused by the types in the wrong slot, and again when the game runs', () => {
        // @ts-expect-error a lighting look is not a step
        expect(() => createMaterial({ shader: 'mesh3d', steps: [toonLighting()] })).toThrow(/goes in lighting/);
        // @ts-expect-error a step is not a lighting look
        expect(() => createMaterial({ shader: 'mesh3d', lighting: rim() })).toThrow(/goes in steps/);
        // @ts-expect-error an option createMaterial does not have
        createMaterial({ fragment: 'fn effect(c: vec4<f32>, uv: vec2<f32>) -> vec4<f32> { return c; }', tintt: 1 });
    });

    it('names the call to write when a look is in the wrong slot', () => {
        expect(() => looked(undefined, [toonLighting()])).toThrow(/toonLighting\(\), and goes in lighting/);
        expect(() => looked(mangaDots())).toThrow(/mangaDots\(\) goes in steps/);
    });

    it('comes out in both languages, alone and together', () => {
        const combos: [TLook | undefined, TLook[] | undefined][] = [
            [toonLighting(), undefined],
            [unlitLighting(), undefined],
            [undefined, [mangaDots()]],
            [undefined, [rim()]],
            [toonLighting(), [mangaDots(), rim()]],
            [unlitLighting(), [rim()]],
        ];
        for (const [lighting, steps] of combos) {
            const out = looked(lighting, steps);
            expect(out.fragment).toContain('fn effect(surface: vec4<f32>, ctx: FragContext)');
            expect(out.fragmentGlsl).toContain('vec4 effect(vec4 surface, FragContext ctx)');
        }
    });

    it('turns its numbers into knobs named after it, with its values', () => {
        expect(looked(toonLighting({ shadow: 0.8 })).uniforms).toEqual({ toonBands: 2, toonShadow: 0.8, toonSpot: 0.75 });
        expect(looked(undefined, [mangaDots(), rim()]).uniforms).toMatchObject({
            mangaDotsSpacing: 5, mangaDotsSize: 0.3, mangaDotsInk: [0.16, 0.1, 0.26],
            rimColor: [1, 1, 1], rimPower: 4, rimStrength: 0.7,
        });
    });

    it('numbers a step used twice from the second on, so the two can be turned apart', () => {
        const knobs = Object.keys(looked(undefined, [rim(), rim({ color: '#00ff00' })]).uniforms);
        expect(knobs).toContain('rimColor');
        expect(knobs).toContain('rim2Color');
        expect(looked(undefined, [rim(), rim({ color: '#00ff00' })]).uniforms.rim2Color).toEqual([0, 1, 0]);
    });
});

describe('how they go together', () => {
    it('without a lighting look, starts from the engine\'s own light, what it gives off included', () => {
        const out = looked(undefined, [rim()]);
        expect(out.fragment).toContain('ctx.light');
        expect(out.fragment).toContain('ctx.shine');
        expect(out.fragment).toContain('ctx.emissive');
    });

    it('lays the dots out on the screen', () => {
        expect(looked(undefined, [mangaDots()]).fragment).toContain('ctx.screen');
        expect(looked(undefined, [mangaDots()]).fragmentGlsl).toContain('ctx.screen');
    });

    it('cuts only the brightness into bands, keeping the colour of the light', () => {
        // The light is divided by its strongest channel and scaled by the band: a red lamp gives red
        // bands, a white one the greys it always gave. Not a grey made of the brightness alone.
        const out = looked(toonLighting());
        for (const code of [out.fragment!, out.fragmentGlsl!]) {
            expect(code).toMatch(/ctx\.light \+/);
            expect(code).toMatch(/max\(max\(/);
        }
        expect(out.fragment).not.toContain('vec3<f32>(1.0, 1.0, 1.0) * mix(');
    });

    it('puts the dots where toon put its shadow, and on the light without it', () => {
        // After toon, the dots read its bands (the floor of the light), not a smooth ramp.
        const after = looked(toonLighting(), [mangaDots()]).fragment!;
        expect(after).toContain('floor(');
        expect(after).not.toContain('smoothstep(');
        const alone = looked(undefined, [mangaDots()]).fragment!;
        expect(alone).toContain('smoothstep(');
    });

    it('lights nothing when unlit', () => {
        const out = looked(unlitLighting()).fragment!;
        expect(out).not.toContain('ctx.light');
        expect(out).not.toContain('ctx.shine');
    });
});

describe('what is refused', () => {
    it('a step as the lighting, and a lighting look among the steps', () => {
        expect(() => looked(rim())).toThrow(/'rim' is not a lighting look.*goes in steps/);
        expect(() => looked(undefined, [toonLighting()])).toThrow(/'toon' is not a step.*goes in lighting/);
    });

    it('a look the engine does not have', () => {
        expect(() => looked({ look: 'glass' } as unknown as TLook)).toThrow(/no look by that name/);
    });

    it('looks on a sprite, and looks with a colour of their own', () => {
        expect(() => compileShader({ shader: 'sprite2d', lighting: toonLighting() } as never)).toThrow(/need shader: 'mesh3d'/);
        expect(() => compileShader({ shader: 'mesh3d', color: composerSurface(), lighting: toonLighting() })).toThrow(/takes no "color"/);
    });
});

describe('the knobs, by name', () => {
    it('says where each knob lives in the looks, a second step of a kind numbered', () => {
        expect(lookKnobs(toonLighting(), [rim(), rim()])).toEqual([
            { uniform: 'toonBands', slot: 'lighting', field: 'bands' },
            { uniform: 'toonShadow', slot: 'lighting', field: 'shadow' },
            { uniform: 'toonSpot', slot: 'lighting', field: 'spot' },
            { uniform: 'rimColor', slot: 0, field: 'color' },
            { uniform: 'rimPower', slot: 0, field: 'power' },
            { uniform: 'rimStrength', slot: 0, field: 'strength' },
            { uniform: 'rim2Color', slot: 1, field: 'color' },
            { uniform: 'rim2Power', slot: 1, field: 'power' },
            { uniform: 'rim2Strength', slot: 1, field: 'strength' },
        ]);
    });

    it('names them as the shader does', () => {
        const knobs = lookKnobs(toonLighting(), [mangaDots(), rim(), rim()]).map((k) => k.uniform).sort();
        expect(Object.keys(looked(toonLighting(), [mangaDots(), rim(), rim()]).uniforms).sort()).toEqual(knobs);
    });
});

describe('the catalogue', () => {
    it('lists every look once, in its slot, built with its defaults', () => {
        expect(MATERIAL_LOOKS.map((info) => [info.key, info.slot])).toEqual([
            ['toon', 'lighting'], ['unlit', 'lighting'], ['mangaDots', 'step'], ['rim', 'step'],
        ]);
        for (const info of MATERIAL_LOOKS) {
            expect(info.build().look).toBe(info.key);
        }
    });
});

describe('a material made with looks', () => {
    it('carries their shader in both languages, their knobs, and the looks themselves', () => {
        const material = createMaterial({ shader: 'mesh3d', lighting: toonLighting(), steps: [mangaDots()] }) as TMeshMaterial;
        expect(material.fragment).toContain('ctx.screen');
        expect(material.fragmentGlsl).toContain('ctx.screen');
        expect(material.uniforms).toMatchObject({ toonShadow: 0.45, mangaDotsSpacing: 5 });
        expect(material.uniformSig).toMatchObject({ toonShadow: 'f32', mangaDotsInk: 'vec3<f32>' });
        expect(material.lighting).toEqual(toonLighting());
        expect(material.steps).toEqual([mangaDots()]);
    });

    it('keeps the knobs it was handed over the looks\' own, in the same bag', () => {
        const knobs = { toonShadow: 0.9 };
        const material = createMaterial({ shader: 'mesh3d', lighting: toonLighting(), uniforms: knobs });
        expect(material.uniforms).toBe(knobs);
        expect(material.uniforms.toonShadow).toBe(0.9);
        expect(material.uniforms.toonBands).toBe(2);
    });

    it('is a plain material without them, with nothing written for them', () => {
        const material = createMaterial({ shader: 'mesh3d' }) as TMeshMaterial;
        expect(material.fragment).toBeNull();
        expect(material).not.toHaveProperty('lighting');
        expect(material).not.toHaveProperty('steps');
    });

    it('refuses a colour hook of its own, a file, and a sprite', () => {
        expect(() => createMaterial({ shader: 'mesh3d', lighting: toonLighting(), fragment: 'fn effect(s: vec4<f32>, ctx: FragContext) -> vec4<f32> { return s; }' }))
            .toThrow(/no fragment or effect of its own/);
        expect(() => createMaterial({ lighting: toonLighting() } as never)).toThrow(/need shader: 'mesh3d'/);
    });

    it('takes a corner hook beside them', () => {
        const vertex = 'fn vertex(pos: vec3<f32>, ctx: VertContext) -> vec3<f32> { return pos; }';
        const material = createMaterial({ shader: 'mesh3d', lighting: unlitLighting(), vertex });
        expect(material.vertex).toBe(vertex);
        expect(material.fragment).toContain('fn effect(');
    });
});

describe('a scene with looks, written down', () => {
    const written = (material: TMeshMaterialOptions) => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            createMesh({ geometry: useCubeGeometry(), material: createMaterial(material as never) as TMeshMaterial });
            return createScene();
        });
        return serializeScene(root);
    };
    const materialOf = (doc: ReturnType<typeof written>) => {
        const mesh = doc.root.components.find((c) => c.type === 'mesh');
        return mesh?.type === 'mesh' ? mesh.material : undefined;
    };

    it('keeps the looks as data and not the shader they made, and reads them back the same', () => {
        const doc = written({ shader: 'mesh3d', lighting: toonLighting({ bands: 3 }), steps: [mangaDots(), rim()] });
        const surface = materialOf(doc)!;
        expect(surface.lighting).toEqual(toonLighting({ bands: 3 }));
        expect(surface.steps).toEqual([mangaDots(), rim()]);
        expect(surface.fragment).toBeNull();
        expect(surface.fragmentGlsl).toBeNull();
        // Their knobs are written in the looks, once, and not again among the uniforms.
        expect(surface.uniforms).toBeNull();
        expect(parseSceneDoc(doc, '/scenes/level.scene')).toEqual(doc);
    });

    it('writes a knob as it is turned now into its look, and keeps the material\'s own knobs apart', () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            const material = createMaterial({ shader: 'mesh3d', lighting: toonLighting(), steps: [rim(), rim()], uniforms: { wobble: 2 } }) as TMeshMaterial;
            material.uniforms!.toonShadow = 0.2;
            material.uniforms!.rim2Color = [0, 0, 1];
            createMesh({ geometry: useCubeGeometry(), material });
            return createScene();
        });
        const surface = materialOf(serializeScene(root))!;
        expect(surface.lighting).toEqual({ ...toonLighting(), shadow: 0.2 });
        expect(surface.steps).toEqual([rim(), { ...rim(), color: [0, 0, 1] }]);
        expect(surface.uniforms).toEqual({ wobble: 2 });
    });

    it('makes the same material again when the scene is opened, knobs as they were turned', () => {
        const doc = written({ shader: 'mesh3d', lighting: toonLighting(), steps: [mangaDots()], uniforms: { toonShadow: 0.7 } });
        const { store } = createTestGame();
        const opened = startTestScene(store, 'Level', () => {
            sceneFromDoc(doc, '/scenes/level.scene')();
            return createScene();
        });
        const meshes = opened.children.flatMap((child) => child.drawables).concat(opened.drawables)
            .filter((d) => (d as { type: string }).type === 'mesh') as unknown as { material: TMeshMaterial }[];
        expect(meshes).toHaveLength(1);
        const material = meshes[0]!.material;
        // The knob turned before saving comes back in its look.
        expect(material.lighting).toEqual(toonLighting({ shadow: 0.7 }));
        expect(material.fragment).toContain('ctx.screen');
        expect(material.uniforms!.toonShadow).toBe(0.7);
        expect(serializeScene(opened).root.components).toEqual(doc.root.components);
    });

    it('writes nothing for looks a material does not have', () => {
        const surface = materialOf(written({ shader: 'mesh3d' }))!;
        expect(surface).not.toHaveProperty('lighting');
        expect(surface).not.toHaveProperty('steps');
    });

    it('leaves out a look it does not know, and fills in what a known one left out', () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const doc = written({ shader: 'mesh3d' });
        const mesh = doc.root.components.find((c) => c.type === 'mesh') as { material: Record<string, unknown> };
        mesh.material.lighting = { look: 'glass' };
        mesh.material.steps = [{ look: 'rim', power: 2 }, { look: 'toon' }];
        const read = parseSceneDoc(JSON.parse(JSON.stringify(doc)), '/scenes/level.scene');
        const surface = (read.root.components.find((c) => c.type === 'mesh') as { material: TMeshMaterialDoc }).material;
        expect(surface).not.toHaveProperty('lighting');
        expect(surface.steps).toEqual([{ ...rim(), power: 2 }]);
        expect(warn).toHaveBeenCalledTimes(2);
        warn.mockRestore();
    });
});
