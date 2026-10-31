import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createMesh } from '../src/gameobjects/mesh/create_mesh';
import { createModel } from '../src/gameobjects/model';
import { createMaterial } from '../src/gameobjects/material/create_material';
import { useCubeGeometry } from '../src/hooks/geometry/use_cube_geometry';
import { useLoadGltf } from '../src/hooks/loaders/use_load_gltf';
import { useLoadTexture } from '../src/hooks/loaders/use_load_texture';
import { releaseAsset, whenLoaded } from '../src/loaders';
import { readMaterial } from '../src/loaders/gltf/read_material';
import { parseSceneDoc, sceneFromDoc, serializeScene } from '../src/scene/document';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { fillMeshUniforms, MESH_UNIFORM_FLOATS } from '../src/render/shared';
import { fillCameraSpace, newCameraSpace } from '../src/render/shared/compute_mvp_3d';
import { occlusionWrapOf } from '../src/render/shared/texture_wrap';
import { meshShaderFor } from '../src/render/webgpu/mesh/mesh_shader';
import { skinnedShaderFor } from '../src/render/webgpu/mesh/skinned_shader';
import { buildMeshMaterialShader, buildMeshMaterialShadowShader } from '../src/render/webgpu/material/mesh_material_shader';
import { meshFragmentGlsl, meshVertexGlsl } from '../src/render/webgl2/mesh/mesh_shader';
import { skinnedVertexGlsl } from '../src/render/webgl2/mesh/skinned_shader';
import { buildMeshMaterialShaderGlsl, buildMeshMaterialShadowShaderGlsl } from '../src/render/webgl2/material/mesh_material_shader';
import { compileShader } from '../src/shader_composer/compile_shader';
import { composerOcclusion, composerVec4 } from '../src/shader_composer';
import { createTestGame, startTestScene } from './helpers/test_game';
import { asGltf, serveGltf, TEST_QUAD } from './helpers/test_gltf';
import type { TGltfDoc } from '../src/loaders/gltf/types/t_gltf_doc';
import type { TGltfModel, TTexture } from '../src/loaders';
import type { TDrawMesh } from '../src/render/interface';
import type { TMesh } from '../src/gameobjects/mesh';
import type { TModel } from '../src/gameobjects/model';
import type { TMaterialOcclusion, TMeshMaterial } from '../src/materials';
import type { TTestModel } from './helpers/test_gltf';

/**
 * A model's occlusion: where its creases keep the light from all around out, the shading its author
 * saw in the modelling program.
 *
 * It lowers the ambient floor and nothing else, by the first picture coordinate or the second, on
 * both cards, through the built-in drawing and a material's, and it comes from a file, from code and
 * from a saved scene. That it looks right is checked in a browser and against the native runtimes.
 */

afterEach(() => { mock.restore(); });

const texture = (key: string): TTexture => ({ type: 'texture', key, src: '', width: 1, height: 1, status: 'ready', gpu: null });

const CULLS = ['back', 'front', 'none'] as const;

