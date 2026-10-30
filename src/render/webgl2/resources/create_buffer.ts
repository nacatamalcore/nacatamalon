import type { IBuffer, TBufferUsage } from '../../interface';

/**
 * What an `IBuffer` is inside the WebGL2 backend. Never leaves `render/webgl2`.
 *
 * @internal
 */
export type TWebGL2Buffer = IBuffer & {
    /**
     * `null` while the context is lost, until the restore uploads `kept` again.
     */
    glBuffer: WebGLBuffer | null;
    /**
     * Which kind of slot it binds to, so an update finds it again.
     */
    target: number;
    /**
     * How many bytes it was made for, which is not how many are drawn right now.
     */
    capacity: number;
    /**
     * A copy of every byte it holds, as of the last write, so a lost context can give it back.
     *
     * A copy and not the array it was made from: whoever made it may write that array again for
     * something else (a shape hands over a view of corners it keeps rewriting), and a model's
     * vertices are not kept anywhere once they are on the card.
     */
    kept: Uint8Array;
};

const targetOf = (gl: WebGL2RenderingContext, usage: TBufferUsage): number => {
    if (usage === 'index') {
        return gl.ELEMENT_ARRAY_BUFFER;
    }
    if (usage === 'uniform') {
        return gl.UNIFORM_BUFFER;
    }
    if (usage === 'storage') {
        // WebGL2 has no such thing. Nothing in this backend asks for one: bones travel as a
        // picture of numbers instead, because a block of the uniform kind cannot be as long as it
        // needs to be. Answered here so the shape of the two backends stays the same.
        return gl.ARRAY_BUFFER;
    }
    return gl.ARRAY_BUFFER;
};

const bytesOf = (data: Float32Array | Uint16Array | Uint32Array): Uint8Array => new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

const upload = (gl: WebGL2RenderingContext, target: number, bytes: Uint8Array): WebGLBuffer => {
    const glBuffer = gl.createBuffer();
    gl.bindBuffer(target, glBuffer);
    gl.bufferData(target, bytes, gl.DYNAMIC_DRAW);
    gl.bindBuffer(target, null);
    return glBuffer;
};

/**
 * Uploads numbers and hands back a handle to them.
 *
 * `DYNAMIC_DRAW` because what this backend is asked to keep is mostly geometry that gets rewritten:
 * a map's layer when a tile changes. It is a hint, not a promise, and a buffer nobody rewrites loses
 * nothing by it.
 *
 * Made while the context is lost, it waits for the restore to be uploaded, like a texture.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createWebGL2Buffer = (gl: WebGL2RenderingContext, lost: boolean, data: Float32Array | Uint16Array | Uint32Array, usage: TBufferUsage): TWebGL2Buffer => {
    const target = targetOf(gl, usage);
    const kept = bytesOf(data).slice();
    return { resourceType: 'buffer', glBuffer: lost ? null : upload(gl, target, kept), target, capacity: data.byteLength, kept };
};

/**
 * Writes over what a buffer holds. What is written has to fit: whoever owns it keeps count.
 *
 * The copy is written always, the card only while there is one.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const updateWebGL2Buffer = (gl: WebGL2RenderingContext, lost: boolean, buffer: IBuffer, data: Float32Array | Uint16Array | Uint32Array): void => {
    const target = buffer as TWebGL2Buffer;
    if (data.byteLength > target.capacity) {
        throw new Error(`[NacatamalOn] updateBuffer: ${data.byteLength} bytes do not fit in a buffer of ${target.capacity}. Make a bigger one.`);
    }
    target.kept.set(bytesOf(data));
    if (lost || target.glBuffer === null) {
        return;
    }
    gl.bindBuffer(target.target, target.glBuffer);
    gl.bufferSubData(target.target, 0, data);
    gl.bindBuffer(target.target, null);
};

/**
 * Makes the buffer again in a restored context, with every byte it held when it was lost.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const restoreWebGL2Buffer = (gl: WebGL2RenderingContext, buffer: TWebGL2Buffer): WebGLBuffer => upload(gl, buffer.target, buffer.kept);

/**
 * The `WebGLBuffer` behind a handle. Only valid for handles this backend made.
 *
 * @internal
 */
export const toGlBuffer = (buffer: IBuffer): WebGLBuffer | null => (buffer as TWebGL2Buffer).glBuffer;
