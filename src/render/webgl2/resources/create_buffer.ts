import type { IBuffer, TBufferUsage } from '../../interface';

/**
 * What an `IBuffer` is inside the WebGL2 backend. Never leaves `render/webgl2`.
 *
 * @internal
 */
export type TWebGL2Buffer = IBuffer & {
    glBuffer: WebGLBuffer;
    /**
     * Which kind of slot it binds to, so an update finds it again.
     */
    target: number;
    /**
     * How many bytes it was made for, which is not how many are drawn right now.
     */
    capacity: number;
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

/**
 * Uploads numbers and hands back a handle to them.
 *
 * `DYNAMIC_DRAW` because what this backend is asked to keep is mostly geometry that gets rewritten:
 * a map's layer when a tile changes. It is a hint, not a promise, and a buffer nobody rewrites loses
 * nothing by it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createWebGL2Buffer = (gl: WebGL2RenderingContext, data: Float32Array | Uint16Array | Uint32Array, usage: TBufferUsage): TWebGL2Buffer => {
    const target = targetOf(gl, usage);
    const glBuffer = gl.createBuffer();
    gl.bindBuffer(target, glBuffer);
    gl.bufferData(target, data, gl.DYNAMIC_DRAW);
    gl.bindBuffer(target, null);
    return { resourceType: 'buffer', glBuffer, target, capacity: data.byteLength };
};

/**
 * Writes over what a buffer holds. What is written has to fit: whoever owns it keeps count.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const updateWebGL2Buffer = (gl: WebGL2RenderingContext, buffer: IBuffer, data: Float32Array | Uint16Array): void => {
    const target = buffer as TWebGL2Buffer;
    if (data.byteLength > target.capacity) {
        throw new Error(`[NacatamalOn] updateBuffer: ${data.byteLength} bytes do not fit in a buffer of ${target.capacity}. Make a bigger one.`);
    }
    gl.bindBuffer(target.target, target.glBuffer);
    gl.bufferSubData(target.target, 0, data);
    gl.bindBuffer(target.target, null);
};

/**
 * The `WebGLBuffer` behind a handle. Only valid for handles this backend made.
 *
 * @internal
 */
export const toGlBuffer = (buffer: IBuffer): WebGLBuffer => (buffer as TWebGL2Buffer).glBuffer;