describe('a model file', () => {
    const doc = (occlusionTexture: Record<string, number> | undefined): TGltfDoc => ({
        asset: { version: '2.0' },
        materials: [{ ...(occlusionTexture !== undefined ? { occlusionTexture } : {}) }],
        textures: [{ source: 0 }],
        images: [{ uri: 'ao.png' }],
    } as unknown as TGltfDoc);

    it('says where its creases are, all of it by the first picture coordinate unless it says otherwise', () => {
        expect(readMaterial(doc({ index: 0 }), 0).occlusion).toEqual({
            image: { uri: 'ao.png', bufferView: undefined, type: 'image/png' },
            strength: 1,
            uv: 'uv',
        });
        expect(readMaterial(doc({ index: 0, strength: 0.4, texCoord: 1 }), 0).occlusion).toMatchObject({ strength: 0.4, uv: 'uv2' });
    });

    it('reads its own edges from its own sampler, which need not be the colour picture\'s', () => {
        const file = {
            asset: { version: '2.0' },
            materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } }, occlusionTexture: { index: 1 } }],
            textures: [{ source: 0, sampler: 0 }, { source: 1, sampler: 1 }],
            samplers: [{ wrapS: 10497, wrapT: 10497 }, { wrapS: 33071, wrapT: 33648 }],
            images: [{ uri: 'color.png' }, { uri: 'ao.png' }],
        } as unknown as TGltfDoc;
        const surface = readMaterial(file, 0);
        expect(surface.wrap).toEqual({ u: 'repeat', v: 'repeat' });
        expect(surface.occlusion?.wrap).toEqual({ u: 'clamp', v: 'mirror' });
    });

    it('says nothing of its edges when they are the colour picture\'s, so a game\'s wrap reaches both', () => {
        const file = {
            asset: { version: '2.0' },
            materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } }, occlusionTexture: { index: 1 } }],
            textures: [{ source: 0, sampler: 0 }, { source: 1, sampler: 0 }],
            samplers: [{ wrapS: 33071, wrapT: 33071 }],
            images: [{ uri: 'color.png' }, { uri: 'ao.png' }],
        } as unknown as TGltfDoc;
        expect(readMaterial(file, 0).occlusion?.wrap).toBeUndefined();
    });

    it('keeps its strength from 0 to 1, as the format does, and one that is not a number as all of it', () => {
        expect(readMaterial(doc({ index: 0, strength: 3 }), 0).occlusion?.strength).toBe(1);
        expect(readMaterial(doc({ index: 0, strength: -1 }), 0).occlusion?.strength).toBe(0);
        expect(readMaterial(doc({ index: 0, strength: Number.NaN }), 0).occlusion?.strength).toBe(1);
    });

    it('has none when it says nothing, and none, said, when laid out by a coordinate past the second', () => {
        expect(readMaterial(doc(undefined), 0).occlusion).toBeNull();
        expect(readMaterial(doc({ index: 4 }), 0).occlusion).toBeNull();

        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        const third = doc({ index: 0, texCoord: 2 });
        expect(readMaterial(third, 0).occlusion).toBeNull();
        expect(String(warn.mock.calls[0]?.[0])).toContain('picture coordinate 2');
        // Every piece of a file reads its surface, and the file says it once.
        readMaterial(third, 0);
        expect(warn).toHaveBeenCalledTimes(1);
    });
});

describe('a model loaded from a file', () => {
    const load = async (model: TTestModel, extra: Record<string, unknown> = {}) => {
        const { json, bin } = asGltf(model);
        const served = serveGltf({ 'model.gltf': json, 'model.bin': bin, ...extra });
        const { store } = createTestGame();
        let loaded!: TGltfModel;
        startTestScene(store, 'Level', () => {
            loaded = useLoadGltf({ src: 'model.gltf' });
            return createScene();
        });
        await whenLoaded(loaded);
        served.restore();
        return { model: loaded, store };
    };

    it('carries its occlusion on to each piece it is on', async () => {
        const { model } = await load(
            {
                nodes: [{ name: 'Bottle', primitives: [{ ...TEST_QUAD, material: 0 }] }],
                materials: [{ image: 'bottle.png', occlusion: { image: 'ao.png', strength: 0.5, texCoord: 1 } }],
            },
            { 'bottle.png': 'png', 'ao.png': 'png' },
        );
        const occlusion = model.parts[0]!.occlusion;
        expect(occlusion?.texture.status).toBe('ready');
        expect(occlusion?.texture).not.toBe(model.parts[0]!.texture);
        expect(occlusion).toMatchObject({ strength: 0.5, uv: 'uv2' });
        expect(occlusion?.wrap).toBeUndefined();
    });

    it('reads one picture once when it is both the colour and the occlusion, and lets it go once', async () => {
        const { model, store } = await load({
            nodes: [{ name: 'Crate', primitives: [{ ...TEST_QUAD, material: 0 }] }],
            materials: [{ embeddedImage: 'packed', occlusion: { sameAsColor: true } }],
        });
        const part = model.parts[0]!;
        expect(part.occlusion?.texture).toBe(part.texture!);

        releaseAsset(store, model);
        expect(part.texture!.status).toBe('released');
    });

    it('puts it on the model made from it, which a material then draws', async () => {
        const { model, store } = await load(
            {
                nodes: [{ name: 'Bottle', primitives: [{ ...TEST_QUAD, material: 0 }] }],
                materials: [{ occlusion: { image: 'ao.png' } }],
            },
            { 'ao.png': 'png' },
        );
        let made!: TModel;
        startTestScene(store, 'Shelf', () => {
            made = createModel({ model });
            return createScene();
        });
        const mesh = made.parts[0]!;
        expect(mesh.material.occlusion?.texture).toBe(model.parts[0]!.occlusion!.texture);
        expect(mesh.material.occlusion?.uv).toBe('uv');
    });
});

