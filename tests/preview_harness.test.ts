import { describe, expect, it } from 'bun:test';
import {
    buildPreviewHarness, PREVIEW_FRAME_UNIFORMS, PREVIEW_INSTANCE, PREVIEW_QUAD_VERTICES, PREVIEW_VERTEX_BUFFERS,
} from '../src/shader_composer/preview_harness';
import { compilePreviewShader } from '../src/shader_composer/compile_preview_shader';
import { composerUniform, composerUv } from '../src/shader_composer/inputs';
import { SPRITE_QUAD, VERTEX_BUFFERS } from '../src/render/webgpu/sprite/create_sprite_pipeline';
import { SPRITE_FLOATS } from '../src/render/webgpu/sprite/write_sprite_instance';
import { SPRITE_SHADER_HEAD } from '../src/render/webgpu/sprite/sprite_shader';
import { buildSpriteMaterialShader } from '../src/render/webgpu/material/sprite_material_shader';
import { buildUniformLayout } from '../src/render/shared/material_uniforms';

/**
 * What a node's small picture in the shader composer is drawn through.
 *
 * Pinned: that it is the renderer's own quad, table and shader rather than copies of them, that the
 * one sprite it draws is laid out as the renderer lays a sprite out, and that it fills the picture
 * the right way up.
 */

describe('the harness a node picture draws through', () => {
    it('is the renderer\'s own quad and vertex table, not a copy', () => {
        expect(PREVIEW_QUAD_VERTICES).toBe(SPRITE_QUAD);
        expect(PREVIEW_VERTEX_BUFFERS).toBe(VERTEX_BUFFERS);
    });

    it('draws one sprite laid out exactly as the renderer lays one out', () => {
        expect(PREVIEW_INSTANCE.length).toBe(SPRITE_FLOATS);
        expect(PREVIEW_INSTANCE.length * 4).toBe(PREVIEW_VERTEX_BUFFERS[1]!.arrayStride);
    });

    it('holds the frame\'s numbers in the size the sprite shader reads them', () => {
        // The shader declares 272 bytes: the resolution, its padding and sixteen views.
        expect(PREVIEW_FRAME_UNIFORMS.byteLength).toBe(272);
    });

    it('fills the picture the right way up: uv (0, 0) at the top left', () => {
        // The sprite shader's arithmetic, done by hand for the one sprite and the screen's view.
        const [px, py, w, h, , sx, sy, , , , , ox, oy, uw, uh, ax, ay] = PREVIEW_INSTANCE;
        const res = [PREVIEW_FRAME_UNIFORMS[0]!, PREVIEW_FRAME_UNIFORMS[1]!];
        const corners: Array<{ clip: [number, number]; uv: [number, number] }> = [];
        for (let i = 0; i < 4; i++) {
            const cx = PREVIEW_QUAD_VERTICES[i * 2]!;
            const cy = PREVIEW_QUAD_VERTICES[i * 2 + 1]!;
            const x = px! + (cx + 0.5 - ax!) * w! * sx!;
            const y = py! + (cy + 0.5 - ay!) * h! * sy!;
            corners.push({
                clip: [x / res[0]! * 2 - 1, -(y / res[1]! * 2 - 1)],
                uv: [(cx + 0.5) * uw! + ox!, (cy + 0.5) * uh! + oy!],
            });
        }

        expect(corners[0]).toEqual({ clip: [-1, 1], uv: [0, 0] });
        expect(corners[3]).toEqual({ clip: [1, -1], uv: [1, 1] });
    });

    it('compiles a picture to exactly what a sprite with that material compiles to', () => {
        const preview = compilePreviewShader(composerUv());
        const harness = buildPreviewHarness(preview.fragment, {});

        expect(harness.wgsl).toBe(buildSpriteMaterialShader(preview.fragment, {}));
        expect(harness.wgsl.startsWith(SPRITE_SHADER_HEAD)).toBe(true);
    });

    it('writes the time, the size and the parameters where the shader reads them', () => {
        const sig = { glow: 'f32' } as const;
        const preview = compilePreviewShader(composerUniform('glow', 0.25));
        const harness = buildPreviewHarness(preview.fragment, sig);
        const layout = buildUniformLayout(sig);
        const data = new Float32Array(harness.materialFloatCount);
        harness.writeMaterialUniforms(data, preview.uniforms, 1.5, 96, 64);

        expect(harness.materialFloatCount).toBe(layout.floatCount);
        expect(data[layout.offsets.time!]).toBe(1.5);
        expect([data[layout.offsets.resolution!], data[layout.offsets.resolution! + 1]]).toEqual([96, 64]);
        expect(data[layout.offsets.glow!]).toBe(0.25);
    });
});
