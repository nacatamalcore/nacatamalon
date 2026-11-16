import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createMesh } from '../src/gameobjects/mesh/create_mesh';
import { createMaterial } from '../src/gameobjects/material/create_material';
import { useCubeGeometry } from '../src/hooks/geometry/use_cube_geometry';
import { useLoadTexture } from '../src/hooks/loaders/use_load_texture';
import { parseSceneDoc, sceneFromDoc, serializeScene, SCENE_FORMAT } from '../src/scene/document';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { buildMeshMaterialShader, buildMeshMaterialShadowShader } from '../src/render/webgpu/material/mesh_material_shader';
import { buildMeshMaterialShaderGlsl, buildMeshMaterialShadowShaderGlsl } from '../src/render/webgl2/material/mesh_material_shader';
import { buildUniformLayout, writeUniformValues, writeUvTransformValues } from '../src/render/shared/material_uniforms';
import { moveUv, newMaterial } from '../src/materials/new_material';
import { readMaterial } from '../src/loaders/gltf/read_material';
import { createTestGame, startTestScene } from './helpers/test_game';
import { asGltf, serveGltf, TEST_QUAD } from './helpers/test_gltf';
import { createModel } from '../src/gameobjects/model/create_model';
import { useLoadModel } from '../src/hooks/loaders/use_load_model';
import { whenLoaded } from '../src/loaders';
import type { TTexture } from '../src/loaders';
import type { TMesh } from '../src/gameobjects/mesh';
import type { TMeshMaterial } from '../src/materials';
import type { TGltfDoc } from '../src/loaders/gltf/types/t_gltf_doc';

/**
 * A model's picture laid moved from where its shape puts it: repeated, turned and slid, as a model
 * file's own `KHR_texture_transform` lays it. How it looks is checked in a browser on both cards;
 * what is pinned here is the numbers the shader is handed (the file format's own sum), the shader
 * moving the picture place and the way across it, the numbers following the material every frame,
 * a document keeping it, and a model file's own being read.
 */

const texture = (key: string): TTexture => ({ type: 'texture', key, src: '', width: 1, height: 1, status: 'ready', gpu: null });
const mesh3d = (options: Record<string, unknown>): TMeshMaterial => createMaterial({ shader: 'mesh3d', ...options }) as TMeshMaterial;

/**
 * The file format's own sum, as its reference viewer lays it: translation * rotation * scale, in 3 by
 * 3 matrices taken in columns, applied to (u, v, 1), the rotation's columns (cos, -sin) and (sin, cos).
 * (The sample in the extension's README writes the rotation the other way round; the reference
 * viewer, the format's own wording, "the image clockwise", and the files made for it agree on this.)
 * Kept apart from the engine's so a slip in either shows.
 */
const glTFLaid = (uv: [number, number], t: { scale: [number, number]; rotation: number; offset: [number, number] }): [number, number] => {
    const [sx, sy] = t.scale;
    const c = Math.cos(t.rotation);
    const s = Math.sin(t.rotation);
    // Columns.
    const rotation = [[c, -s, 0], [s, c, 0], [0, 0, 1]];
    const scaled = [uv[0] * sx, uv[1] * sy, 1];
    const turned = [0, 1, 2].map((row) => rotation[0]![row]! * scaled[0]! + rotation[1]![row]! * scaled[1]! + rotation[2]![row]! * scaled[2]!);
    return [turned[0]! + t.offset[0], turned[1]! + t.offset[1]];
};

/**
 * The numbers a draw hands the card for a material, as the renderer writes them: the game's uniforms,
 * then its moved picture's two. Its turn and scale in columns, and its slide.
 */
const handed = (material: TMeshMaterial): { matrix: number[]; offset: number[]; values: Float32Array; layout: ReturnType<typeof buildUniformLayout> } => {
    const layout = buildUniformLayout(material.uniformSig ?? {});
    const values = new Float32Array(layout.floatCount);
    writeUniformValues(values, layout, material.uniforms ?? {}, 0, 1, 1);
    writeUvTransformValues(values, layout, material.uvTransform);
    const m = layout.offsets.uvTransformMatrix!;
    const o = layout.offsets.uvTransformOffset!;
    return { matrix: [...values.slice(m, m + 4)], offset: [...values.slice(o, o + 2)], values, layout };
};

/** Where the engine's two numbers put a picture place: the shader's `uvTurn * uv + offset`. */
const engineLaid = (uv: [number, number], material: TMeshMaterial): [number, number] => {
    const { matrix: m, offset: o } = handed(material);
    return [m[0]! * uv[0] + m[2]! * uv[1] + o[0]!, m[1]! * uv[0] + m[3]! * uv[1] + o[1]!];
};