describe('a material given one in code', () => {
    const made = (occlusion: TTexture | TMaterialOcclusion | undefined): TMeshMaterial => {
        const { store } = createTestGame();
        let material!: TMeshMaterial;
        startTestScene(store, 'S', () => {
            material = createMaterial({ shader: 'mesh3d', ...(occlusion !== undefined ? { occlusion } : {}) }) as TMeshMaterial;
            return createScene();
        });
        return material;
    };

    it('keeps the picture alone in the long form, and the long form as it is', () => {
        const ao = texture('ao');
        expect(made(ao).occlusion).toEqual({ texture: ao });
        expect(made({ texture: ao, strength: 0.3, uv: 'uv2' }).occlusion).toEqual({ texture: ao, strength: 0.3, uv: 'uv2' });
    });

    it('has none at all when it asked for none, so it saves as before', () => {
        expect('occlusion' in made(undefined)).toBe(false);
    });

    it('refuses a strength outside 0 to 1, a coordinate it has no name for, and a long form with no picture', () => {
        expect(() => made({ texture: texture('ao'), strength: 2 })).toThrow('occlusion.strength');
        expect(() => made({ texture: texture('ao'), uv: 'uv3' as 'uv2' })).toThrow('occlusion.uv');
        expect(() => made({ strength: 0.5 } as TMaterialOcclusion)).toThrow('occlusion has no picture');
        expect(() => made({ texture: texture('ao'), wrap: 'clmap' as 'clamp' })).toThrow('occlusion.wrap');
        expect(() => made({ texture: texture('ao'), wrap: { u: 'clamp', v: 'sideways' } as unknown as 'clamp' })).toThrow('occlusion.wrap');
    });

    it('refuses a wrap it has no word for on the material and its maps too, not only on its occlusion', () => {
        const { store } = createTestGame();
        startTestScene(store, 'S', () => {
            expect(() => createMaterial({ shader: 'mesh3d', wrap: 'tile' as 'repeat' })).toThrow("wrap is \"tile\"");
            expect(() => createMaterial({ shader: 'mesh3d', maps: { noise: { texture: texture('n'), wrap: 'tile' as 'repeat' } } })).toThrow("the map 'noise' wrap");
            expect(() => createMaterial({ shader: 'mesh3d', wrap: { u: 'clamp', v: 'mirror' } })).not.toThrow();
            return createScene();
        });
    });

    it('takes null as none, the way a material of its own says it', () => {
        expect('occlusion' in made(null as unknown as undefined)).toBe(false);
    });

    it('is what createMesh builds when given one', () => {
        const { store } = createTestGame();
        const ao = texture('ao');
        let mesh!: TMesh;
        startTestScene(store, 'S', () => {
            mesh = createMesh({ geometry: useCubeGeometry(), occlusion: { texture: ao, strength: 0.5 } });
            return createScene();
        });
        expect(mesh.material.occlusion).toEqual({ texture: ao, strength: 0.5 });
    });
});

describe('what an occlusion picture does past its edge', () => {
    it('is its own when it says, and the colour picture\'s when it does not', () => {
        const ao = texture('ao');
        expect(occlusionWrapOf({ wrap: 'clamp', occlusion: { texture: ao } })).toEqual({ u: 'clamp', v: 'clamp' });
        expect(occlusionWrapOf({ wrap: 'clamp', occlusion: { texture: ao, wrap: 'repeat' } })).toEqual({ u: 'repeat', v: 'repeat' });
        expect(occlusionWrapOf({ occlusion: { texture: ao, wrap: { u: 'mirror', v: 'clamp' } } })).toEqual({ u: 'mirror', v: 'clamp' });
        expect(occlusionWrapOf({})).toEqual({ u: 'repeat', v: 'repeat' });
    });
});

