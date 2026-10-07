import { describe, expect, it } from 'bun:test';
import { createWebGL2DataTexture, updateWebGL2DataTexture } from '../src/render/webgl2/resources';
import type { TWebGL2Texture } from '../src/render/webgl2/texture';

/**
 * Sending part of a picture painted in code to WebGL2 again.
 *
 * GL is told how wide a whole row of the picture is and where the rectangle starts, so it reads the
 * rectangle straight out of the full picture. Those settings outlive the call unless they are put
 * back, and every other upload in this backend assumes they are zero: a texture loaded after a crater
 * was dug would be read from the crater's offset and come out sheared.
 */

const UNPACK_ROW_LENGTH = 0x0cf2;
const UNPACK_SKIP_ROWS = 0x0cf3;
const UNPACK_SKIP_PIXELS = 0x0cf4;

const recordingGl = () => {
    const store = new Map<number, number>();
    const uploads: unknown[][] = [];
    let calls = 0;
    const gl = new Proxy({
        UNPACK_ROW_LENGTH, UNPACK_SKIP_ROWS, UNPACK_SKIP_PIXELS,
        pixelStorei: (name: number, value: number) => { calls++; store.set(name, value); },
        texSubImage2D: (...args: unknown[]) => { calls++; uploads.push(args); },
    } as Record<string, unknown>, {
        get: (target, key: string) => (key in target ? target[key] : () => ({})),
    }) as unknown as WebGL2RenderingContext;
    return { gl, store, uploads, calls: () => calls };
};

describe('updating a texture made from bytes, on WebGL2', () => {
    it('reads the rectangle out of the whole picture, then puts the unpacking back', () => {
        const { gl, store, uploads } = recordingGl();
        const data = new Uint8Array(10 * 6 * 4);
        const texture = createWebGL2DataTexture(gl, data, 10, 6);

        updateWebGL2DataTexture(gl, false, texture, data, 10, 6, { x: 3, y: 2, width: 4, height: 3 });

        // Offset and size of the rectangle where it lands, and the full picture to read it from.
        expect(uploads).toHaveLength(1);
        expect(uploads[0]!.slice(2, 6)).toEqual([3, 2, 4, 3]);
        expect(uploads[0]![8]).toBe(data);
        for (const name of [UNPACK_ROW_LENGTH, UNPACK_SKIP_ROWS, UNPACK_SKIP_PIXELS]) {
            expect(store.get(name)).toBe(0);
        }
    });

    it('touches nothing while the context is lost, and leaves the restore the bytes as they are now', () => {
        const { gl, calls } = recordingGl();
        const first = new Uint8Array(2 * 2 * 4);
        const texture = createWebGL2DataTexture(gl, first, 2, 2) as TWebGL2Texture;
        const before = calls();
        const later = new Uint8Array(2 * 2 * 4).fill(255);

        updateWebGL2DataTexture(gl, true, texture, later, 2, 2);

        expect(calls()).toBe(before);
        // A restore uploads `source.data` whole, so it has to be the picture as it now is.
        expect(texture.source).toEqual({ kind: 'data', data: later, width: 2, height: 2 });
    });
});
