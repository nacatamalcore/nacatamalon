import { describe, expect, it } from 'bun:test';
import { createFakeRenderer } from './helpers/test_game';

/**
 * The half of the renderer that holds things rather than drawing them. What is checked here is the
 * contract both backends answer: what a game hands over comes back as a handle, what it writes has
 * to fit, and bytes that do not match a size are refused instead of read past.
 */
describe('the resources of a renderer', () => {
    it('hands back a handle for what was uploaded', () => {
        const renderer = createFakeRenderer();
        const corners = new Float32Array([0, 0, 1, 1]);

        const buffer = renderer.createBuffer(corners, 'vertex');

        expect(buffer.resourceType).toBe('buffer');
        expect(renderer.buffers[0].usage).toBe('vertex');
        expect(Array.from(renderer.buffers[0].data)).toEqual([0, 0, 1, 1]);
    });

    it('writes over what a buffer holds without asking for more memory', () => {
        const renderer = createFakeRenderer();
        const buffer = renderer.createBuffer(new Float32Array(8), 'vertex');

        renderer.updateBuffer(buffer, new Float32Array([1, 2, 3, 4]));

        expect(renderer.buffers.length).toBe(1);
        expect(renderer.buffers[0].writes).toBe(1);
    });

    it('refuses to write more than a buffer holds, because the caller keeps count', () => {
        const renderer = createFakeRenderer();
        const buffer = renderer.createBuffer(new Float32Array(4), 'vertex');

        expect(() => renderer.updateBuffer(buffer, new Float32Array(8))).toThrow('does not fit');
    });

    it('refuses bytes that do not match the size of the picture', () => {
        const renderer = createFakeRenderer();

        expect(() => renderer.createDataTexture(new Uint8Array(3), 2, 2)).toThrow('do not match');
        expect(renderer.createDataTexture(new Uint8Array(16), 2, 2).resourceType).toBe('texture');
    });
});