describe('the numbers a model is drawn with', () => {
    const at = { x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 };
    const drawMesh = (occlusion?: TMaterialOcclusion): TDrawMesh => ({
        type: 'mesh',
        geometry: null,
        transform: at,
        skeleton: null,
        material: {
            id: 'm', name: null,
            fragment: null, fragmentGlsl: null, vertex: null, vertexGlsl: null,
            uniforms: null, uniformSig: null,
            texture: null,
            tint: { r: 1, g: 1, b: 1, a: 1 },
            emissive: { r: 0, g: 0, b: 0, a: 1 },
            specular: { r: 0, g: 0, b: 0, a: 1 },
            shininess: 32,
            alpha: 1,
            ...(occlusion !== undefined ? { occlusion } : {}),
        },
    });
    const filled = (occlusion?: TMaterialOcclusion): Float32Array => {
        const out = new Float32Array(MESH_UNIFORM_FLOATS);
        // Something in the spare places first, so a test sees them written and not left at zero.
        out.fill(7);
        fillMeshUniforms(out, 0, drawMesh(occlusion), fillCameraSpace(newCameraSpace(), null, 320, 240));
        return out;
    };

    it('carry how much of it, in a spare place of the turning matrix: zero for a model with none', () => {
        expect(filled()[35]).toBe(0);
        expect(filled({ texture: texture('ao') })[35]).toBe(1);
        expect(filled({ texture: texture('ao'), strength: 0.25 })[35]).toBe(0.25);
        // One changed after the material was made is kept from 0 to 1 all the same.
        expect(filled({ texture: texture('ao'), strength: 3 })[35]).toBe(1);
        expect(filled({ texture: texture('ao'), strength: -1 })[35]).toBe(0);
        expect(filled({ texture: texture('ao'), strength: Number.NaN })[35]).toBe(1);
    });

    it('carry which coordinate lays it out in the next spare place, and nothing in the third', () => {
        expect(filled({ texture: texture('ao') })[39]).toBe(0);
        expect(filled({ texture: texture('ao'), uv: 'uv2' })[39]).toBe(1);
        expect(filled()[43]).toBe(0);
    });

    it('leave the turning itself alone, which only reads the first three numbers of each column', () => {
        const plain = filled();
        const shaded = filled({ texture: texture('ao'), strength: 0.5, uv: 'uv2' });
        for (const i of [32, 33, 34, 36, 37, 38, 40, 41, 42]) {
            expect(shaded[i]).toBe(plain[i]!);
        }
    });
});

/**
 * The places a vertex output hands across, counted. A card promises sixteen.
 */
const locationsOf = (wgsl: string): number[] => {
    const struct = wgsl.slice(wgsl.indexOf('struct VertexOutput {'));
    const body = struct.slice(0, struct.indexOf('};'));
    return [...body.matchAll(/@location\((\d+)\)/g)].map((match) => Number(match[1]));
};

/** The varyings a GLSL vertex hands on, counted. This card promises fifteen. */
const varyingsOf = (glsl: string): number => [...glsl.matchAll(/^out (?:vec[234]|float) \w+;/gm)].length;

