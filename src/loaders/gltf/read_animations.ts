import { readFloats } from './read_accessors';
import type { TSkeletalChannel, TSkeletalClip, TSkeletalSampler, TInterpolation } from '../../animation';
import type { TGltfDoc } from './types/t_gltf_doc';

/**
 * The three parts of a bone an animation is allowed to move.
 */
const MOVABLE = new Set(['translation', 'rotation', 'scale']);

/**
 * Reads every named movement in the file.
 *
 * A channel that moves something which is not a bone of any rig is dropped: a file may animate a
 * camera, a light or the shape of a face, and none of those are things this engine's skeletons
 * know about. Dropping quietly is right here, because the model still plays correctly without them.
 *
 * `where` says which bone of which rig each node of the file is, which is what lets one clip drive
 * a file that holds more than one rig.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const readAnimations = (
    doc: TGltfDoc,
    buffers: ArrayBuffer[],
    where: Map<number, { skeleton: number; joint: number }>,
): TSkeletalClip[] =>
    (doc.animations ?? []).map((animation, index) => {
        const samplers: TSkeletalSampler[] = animation.samplers.map((sampler) => ({
            input: readFloats(doc, buffers, sampler.input),
            output: readFloats(doc, buffers, sampler.output),
            interpolation: (sampler.interpolation ?? 'LINEAR') as TInterpolation,
        }));

        const channels: TSkeletalChannel[] = [];
        for (const channel of animation.channels) {
            const node = channel.target.node;
            const bone = node === undefined ? undefined : where.get(node);
            if (bone === undefined || !MOVABLE.has(channel.target.path)) {
                continue;
            }
            channels.push({
                skeleton: bone.skeleton,
                joint: bone.joint,
                path: channel.target.path as TSkeletalChannel['path'],
                sampler: channel.sampler,
            });
        }

        // How long it lasts is the latest key any of its runs reaches, not the longest run: two
        // runs of the same length can end at different times.
        let duration = 0;
        for (const sampler of samplers) {
            const last = sampler.input[sampler.input.length - 1] ?? 0;
            if (last > duration) {
                duration = last;
            }
        }

        return { type: 'clip' as const, name: animation.name ?? `clip${index}`, duration, channels, samplers };
    });
