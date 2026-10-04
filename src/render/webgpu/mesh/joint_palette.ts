import type { TDrawSkeleton } from '../../interface/draw/t_draw_mesh';

/**
 * One skeleton's bones on the card, and how many it was made for.
 */
type THeld = { buffer: GPUBuffer; joints: number; writtenOn: number };

/**
 * Keeps each skeleton's bones on the graphics card, and puts this frame's numbers in them.
 *
 * **A run of the storage kind, not a block of the uniform kind**, because how many bones a model
 * has is not known until its file arrives: a uniform block has its length written into the shader
 * when the shader is built, which would mean a ceiling picked in advance and memory wasted by every
 * model under it. This way a rig of four bones costs four.
 *
 * Written once a frame however many models wear the same bones, which is the ordinary case for a
 * crowd: the numbers are the same for all of them.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createJointPalette = (device: GPUDevice) => {
    const held = new Map<string, THeld>();
    let frame = 0;

    return {
        /**
         * Says a new frame has begun, so each skeleton is written once more.
         */
        beginFrame: (): void => { frame++; },

        /**
         * The bones of this skeleton on the card, with this frame's numbers already in them.
         */
        upload: (skeleton: TDrawSkeleton): GPUBuffer => {
            const joints = skeleton.jointMatrices.length / 16;
            let entry = held.get(skeleton.key);

            // Made again when the rig changed size, which happens when a model is reloaded under a
            // name something else already used. Core never does this and the buffer silently stays
            // the wrong size.
            if (entry === undefined || entry.joints !== joints) {
                entry?.buffer.destroy();
                entry = {
                    buffer: device.createBuffer({
                        label: `skeleton ${skeleton.key}`,
                        // Never nothing: a rig with no bones would ask for a buffer of no bytes.
                        size: Math.max(joints * 64, 64),
                        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                    }),
                    joints,
                    writtenOn: -1,
                };
                held.set(skeleton.key, entry);
            }

            if (entry.writtenOn !== frame) {
                entry.writtenOn = frame;
                device.queue.writeBuffer(entry.buffer, 0, skeleton.jointMatrices);
            }
            return entry.buffer;
        },

        destroy: (): void => {
            for (const entry of held.values()) {
                entry.buffer.destroy();
            }
            held.clear();
        },
    };
};

/**
 * What `createJointPalette` hands back.
 */
export type TJointPalette = ReturnType<typeof createJointPalette>;