describe('the built-in drawing', () => {
    it('lowers the ambient floor by it, and nothing else, on both cards', () => {
        for (const cull of CULLS) {
            for (const wgsl of [meshShaderFor(cull), skinnedShaderFor(cull)]) {
                expect(wgsl).toContain('@group(1) @binding(3) var meshOcclusion: texture_2d<f32>;');
                expect(wgsl).toContain('lights.ambient.rgb * occlusionAt(uv)');
            }
            expect(meshFragmentGlsl(cull)).toContain('uniform sampler2D meshOcclusion;');
            expect(meshFragmentGlsl(cull)).toContain('lights.ambient.rgb * occlusionAt(uv)');
        }
    });

    it('reads it as wide open where a model has none: one minus nothing', () => {
        const wgsl = meshShaderFor('back');
        expect(wgsl).toContain('return 1.0 + uniforms.normalMatrix[0].w * (textureSampleLevel(meshOcclusion, occlusionSampler, uv, 0.0).r - 1.0);');
        // Its own sampler, beside its picture, so its edges are its own.
        expect(wgsl).toContain('@group(1) @binding(4) var occlusionSampler: sampler;');
        expect(meshFragmentGlsl('back')).toContain('return 1.0 + uniforms.normalMatrix[0].w * (textureLod(meshOcclusion, uv, 0.0).r - 1.0);');
    });

    it('reads the second picture coordinate only in the set made for it, at a place nothing else takes', () => {
        for (const cull of CULLS) {
            expect(meshShaderFor(cull)).not.toContain('@location(7) uv2');
            for (const wgsl of [meshShaderFor(cull, true), skinnedShaderFor(cull, true)]) {
                expect(wgsl).toContain('@location(7) uv2: vec2<f32>,');
                // Stretched as the first coordinate is, and divided by the same depth at the pixel, so
                // with affine the occlusion swims with the colour rather than sliding across it.
                expect(wgsl).toContain('out.uv2 = affineUv(uv2, out.position).xy;');
                expect(wgsl).toContain('lights.ambient.rgb * occlusionAt(in.uv2 / in.uv.z)');
                const places = locationsOf(wgsl);
                expect(new Set(places).size).toBe(places.length);
                expect(Math.max(...places)).toBeLessThan(16);
            }

            expect(meshVertexGlsl(cull)).not.toContain('aUv2');
            for (const vertex of [meshVertexGlsl(cull, true), skinnedVertexGlsl(cull, true)]) {
                expect(vertex).toContain('layout(location = 7) in vec2 aUv2;');
                expect(vertex).toContain('vUv2 = affineUv(aUv2, gl_Position).xy;');
                expect(varyingsOf(vertex)).toBeLessThanOrEqual(15);
            }
            expect(meshFragmentGlsl(cull, true)).toContain('in vec2 vUv2;');
            expect(meshFragmentGlsl(cull, true)).toContain('lights.ambient.rgb * occlusionAt(vUv2 / vUv.z)');
        }
    });
});

describe('a material of its own', () => {
    it('is lit with it too, by the coordinate its numbers say, and is told it as ctx.occlusion', () => {
        for (const cull of CULLS) {
            for (const skinned of [false, true]) {
                const wgsl = buildMeshMaterialShader(null, null, {}, [], skinned, cull);
                expect(wgsl).toContain('let occlusion = occlusionAt(select(uv, uv2, uniforms.normalMatrix[1].w > 0.5));');
                expect(wgsl).toContain('ctx.occlusion = occlusion;');

                const glsl = buildMeshMaterialShaderGlsl(null, null, {}, [], skinned, cull).fragment;
                expect(glsl).toContain('float occlusion = occlusionAt(uniforms.normalMatrix[1].w > 0.5 ? uv2 : uv);');
                expect(glsl).toContain('ctx.occlusion = occlusion;');
            }
        }
    });

    it('stretches its second coordinate as its first when affine, on both cards', () => {
        for (const cull of CULLS) {
            const wgsl = buildMeshMaterialShader(null, null, {}, [], false, cull);
            expect(wgsl).toContain('let stretched2 = affineUv(cornerUv2, out.position).xy;');
            expect(wgsl).toContain('let uv2 = vec2<f32>(in.normal.w, in.screen.w) / in.uv.z;');
            const glsl = buildMeshMaterialShaderGlsl(null, null, {}, [], false, cull);
            expect(glsl.vertex).toContain('vec2 stretched2 = affineUv(aUv2, gl_Position).xy;');
            expect(glsl.fragment).toContain('vec2 uv2 = vec2(vNormal.w, vScreen.w) / vUv.z;');
        }
    });

    it('keeps its four maps and its second coordinate as they were', () => {
        const wgsl = buildMeshMaterialShader(null, null, {}, ['fire', 'cracks', 'noise', 'mask']);
        for (let i = 0; i < 4; i++) {
            expect(wgsl).toContain(`@group(3) @binding(${2 + i * 2}) var mapTexture${i}: texture_2d<f32>;`);
        }
        expect(wgsl).toContain('ctx.uv2 = uv2;');
        expect(wgsl).toContain('@location(7) cornerUv2: vec2<f32>,');
    });

    it('is told nothing is shut in when its shadow is cut, since no light has reached anything yet', () => {
        expect(buildMeshMaterialShadowShader(null, {}, [], false, { fragment: null })).toContain('ctx.occlusion = 1.0;');
        expect(buildMeshMaterialShadowShaderGlsl(null, {}, false, { fragment: null, mapNames: [] }).fragment).toContain('ctx.occlusion = 1.0;');
    });

    it('reads it in the shader composer', () => {
        const compiled = compileShader({ shader: 'mesh3d', color: composerVec4(composerOcclusion(), composerOcclusion(), composerOcclusion(), 1) });
        expect(compiled.fragment).toContain('ctx.occlusion');
        expect(compiled.fragmentGlsl).toContain('ctx.occlusion');
    });
});