describe('a material with a uvTransform', () => {
    it('keeps it filled in, and is handed the numbers the file format\'s own sum makes', () => {
        const laid = { scale: [3, -2] as [number, number], rotation: 0.7, offset: [0.25, -1.5] as [number, number] };
        const material = mesh3d({ uvTransform: { scale: { x: 3, y: -2 }, rotation: 0.7, offset: { x: 0.25, y: -1.5 } } });
        expect(material.uvTransform).toEqual({ scale: { x: 3, y: -2 }, rotation: 0.7, offset: { x: 0.25, y: -1.5 } });
        for (const uv of [[0, 0], [1, 0], [0, 1], [0.3, 0.8]] as [number, number][]) {
            const [u, v] = engineLaid(uv, material);
            const [eu, ev] = glTFLaid(uv, laid);
            expect(u).toBeCloseTo(eu, 6);
            expect(v).toBeCloseTo(ev, 6);
        }
        expect(material.uniformSig).toMatchObject({ uvTransformMatrix: 'vec4<f32>', uvTransformOffset: 'vec2<f32>' });
        // One number for both ways, and nothing left out is nothing done.
        expect(mesh3d({ uvTransform: { scale: 4 } }).uvTransform).toEqual({ scale: { x: 4, y: 4 }, rotation: 0, offset: { x: 0, y: 0 } });
        expect(handed(mesh3d({ uvTransform: {} }))).toMatchObject({ matrix: [1, -0, 0, 1], offset: [0, 0] });
        // Turned a quarter, the picture's top edge lies along the surface's left edge, running down it:
        // the picture turned clockwise, as it is seen.
        const quarter = handed(mesh3d({ uvTransform: { rotation: Math.PI / 2 } })).matrix.map((n) => Math.round(n));
        expect(quarter).toEqual([0, -1, 1, 0]);
    });

    it('is drawn by the shader that moves the picture: the engine\'s own ending when it has no hook, its own when it has', () => {
        const plain = mesh3d({ uvTransform: { scale: 2 } });
        expect(plain.fragment).toContain('fn effect(');
        expect(plain.fragmentGlsl).toContain('effect(');
        const hook = 'fn effect(surface: vec4<f32>, ctx: FragContext) -> vec4<f32> { return surface; }';
        expect(mesh3d({ uvTransform: { scale: 2 }, fragment: hook }).fragment).toBe(hook);
        // With a normal map, both: the map named, the picture moved.
        const both = mesh3d({ uvTransform: { scale: 2 }, normalMap: texture('stone') });
        expect(both.uniformSig).toMatchObject({ normalStrength: 'f32', uvTransformMatrix: 'vec4<f32>', uvTransformOffset: 'vec2<f32>' });
        // None asked for, none there.
        const still = mesh3d({});
        expect(still.uvTransform).toBeUndefined();
        expect(still.fragment).toBeNull();
    });

    it('refuses what it cannot take, naming why', () => {
        expect(() => mesh3d({ uvTransform: { scale: 0 } })).toThrow('uvTransform.scale');
        expect(() => mesh3d({ uvTransform: { scale: { x: 2, y: Number.NaN } } })).toThrow('uvTransform.scale');
        expect(() => mesh3d({ uvTransform: { rotation: Number.POSITIVE_INFINITY } })).toThrow('uvTransform.rotation');
        expect(() => mesh3d({ uvTransform: { offset: { x: 1 } } })).toThrow('uvTransform.offset');
        // Its two names are the engine's: one of one's own would move a picture that never asked.
        expect(() => mesh3d({ uniforms: { uvTransformOffset: [0, 0] } })).toThrow("'uvTransformOffset' is where uvTransform keeps its numbers");
    });

    it('leaves the game\'s own uniforms as it gave them: a bag handed to several materials, moved or not', () => {
        const bag = { glow: 1 };
        const first = mesh3d({ uniforms: bag, uvTransform: { scale: 2 } });
        const plain = mesh3d({ uniforms: bag, fragment: 'fn effect(surface: vec4<f32>, ctx: FragContext) -> vec4<f32> { return surface * mu.glow; }' });
        const second = mesh3d({ uniforms: bag, uvTransform: { scale: 3 } });
        expect(bag).toEqual({ glow: 1 });
        expect(second.uniformSig).toMatchObject({ glow: 'f32', uvTransformMatrix: 'vec4<f32>', uvTransformOffset: 'vec2<f32>' });
        expect(plain.uniformSig).toEqual({ glow: 'f32' });
        // Each draws with its own.
        expect(handed(first).matrix[0]).toBeCloseTo(2, 6);
        expect(handed(second).matrix[0]).toBeCloseTo(3, 6);
        expect(handed(first).values[handed(first).layout.offsets.glow!]).toBe(1);
        expect(() => mesh3d({ ...first })).not.toThrow();
    });

    it('hands the shader the numbers as they are this frame', () => {
        const material = mesh3d({ uvTransform: { offset: { x: 0, y: 0 } } });
        material.uvTransform!.offset.x = 0.5;
        material.uvTransform!.rotation = Math.PI / 2;
        const now = handed(material);
        expect(now.offset).toEqual([0.5, 0]);
        expect(now.matrix.map((n) => Math.round(n * 1e6) / 1e6)).toEqual([0, -1, 1, 0]);
        // Squashed to nothing by a script, it is kept a hair from nothing rather than a line.
        material.uvTransform!.scale.x = 0;
        const squashed = handed(material).matrix;
        expect(Math.abs(squashed[0]!) + Math.abs(squashed[1]!)).toBeGreaterThan(0);
    });

    it('reaches the material from createMesh', () => {
        const { store } = createTestGame();
        let floor!: TMesh;
        startTestScene(store, 'Hall', () => {
            floor = createMesh({ geometry: useCubeGeometry(), uvTransform: { scale: 8 } });
            return createScene();
        });
        expect(floor.material.uvTransform?.scale).toEqual({ x: 8, y: 8 });
    });
});

