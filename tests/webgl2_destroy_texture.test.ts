import { describe, expect, it } from 'bun:test';
import { destroyWebGL2Texture } from '../src/render/webgl2/resources';
import type { TWebGL2Texture } from '../src/render/webgl2/texture';
import type { TWebGL2State } from '../src/render/webgl2/types/t_webgl2_state';

/**
 * What WebGL2 lets go of with a texture. More than the texture: a picture drawn into has a
 * framebuffer and a depth made for it, and every texture is on the list a lost context uploads
 * again. Each one left behind is either memory for good or a texture brought back that nobody holds.
 *
 * Against a context that only writes down what it is told, since what matters is which things are
 * deleted, not how a driver does it.
 */

const fakeGl = () => {
    const deleted: string[] = [];
    const depth = { name: 'depth' };
    const gl = {
        FRAMEBUFFER: 1, DEPTH_ATTACHMENT: 2, FRAMEBUFFER_ATTACHMENT_OBJECT_NAME: 3,
        bindFramebuffer: () => {},
        getFramebufferAttachmentParameter: () => depth,
        deleteRenderbuffer: (what: { name: string } | null) => { deleted.push(`renderbuffer:${what?.name}`); },
        deleteFramebuffer: (what: { name: string }) => { deleted.push(`framebuffer:${what.name}`); },
        deleteTexture: (what: { name: string } | null) => { deleted.push(`texture:${what?.name}`); },
    };
    return { gl, deleted };
};

const stateWith = (gl: unknown, textures: TWebGL2Texture[]): TWebGL2State =>
    ({ gl, framebuffers: new Map(), textures: new Set(textures) }) as unknown as TWebGL2State;

describe('letting a texture go in WebGL2', () => {
    it('takes the framebuffer and the depth a picture was drawn into with it', () => {
        const { gl, deleted } = fakeGl();
        const picture = { resourceType: 'texture', source: { kind: 'render', width: 8, height: 8 }, glTexture: { name: 'picture' } } as unknown as TWebGL2Texture;
        const state = stateWith(gl, [picture]);
        state.framebuffers.set(picture, { name: 'fb' } as unknown as WebGLFramebuffer);

        destroyWebGL2Texture(state, picture);

        expect(deleted.sort()).toEqual(['framebuffer:fb', 'renderbuffer:depth', 'texture:picture']);
        expect(state.framebuffers.size).toBe(0);
        // Off the list, so a restore does not bring it back.
        expect(state.textures.size).toBe(0);
        expect(picture.glTexture).toBeNull();
    });

    it('closes the image a loaded texture kept for a restore', () => {
        const { gl } = fakeGl();
        let closed = false;
        const image = { width: 2, height: 2, close: () => { closed = true; } } as unknown as ImageBitmap;
        const loaded = { resourceType: 'texture', source: { kind: 'image', image }, glTexture: { name: 'loaded' } } as unknown as TWebGL2Texture;

        destroyWebGL2Texture(stateWith(gl, [loaded]), loaded);

        expect(closed).toBe(true);
    });
});