describe('a scene document', () => {
    it('writes it by key with only what differs, lists the picture, and builds it back', () => {
        const { store } = createTestGame();
        startTestScene(store, 'S', () => {
            const ao = useLoadTexture({ src: '/ao.png', key: 'ao' });
            createMesh({ geometry: useCubeGeometry(), occlusion: ao });
            createMesh({ geometry: useCubeGeometry(), occlusion: { texture: ao, strength: 0.5, uv: 'uv2' } });
            // Repeating, said, on a material that clamps: it has to be written, or it reads back as the clamp.
            createMesh({ geometry: useCubeGeometry(), wrap: 'clamp', occlusion: { texture: ao, wrap: 'repeat' } });
            return createScene();
        });

        const doc = JSON.parse(JSON.stringify(serializeScene(store.get('world').scenes[0]!)));
        const meshes = doc.root.components.filter((c: { type: string }) => c.type === 'mesh');

        expect(meshes[0].material.occlusion).toEqual({ texture: 'ao' });
        expect(meshes[1].material.occlusion).toEqual({ texture: 'ao', strength: 0.5, uv: 'uv2' });
        expect(meshes[2].material.occlusion).toEqual({ texture: 'ao', wrap: 'repeat' });
        expect(doc.assets.filter((a: { type: string }) => a.type === 'texture').map((a: { key: string }) => a.key)).toEqual(['ao']);

        registerScene(store, 'Again', sceneFromDoc(parseSceneDoc(doc, '/again.scene'), '/again.scene'));
        const built = startScene(store, 'Again').drawables.filter((d) => d.type === 'mesh') as TMesh[];
        const ao = store.get('assets').textures.get('ao')!;

        expect(built[0]!.material.occlusion).toEqual({ texture: ao });
        expect(built[1]!.material.occlusion).toEqual({ texture: ao, strength: 0.5, uv: 'uv2' });
        expect(built[2]!.material.occlusion).toEqual({ texture: ao, wrap: 'repeat' });
    });

    it('writes nothing about it for a mesh with none, so a document saves as before', () => {
        const { store } = createTestGame();
        startTestScene(store, 'S', () => {
            createMesh({ geometry: useCubeGeometry() });
            return createScene();
        });

        const doc = JSON.parse(JSON.stringify(serializeScene(store.get('world').scenes[0]!)));
        expect('occlusion' in doc.root.components.find((c: { type: string }) => c.type === 'mesh').material).toBe(false);
    });

    it('keeps a strength from 0 to 1, reads one that is not a number as all of it, and a coordinate it does not know as the first', () => {
        const { store } = createTestGame();
        startTestScene(store, 'S', () => {
            createMesh({ geometry: useCubeGeometry(), occlusion: texture('ao') });
            return createScene();
        });
        const doc = JSON.parse(JSON.stringify(serializeScene(store.get('world').scenes[0]!)));
        const written = doc.root.components.find((c: { type: string }) => c.type === 'mesh');
        const read = (occlusion: unknown): unknown => {
            written.material.occlusion = occlusion;
            const parsed = parseSceneDoc(doc, '/odd.scene').root.components.find((c) => c.type === 'mesh') as unknown as { material: { occlusion?: unknown } };
            return parsed.material.occlusion;
        };
        expect(read({ texture: 'ao', strength: 7, uv: 'uv9' })).toEqual({ texture: 'ao' });
        // Below nothing is nothing, as a model file has it, rather than all of it.
        expect(read({ texture: 'ao', strength: -0.5 })).toEqual({ texture: 'ao', strength: 0 });
        expect(read({ texture: 'ao', strength: 'lots' })).toEqual({ texture: 'ao' });
    });
});