describe('the shader of a material that moves its picture', () => {
    const sig = { uvTransformMatrix: 'vec4<f32>' as const, uvTransformOffset: 'vec2<f32>' as const };

    it('moves the picture place and the way across it at the corner, in every variant, on both cards', () => {
        const wgsl = [
            buildMeshMaterialShader(null, null, sig),
            buildMeshMaterialShader(null, null, sig, [], true),
            buildMeshMaterialShader(null, null, sig, [], false, 'none'),
            buildMeshMaterialShader(null, null, sig, [], false, 'back', true),
            buildMeshMaterialShadowShader(null, sig),
            buildMeshMaterialShadowShader(null, sig, [], false, { fragment: null }),
        ];
        for (const code of wgsl) {
            expect(code).toContain('let uv = uvTurn * cornerUv + mu.uvTransformOffset;');
            expect(code).toContain('let restHand = cornerTangent.w * uvHand;');
        }
        const glsl = [
            buildMeshMaterialShaderGlsl(null, null, sig).vertex,
            buildMeshMaterialShaderGlsl(null, null, sig, [], true).vertex,
            buildMeshMaterialShaderGlsl(null, null, sig, [], false, 'back', true).vertex,
            buildMeshMaterialShadowShaderGlsl(null, sig).vertex,
            buildMeshMaterialShadowShaderGlsl(null, sig, [], false, { fragment: null }).vertex,
        ];
        for (const code of glsl) {
            expect(code).toContain('vec2 restUv = uvTurn * aUv + mu.uvTransformOffset;');
            expect(code).toContain('float restHand = aTangent.w * uvHand;');
        }
    });

    it('reads the corner as its shape has it when the picture is not moved', () => {
        expect(buildMeshMaterialShader(null, null, {})).toContain('let uv = cornerUv;');
        expect(buildMeshMaterialShader(null, null, {})).not.toContain('uvTurn');
        expect(buildMeshMaterialShaderGlsl(null, null, {}).vertex).toContain('vec2 restUv = aUv;');
        // Numbers of those names but other kinds are somebody's own, not a transform.
        expect(buildMeshMaterialShader(null, null, { uvTransformMatrix: 'f32', uvTransformOffset: 'vec2<f32>' })).not.toContain('uvTurn');
    });

    it('lays the way across as the moved picture runs, so a normal map leans the right way', () => {
        // The shader's sum, here: T' = normalize(T * m11 - B * m10) * sign(det), hand * sign(det),
        // with B = cross(N, T) * hand. Checked against where the moved picture's across really runs
        // on a flat surface, P(uv) = u * T + v * B, for turns, a uniform scale and mirrors.
        const N = [0, 1, 0];
        const T = [1, 0, 0];
        const hand = 1;
        const cross = (a: number[], b: number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
        const B = cross(N, T).map((n) => n * hand);
        const norm = (a: number[]) => { const l = Math.hypot(...a); return a.map((n) => n / l); };
        for (const t of [{ rotation: 0.6 }, { rotation: -2 }, { scale: 3 }, { scale: { x: -1, y: 1 } }, { scale: { x: 1, y: -1 } }, { scale: { x: -2, y: -2 }, rotation: 1 }]) {
            const material = mesh3d({ uvTransform: t });
            const [m00, m10, m01, m11] = handed(material).matrix;
            const det = m00! * m11! - m01! * m10!;
            const across = norm(T.map((n, i) => (n * m11! - B[i]! * m10!))).map((n) => n * Math.sign(det));
            const newHand = hand * Math.sign(det);
            // Where it really runs: dP/du' = [T B] * inverse(M) * (1, 0).
            const inv = [m11! / det, -m10! / det, -m01! / det, m00! / det];
            const real = norm(T.map((n, i) => n * inv[0]! + B[i]! * inv[1]!));
            const realDown = norm(T.map((n, i) => n * inv[2]! + B[i]! * inv[3]!));
            across.forEach((n, i) => expect(n).toBeCloseTo(real[i]!, 9));
            cross(N, across).map((n) => n * newHand).forEach((n, i) => expect(n).toBeCloseTo(realDown[i]!, 9));
        }
    });
});

describe('a scene document', () => {
    it('writes the transform as it is now, not its numbers or the hook, and builds it back', () => {
        const { store } = createTestGame();
        startTestScene(store, 'S', () => {
            const tile = useLoadTexture({ src: '/tile.png', key: 'tile' });
            const floor = createMesh({ geometry: useCubeGeometry(), material: createMaterial({ shader: 'mesh3d', texture: tile, uvTransform: { scale: 4 } }) as TMeshMaterial });
            floor.material.uvTransform!.offset.y = 0.5;
            // One made to be moved by a script, still for now.
            createMesh({ geometry: useCubeGeometry(), uvTransform: {} });
            return createScene();
        });
        const doc = JSON.parse(JSON.stringify(serializeScene(store.get('world').scenes[0]!)));
        const meshes = doc.root.components.filter((c: { type: string }) => c.type === 'mesh');
        // Way by way: only the slide down moves it.
        expect(meshes[0].material.uvTransform).toEqual({ scale: { x: 4, y: 4 }, offset: { y: 0.5 } });
        expect(meshes[1].material.uvTransform).toEqual({});
        for (const mesh of meshes) {
            expect(mesh.material.fragment).toBeNull();
            expect(mesh.material.uniforms).toBeNull();
        }
        expect(parseSceneDoc(doc, '/s.scene')).toEqual(doc);

        registerScene(store, 'Again', sceneFromDoc(parseSceneDoc(doc, '/again.scene'), '/again.scene'));
        const built = startScene(store, 'Again').drawables.filter((d) => d.type === 'mesh') as TMesh[];
        expect(built[0]!.material.uvTransform).toEqual({ scale: { x: 4, y: 4 }, rotation: 0, offset: { x: 0, y: 0.5 } });
        expect(built[1]!.material.uvTransform).toEqual({ scale: { x: 1, y: 1 }, rotation: 0, offset: { x: 0, y: 0 } });
    });

    it('reads one written in part, as an inspector writes it, and leaves out a scale of nothing', () => {
        const { store } = createTestGame();
        startTestScene(store, 'S', () => {
            createMesh({ geometry: useCubeGeometry() });
            return createScene();
        });
        const written = JSON.parse(JSON.stringify(serializeScene(store.get('world').scenes[0]!)));
        const read = (uvTransform: unknown) => {
            const doc = structuredClone(written);
            doc.root.components.find((c: { type: string }) => c.type === 'mesh').material.uvTransform = uvTransform;
            const mesh = parseSceneDoc(doc, '/s.scene').root.components.find((c) => c.type === 'mesh')!;
            return mesh.type === 'mesh' ? mesh.material.uvTransform : 'not a mesh';
        };
        // A way left out is kept left out: the engine's default, or on a model piece its file's.
        expect(read({ scale: { x: 4 } })).toEqual({ scale: { x: 4 } });
        // One number for both ways, as createMaterial takes it.
        expect(read({ scale: 4 })).toEqual({ scale: { x: 4, y: 4 } });
        expect(read({ offset: { y: 0.5 } })).toEqual({ offset: { y: 0.5 } });
        expect(read({ scale: { x: 0, y: 2 }, rotation: 1 })).toEqual({ rotation: 1 });
        expect(read('nonsense')).toBeUndefined();
    });
});

describe('a model file that moves its picture (KHR_texture_transform)', () => {
    const docWith = (material: NonNullable<TGltfDoc['materials']>[number]): TGltfDoc =>
        ({ asset: { version: '2.0' }, materials: [material], textures: [{ source: 0 }], images: [{ uri: 'a.png' }] }) as TGltfDoc;
    const moved = { extensions: { KHR_texture_transform: { offset: [0.5, 0] as [number, number], rotation: 0.3, scale: [2, 3] as [number, number] } } };

    it('is read from its colour picture, in the file\'s own numbers', () => {
        const surface = readMaterial(docWith({ pbrMetallicRoughness: { baseColorTexture: { index: 0, ...moved } } }), 0);
        expect(surface.uvTransform).toEqual({ scale: { x: 2, y: 3 }, rotation: 0.3, offset: { x: 0.5, y: 0 } });
        // One that moves nothing is none.
        const still = readMaterial(docWith({ pbrMetallicRoughness: { baseColorTexture: { index: 0, extensions: { KHR_texture_transform: {} } } } }), 0);
        expect(still.uvTransform).toBeNull();
        expect(readMaterial(docWith({ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }), 0).uvTransform).toBeNull();
    });

    it('says once that a glow moved another way is laid as the colour is', () => {
        const warned: string[] = [];
        const warn = console.warn;
        console.warn = (message: string) => warned.push(message);
        try {
            // Read once for each piece that wears it: said once.
            const sign = docWith({ name: 'Sign', pbrMetallicRoughness: { baseColorTexture: { index: 0, ...moved } }, emissiveTexture: { index: 0 } });
            readMaterial(sign, 0);
            readMaterial(sign, 0);
            readMaterial(docWith({ name: 'Same', pbrMetallicRoughness: { baseColorTexture: { index: 0, ...moved } }, emissiveTexture: { index: 0, ...moved } }), 0);
        } finally {
            console.warn = warn;
        }
        expect(warned).toHaveLength(1);
        expect(warned[0]).toContain('"Sign"');
    });

    it('lays every piece of a model so, unless the game says otherwise', async () => {
        const built = asGltf({ nodes: [{ name: 'Body', primitives: [{ ...TEST_QUAD, material: 0 }] }], materials: [{ baseColorFactor: [1, 1, 1, 1], image: 'a.png' }] });
        const json = built.json as { materials: Array<{ pbrMetallicRoughness: { baseColorTexture: Record<string, unknown> } }> };
        json.materials[0]!.pbrMetallicRoughness.baseColorTexture.extensions = moved.extensions;
        const served = serveGltf({ '/models/sign.gltf': json, '/models/model.bin': built.bin, '/models/a.png': 'png' });
        try {
            const { store } = createTestGame();
            let fromFile!: ReturnType<typeof createModel>;
            let own!: ReturnType<typeof createModel>;
            startTestScene(store, 'Hall', () => {
                const model = useLoadModel({ src: '/models/sign.gltf' });
                fromFile = createModel({ model });
                own = createModel({ model, uvTransform: { scale: 5 } });
                return createScene();
            });
            await whenLoaded(fromFile.model);
            for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
            expect(fromFile.parts[0]!.material.uvTransform).toEqual({ scale: { x: 2, y: 3 }, rotation: 0.3, offset: { x: 0.5, y: 0 } });
            expect(own.parts[0]!.material.uvTransform?.scale).toEqual({ x: 5, y: 5 });
        } finally {
            served.restore();
        }
    });

    it('lays a piece a scene places as its file does, each part the scene does not say', async () => {
        const built = asGltf({ nodes: [{ name: 'Body', primitives: [{ ...TEST_QUAD, material: 0 }] }], materials: [{ baseColorFactor: [1, 1, 1, 1], image: 'a.png' }] });
        const json = built.json as { materials: Array<{ pbrMetallicRoughness: { baseColorTexture: Record<string, unknown> } }> };
        json.materials[0]!.pbrMetallicRoughness.baseColorTexture.extensions = moved.extensions;
        const served = serveGltf({ '/models/sign.gltf': json, '/models/model.bin': built.bin, '/models/a.png': 'png' });
        try {
            const { store } = createTestGame();
            const piece = (id: string, material: Record<string, unknown>) => ({ type: 'mesh', id, geometry: 'sign', material });
            startTestScene(store, 'Shop', sceneFromDoc(parseSceneDoc({
                format: SCENE_FORMAT,
                version: 1,
                name: 'Shop',
                assets: [{ type: 'geometry', key: 'sign', source: { kind: 'gltf', src: '/models/sign.gltf' } }],
                root: {
                    id: 'root', name: 'Shop', transform: null, children: [],
                    // As the file says; and turned by the scene, an inspector having said only the turn.
                    components: [
                        piece('as-file', {}),
                        piece('turned', { uvTransform: { rotation: 1 } }),
                        // Its repeat across said, its repeat down the file's.
                        piece('wider', { uvTransform: { scale: { x: 4 } } }),
                    ],
                },
            }, '/scenes/shop.scene')));
            for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
            const meshes = store.get('world').scenes[0]!.drawables.filter((d) => d.type === 'mesh') as TMesh[];
            expect(meshes.find((m) => m.id === 'as-file')!.material.uvTransform).toEqual({ scale: { x: 2, y: 3 }, rotation: 0.3, offset: { x: 0.5, y: 0 } });
            expect(meshes.find((m) => m.id === 'turned')!.material.uvTransform).toEqual({ scale: { x: 2, y: 3 }, rotation: 1, offset: { x: 0.5, y: 0 } });
            expect(meshes.find((m) => m.id === 'wider')!.material.uvTransform).toEqual({ scale: { x: 4, y: 3 }, rotation: 0.3, offset: { x: 0.5, y: 0 } });
        } finally {
            served.restore();
        }
    });

    it('writes only what moves the picture of a piece saved before its file lands, so the file\'s still come', async () => {
        const built = asGltf({ nodes: [{ name: 'Body', primitives: [{ ...TEST_QUAD, material: 0 }] }], materials: [{ baseColorFactor: [1, 1, 1, 1], image: 'a.png' }] });
        const json = built.json as { materials: Array<{ pbrMetallicRoughness: { baseColorTexture: Record<string, unknown> } }> };
        json.materials[0]!.pbrMetallicRoughness.baseColorTexture.extensions = moved.extensions;
        const served = serveGltf({ '/models/sign.gltf': json, '/models/model.bin': built.bin, '/models/a.png': 'png' });
        try {
            const { store } = createTestGame();
            startTestScene(store, 'Shop', sceneFromDoc(parseSceneDoc({
                format: SCENE_FORMAT, version: 1, name: 'Shop',
                assets: [{ type: 'geometry', key: 'sign', source: { kind: 'gltf', src: '/models/sign.gltf' } }],
                root: { id: 'root', name: 'Shop', transform: null, children: [], components: [{ type: 'mesh', id: 'turned', geometry: 'sign', material: { uvTransform: { rotation: 1, scale: { x: 4 }, offset: { y: 0.25 } } } }] },
            }, '/scenes/shop.scene')));
            // Way by way: the ways the scene left out stay left out, for the file to fill.
            const early = serializeScene(store.get('world').scenes[0]!).root.components.find((c) => c.type === 'mesh');
            expect(early?.type === 'mesh' ? early.material.uvTransform : 'none').toEqual({ rotation: 1, scale: { x: 4 }, offset: { y: 0.25 } });
            for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
            const late = serializeScene(store.get('world').scenes[0]!).root.components.find((c) => c.type === 'mesh');
            expect(late?.type === 'mesh' ? late.material.uvTransform : 'none').toEqual({ scale: { x: 4, y: 3 }, rotation: 1, offset: { x: 0.5, y: 0.25 } });
        } finally {
            served.restore();
        }
    });

    it('keeps what the scene said of a piece saved before its file lands, a turn of 0 over the file\'s included', () => {
        const { store } = createTestGame();
        const said = { scale: { x: 1, y: 1 }, rotation: 0, offset: { x: 0, y: 0 } };
        // A file that never lands: the piece waits for ever, and is saved as the scene said.
        startTestScene(store, 'Shop', sceneFromDoc(parseSceneDoc({
            format: SCENE_FORMAT, version: 1, name: 'Shop',
            assets: [{ type: 'geometry', key: 'gone', source: { kind: 'gltf', src: '/models/gone.gltf' } }],
            root: { id: 'root', name: 'Shop', transform: null, children: [], components: [
                { type: 'mesh', id: 'still', geometry: 'gone', material: { uvTransform: said } },
                { type: 'mesh', id: 'turn', geometry: 'gone', material: { uvTransform: { rotation: 0 } } },
            ] },
        }, '/scenes/shop.scene')));
        const written = serializeScene(store.get('world').scenes[0]!).root.components.filter((c) => c.type === 'mesh');
        const of = (id: string) => { const c = written.find((m) => m.id === id); return c?.type === 'mesh' ? c.material.uvTransform : 'none'; };
        expect(of('still')).toEqual(said);
        expect(of('turn')).toEqual({ rotation: 0 });
    });

    it('keeps a game\'s own word over its file\'s when the scene is saved and opened, even a still one', async () => {
        const built = asGltf({ nodes: [{ name: 'Body', primitives: [{ ...TEST_QUAD, material: 0 }] }], materials: [{ baseColorFactor: [1, 1, 1, 1], image: 'a.png' }] });
        const json = built.json as { materials: Array<{ pbrMetallicRoughness: { baseColorTexture: Record<string, unknown> } }> };
        json.materials[0]!.pbrMetallicRoughness.baseColorTexture.extensions = moved.extensions;
        const served = serveGltf({ '/models/sign.gltf': json, '/models/model.bin': built.bin, '/models/a.png': 'png' });
        try {
            const { store } = createTestGame();
            startTestScene(store, 'Shop', () => {
                // Laid as its shape puts it, whatever the file says.
                createModel({ model: useLoadModel({ src: '/models/sign.gltf' }), uvTransform: {} });
                return createScene();
            });
            for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
            const doc = parseSceneDoc(JSON.parse(JSON.stringify(serializeScene(store.get('world').scenes[0]!))), '/shop.scene');
            registerScene(store, 'Again', sceneFromDoc(doc, '/again.scene'));
            const again = startScene(store, 'Again');
            for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
            const meshes: TMesh[] = [];
            const walk = (box: { drawables: unknown[]; children: unknown[] }) => {
                for (const d of box.drawables as TMesh[]) if (d.type === 'mesh') meshes.push(d);
                for (const c of box.children as Array<{ drawables: unknown[]; children: unknown[] }>) walk(c);
            };
            walk(again as never);
            expect(meshes.length).toBeGreaterThan(0);
            for (const mesh of meshes) {
                expect(mesh.material.uvTransform).toEqual({ scale: { x: 1, y: 1 }, rotation: 0, offset: { x: 0, y: 0 } });
            }
        } finally {
            served.restore();
        }
    });

    it('moves a material already made, when its file lands after it', () => {
        const material = mesh3d({});
        moveUv(material, { scale: { x: 2, y: 2 }, rotation: 0, offset: { x: 0, y: 0 } });
        expect(material.uvTransform?.scale).toEqual({ x: 2, y: 2 });
        expect(material.fragment).toContain('fn effect(');
        expect(material.uniformSig).toMatchObject({ uvTransformMatrix: 'vec4<f32>', uvTransformOffset: 'vec2<f32>' });
        // Already moved: the new numbers, the same shader.
        const shader = material.fragment;
        moveUv(material, { scale: { x: 3, y: 3 }, rotation: 0, offset: { x: 0, y: 0 } });
        expect(material.uvTransform?.scale).toEqual({ x: 3, y: 3 });
        expect(material.fragment).toBe(shader);
    });
});

describe('a model\'s shader file', () => {
    it('that names a parameter after the two a uvTransform keeps its numbers in is not poured in, and says so once', () => {
        const file = {
            type: 'shader', key: 'odd', src: 'shaders/odd.wgsl', glslSrc: null, status: 'ready', shader: 'mesh3d',
            fragment: 'fn effect(surface: vec4<f32>, ctx: FragContext) -> vec4<f32> { return surface; }', fragmentGlsl: null, vertex: null, vertexGlsl: null,
            uniforms: { uvTransformMatrix: [0, 0, 0, 0], uvTransformOffset: [0, 0] },
            uniformSig: { uvTransformMatrix: 'vec4<f32>', uvTransformOffset: 'vec2<f32>' },
            bound: [],
        } as unknown as Parameters<typeof newMaterial>[2];
        const warned: string[] = [];
        const warn = console.warn;
        console.warn = (message: string) => warned.push(String(message));
        try {
            const a = newMaterial({ shader: 'mesh3d' }, null, file) as TMeshMaterial;
            const b = newMaterial({ shader: 'mesh3d' }, null, file) as TMeshMaterial;
            for (const material of [a, b]) {
                expect(material.fragment).toBeNull();
                expect(material.uniformSig?.uvTransformMatrix).toBeUndefined();
            }
        } finally {
            console.warn = warn;
        }
        expect(warned.filter((message) => message.includes("'uvTransformMatrix'"))).toHaveLength(1);
    });
});

describe('a scene that lays a picture', () => {
    it('starts again, a material with uniforms of its own among them, and its document is left as written', () => {
        const { store } = createTestGame();
        const hook = 'fn effect(surface: vec4<f32>, ctx: FragContext) -> vec4<f32> { return surface * mu.glow; }';
        startTestScene(store, 'S', () => {
            createMesh({ geometry: useCubeGeometry(), material: createMaterial({ shader: 'mesh3d', fragment: hook, uniforms: { glow: 2 }, uvTransform: { scale: 4 } }) as TMeshMaterial });
            return createScene();
        });
        const doc = parseSceneDoc(JSON.parse(JSON.stringify(serializeScene(store.get('world').scenes[0]!))), '/s.scene');
        const written = JSON.stringify(doc);
        // The same document built twice, as a scene that starts again builds it.
        for (const name of ['Again', 'AndAgain']) {
            registerScene(store, name, sceneFromDoc(doc, '/again.scene'));
            const built = startScene(store, name).drawables.filter((d) => d.type === 'mesh') as TMesh[];
            expect(built[0]!.material.uvTransform?.scale).toEqual({ x: 4, y: 4 });
            expect(built[0]!.material.uniforms).toMatchObject({ glow: 2 });
        }
        expect(JSON.stringify(doc)).toBe(written);
    });

    it('opens a copy never read by parseSceneDoc, as an editor hands it in, with a repeat of 0 or a word for a number', () => {
        const { store } = createTestGame();
        startTestScene(store, 'S', () => {
            createMesh({ geometry: useCubeGeometry() });
            return createScene();
        });
        const written = JSON.parse(JSON.stringify(serializeScene(store.get('world').scenes[0]!)));
        const odd = [{ scale: { x: 4, y: 0 } }, { scale: 0 }, { scale: { x: '4' } }, { rotation: '1' }, { offset: { x: Number.NaN } }];
        odd.forEach((uvTransform, i) => {
            const doc = structuredClone(written);
            doc.root.components.find((c: { type: string }) => c.type === 'mesh').material.uvTransform = uvTransform;
            registerScene(store, `Live${i}`, sceneFromDoc(doc, `/live${i}.scene`));
            const built = startScene(store, `Live${i}`).drawables.filter((d) => d.type === 'mesh') as TMesh[];
            // What could not be read is laid as the shape puts it; the scene opens.
            expect(built[0]!.material.uvTransform).toEqual({ scale: { x: 1, y: 1 }, rotation: 0, offset: { x: 0, y: 0 } });
        });
        // And with no uniforms, uniforms that are not a bag, or no word on an effect at all.
        const strange: Array<(material: Record<string, unknown>) => void> = [
            (material) => { delete material.uniforms; },
            (material) => { material.uniforms = 5; },
            (material) => { delete material.effect; material.uvTransform = { scale: 2 }; },
        ];
        strange.forEach((change, i) => {
            const doc = structuredClone(written);
            change(doc.root.components.find((c: { type: string }) => c.type === 'mesh').material);
            registerScene(store, `Odd${i}`, sceneFromDoc(doc, `/odd${i}.scene`));
            expect(() => startScene(store, `Odd${i}`)).not.toThrow();
        });
        const noEffect = structuredClone(written);
        const surface = noEffect.root.components.find((c: { type: string }) => c.type === 'mesh').material;
        delete surface.effect;
        surface.uvTransform = { scale: 2 };
        registerScene(store, 'NoEffect', sceneFromDoc(noEffect, '/no-effect.scene'));
        const laid = startScene(store, 'NoEffect').drawables.filter((d) => d.type === 'mesh') as TMesh[];
        expect(laid[0]!.material.uvTransform?.scale).toEqual({ x: 2, y: 2 });
    });

    it('lays a way a plain mesh leaves out as the engine\'s default', () => {
        const { store } = createTestGame();
        startTestScene(store, 'S', () => {
            createMesh({ geometry: useCubeGeometry() });
            return createScene();
        });
        const doc = JSON.parse(JSON.stringify(serializeScene(store.get('world').scenes[0]!)));
        doc.root.components.find((c: { type: string }) => c.type === 'mesh').material.uvTransform = { scale: { x: 4 }, offset: { y: 0.5 } };
        registerScene(store, 'Again', sceneFromDoc(parseSceneDoc(doc, '/again.scene'), '/again.scene'));
        const built = startScene(store, 'Again').drawables.filter((d) => d.type === 'mesh') as TMesh[];
        expect(built[0]!.material.uvTransform).toEqual({ scale: { x: 4, y: 1 }, rotation: 0, offset: { x: 0, y: 0.5 } });
    });

    it('opens a material whose document names the uniforms a uvTransform keeps its numbers in, saying it leaves them out', () => {
        const { store } = createTestGame();
        startTestScene(store, 'S', () => {
            createMesh({ geometry: useCubeGeometry() });
            return createScene();
        });
        const doc = JSON.parse(JSON.stringify(serializeScene(store.get('world').scenes[0]!)));
        // As a tool that copies a shader file's defaults into the document writes them.
        doc.root.components.find((c: { type: string }) => c.type === 'mesh').material.uniforms = { glow: 1, uvTransformMatrix: [1, 0, 0, 1], uvTransformOffset: [0, 0] };
        const warned: string[] = [];
        const warn = console.warn;
        console.warn = (message: string) => warned.push(String(message));
        try {
            registerScene(store, 'Again', sceneFromDoc(parseSceneDoc(doc, '/again.scene'), '/again.scene'));
            const built = startScene(store, 'Again').drawables.filter((d) => d.type === 'mesh') as TMesh[];
            expect(built[0]!.material.uniforms).toEqual({ glow: 1 });
        } finally {
            console.warn = warn;
        }
        expect(warned.some((message) => message.includes("'uvTransformMatrix' and 'uvTransformOffset'"))).toBe(true);
    });

    it('opens a material drawn by an effect from a file that says how its picture is laid, saying it cannot', () => {
        const { store } = createTestGame();
        startTestScene(store, 'S', () => {
            createMesh({ geometry: useCubeGeometry() });
            return createScene();
        });
        const doc = JSON.parse(JSON.stringify(serializeScene(store.get('world').scenes[0]!)));
        const mesh = doc.root.components.find((c: { type: string }) => c.type === 'mesh');
        mesh.material.effect = 'shaders/wave.wgsl';
        doc.assets.push({ type: 'shader', key: 'shaders/wave.wgsl', src: 'shaders/wave.wgsl' });
        mesh.material.uvTransform = { scale: { x: 4, y: 4 } };
        const warned: string[] = [];
        const warn = console.warn;
        console.warn = (message: string) => warned.push(String(message));
        try {
            registerScene(store, 'Again', sceneFromDoc(parseSceneDoc(doc, '/again.scene'), '/again.scene'));
            const built = startScene(store, 'Again').drawables.filter((d) => d.type === 'mesh') as TMesh[];
            expect(built[0]!.material.uvTransform).toBeUndefined();
        } finally {
            console.warn = warn;
        }
        expect(warned.some((message) => message.includes('cannot move it'))).toBe(true);
    });
});
