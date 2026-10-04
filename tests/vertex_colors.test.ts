import { afterEach, describe, expect, it, mock } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { useLoadGltf } from '../src/hooks/loaders/use_load_gltf';
import { useCubeGeometry } from '../src/hooks/geometry';
import { whenLoaded } from '../src/loaders';
import { MESH_SHADER } from '../src/render/webgpu/mesh/mesh_shader';
import { SKINNED_SHADER } from '../src/render/webgpu/mesh/skinned_shader';
import { MESH_COLORS } from '../src/render/webgpu/mesh/pipeline_state';
import { MESH_FRAGMENT_GLSL, MESH_VERTEX_GLSL } from '../src/render/webgl2/mesh/mesh_shader';
import { SKINNED_VERTEX_GLSL } from '../src/render/webgl2/mesh/skinned_shader';
import { compileShader } from '../src/shader_composer/compile_shader';
import { composerSurface, composerVertexColor, composerVertexNormal, composerVertexPosition } from '../src/shader_composer/inputs';
import { composerAdd, composerMul } from '../src/shader_composer/math';
import { composerSwizzle } from '../src/shader_composer/constructors';
import { createTestGame, startTestScene } from './helpers/test_game';
import { asGltf, serveGltf, TEST_QUAD } from './helpers/test_gltf';
import type { TGeometry } from '../src/geometry';
import type { TGltfModel } from '../src/loaders';
import type { TTestModel, TTestPrimitive } from './helpers/test_gltf';

/**
 * The colour painted on a model's corners: read out of the file, carried to the card, and multiplied
 * into the surface by both backends.
 *
 * The file stores it in linear light, like every glTF colour, and the engine draws in screen colours,
 * so what matters most here is the conversion: a painted cave that arrives untouched comes out far
 * darker than the artist left it, and nothing fails.
 */

afterEach(() => { mock.restore(); });

const loadQuad = async (primitive: Partial<TTestPrimitive>, options: Record<string, unknown> = {}) => {
    const model: TTestModel = { nodes: [{ name: 'Quad', primitives: [{ ...TEST_QUAD, ...primitive }] }] };
    const { json, bin } = asGltf(model);
    const served = serveGltf({ 'model.gltf': json, 'model.bin': bin });
    const { store, renderer } = createTestGame();
    let loaded!: TGltfModel;
    startTestScene(store, 'Level', () => {
        loaded = useLoadGltf({ src: 'model.gltf', ...options });
        return createScene();
    });
    await whenLoaded(loaded);
    served.restore();
    return { model: loaded, renderer };
};

/**
 * The bytes a shape's colour run was handed to the card with, four a corner.
 */
const colorBytes = (renderer: ReturnType<typeof createTestGame>['renderer'], geometry: TGeometry): number[] => {
    const entry = renderer.buffers.find((b) => b.handle === geometry.colorBuffer);
    if (entry === undefined) {
        throw new Error('the shape has no colour run on the card');
    }
    const data = entry.data as Uint32Array;
    return Array.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
};

describe('colours painted in a file', () => {
    it('arrive as screen colours, with how opaque they are untouched', async () => {
        // Pure green stays pure green; 55 in linear light is the screen's middle grey, 128; how
        // opaque a corner is was never a colour and is not converted.
        const { model, renderer } = await loadQuad({
            colors: [0, 255, 0, 255, 55, 55, 55, 128, 255, 255, 255, 255, 0, 0, 0, 0],
        });

        expect(colorBytes(renderer, model.parts[0].geometry)).toEqual([
            0, 255, 0, 255,
            128, 128, 128, 128,
            255, 255, 255, 255,
            0, 0, 0, 0,
        ]);
    });

    it('read the same from decimals and from two-byte numbers', async () => {
        // The same linear grey as the byte 55 above, written the two other ways the format allows.
        const middle = 55 / 255;
        const short = 55 * 257;
        const fromFloats = await loadQuad({ colors: Array(4).fill([middle, middle, middle, 1]).flat(), colorFormat: 'float' });
        const fromShorts = await loadQuad({ colors: Array(4).fill([short, short, short, 65535]).flat(), colorFormat: 'u16' });

        expect(colorBytes(fromFloats.renderer, fromFloats.model.parts[0].geometry).slice(0, 4)).toEqual([128, 128, 128, 255]);
        expect(colorBytes(fromShorts.renderer, fromShorts.model.parts[0].geometry).slice(0, 4)).toEqual([128, 128, 128, 255]);
    });

    it('are fully opaque when the file gives only three numbers', async () => {
        const { model, renderer } = await loadQuad({ colors: Array(4).fill([255, 0, 0]).flat(), colorType: 'VEC3' });

        expect(colorBytes(renderer, model.parts[0].geometry)).toEqual(Array(4).fill([255, 0, 0, 255]).flat());
    });

    it('follow their corners when a flat model splits them', async () => {
        // Six triangle points become six corners of their own, each keeping the colour it had.
        const { model, renderer } = await loadQuad(
            { colors: [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255] },
            { shading: 'flat' },
        );

        expect(colorBytes(renderer, model.parts[0].geometry)).toEqual([
            255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255,
            255, 0, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255,
        ]);
    });
});

describe('a shape nobody painted', () => {
    it('is white on every corner, which multiplies into nothing', async () => {
        const fromFile = await loadQuad({});
        expect(colorBytes(fromFile.renderer, fromFile.model.parts[0].geometry)).toEqual(Array(16).fill(255));

        const { store, renderer } = createTestGame();
        let cube!: TGeometry;
        startTestScene(store, 'Level', () => {
            cube = useCubeGeometry();
            return createScene();
        });
        expect(colorBytes(renderer, cube)).toEqual(Array(cube.vertexCount * 4).fill(255));
    });
});

describe('the two backends', () => {
    it('read the colour from the same place, as four bytes', () => {
        expect(MESH_COLORS.attributes).toEqual([{ shaderLocation: 5, offset: 0, format: 'unorm8x4' }]);
        for (const wgsl of [MESH_SHADER, SKINNED_SHADER]) {
            expect(wgsl).toContain('@location(5) color: vec4<f32>');
        }
        for (const glsl of [MESH_VERTEX_GLSL, SKINNED_VERTEX_GLSL]) {
            expect(glsl).toContain('layout(location = 5) in vec4 aColor;');
        }
    });

    it('multiply it into the surface, with the picture and the tint', () => {
        expect(MESH_SHADER).toContain('texColor * uniforms.tint * in.color');
        expect(MESH_FRAGMENT_GLSL).toContain('texColor * uniforms.tint * vColor');
    });
});

describe('the Vertex Color node', () => {
    it('reads the painted colour where a model colours itself', () => {
        const shader = compileShader({ shader: 'mesh3d', color: composerMul(composerSurface(), composerVertexColor()) });

        expect(shader.fragment).toContain('ctx.color');
    });

    it('and where it moves its corners, which is how the foot of a tree stays still in the wind', () => {
        const sway = composerMul(composerVertexNormal(), composerSwizzle(composerVertexColor(), 'x'));
        const shader = compileShader({ shader: 'mesh3d', position: composerAdd(composerVertexPosition(), sway) });

        expect(shader.vertex).toContain('ctx.color');
    });

    it('is refused on a sprite, which has no corners of its own to paint', () => {
        expect(() => compileShader({ shader: 'sprite2d', color: composerVertexColor() })).toThrow();
    });
});
