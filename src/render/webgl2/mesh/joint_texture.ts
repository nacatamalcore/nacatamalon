import { FORGET_JOINTS_AFTER } from '../../shared/joint_lifetime';
import type { TDrawSkeleton } from '../../interface/draw/t_draw_mesh';

/**
 * One skeleton's bones as a picture of numbers, and how many it was made for.
 */
type THeld = { texture: WebGLTexture; joints: number; writtenOn: number };

/**
 * Keeps each skeleton's bones on the graphics card **as a picture**, and fills it each frame.
 *
 * A picture rather than a block of numbers, because a block has its length written into the shader
 * when the shader is built and how many bones a model has is not known until its file arrives.
 * A picture has no such limit: it is as wide as the rig needs, four dots a bone, one dot per column
 * of its matrix, and the shader reads a dot at a time by its position rather than sampling it.
 *
 * **The filter has to be set even though nothing filters.** A picture left on its default is
 * *incomplete*, and an incomplete one reads as nothing at all, which puts every corner of the model
 * at the origin: a shape collapsed to a point, with no error anywhere.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createJointTextures = (gl: WebGL2RenderingContext) => {
    const held = new Map<string, THeld>();
    let frame = 0;

    return {
        /**
         * Says a new frame has begun, and lets go of the bones nothing has drawn for a while.
         */
        beginFrame: (): void => {
            frame++;
            for (const [key, entry] of held) {
                if (frame - entry.writtenOn > FORGET_JOINTS_AFTER) {
                    gl.deleteTexture(entry.texture);
                    held.delete(key);
                }
            }
        },

        /**
         * The bones of this skeleton as a picture, with this frame's numbers already in it.
         */
        upload: (skeleton: TDrawSkeleton): WebGLTexture | null => {
            const joints = skeleton.jointMatrices.length / 16;
            let entry = held.get(skeleton.key);

            if (entry === undefined || entry.joints !== joints) {
                if (entry !== undefined) {
                    gl.deleteTexture(entry.texture);
                }
                const texture = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, Math.max(joints * 4, 1), 1, 0, gl.RGBA, gl.FLOAT, null);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.bindTexture(gl.TEXTURE_2D, null);
                entry = { texture, joints, writtenOn: -1 };
                held.set(skeleton.key, entry);
            }

            // Marked as drawn even with no bones to write, so it is not let go of while in use.
            if (entry.writtenOn !== frame) {
                entry.writtenOn = frame;
                if (joints > 0) {
                    gl.bindTexture(gl.TEXTURE_2D, entry.texture);
                    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, joints * 4, 1, gl.RGBA, gl.FLOAT, skeleton.jointMatrices);
                    gl.bindTexture(gl.TEXTURE_2D, null);
                }
            }
            return entry.texture;
        },

        destroy: (): void => {
            for (const entry of held.values()) {
                gl.deleteTexture(entry.texture);
            }
            held.clear();
        },
    };
};

/**
 * What `createJointTextures` hands back.
 */
export type TJointTextures = ReturnType<typeof createJointTextures>;
