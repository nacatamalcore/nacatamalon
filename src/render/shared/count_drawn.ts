import type { TDrawItem, TDrawParticles, TDrawParticles3d } from '../interface';

/**
 * How much of each kind a pass is about to draw, worked out before anything is recorded: a buffer
 * that grew in the middle would leave the draws already recorded pointing at nothing, so the room
 * for all of them is made first.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDrawnCounts = {
    /** Models. */
    meshes: number;
    /** Map layers. */
    layers: number;
    /** Particles, those of every effect they set off included. */
    particles: number;
    /** Corners of lines. */
    lineCorners: number;
};

/**
 * Filled again by every call, so counting allocates nothing frame after frame.
 */
const counts: TDrawnCounts = { meshes: 0, layers: 0, particles: 0, lineCorners: 0 };

/**
 * An emitter's particles and those of every effect they set off, however deep.
 */
const countWithChildren = (item: TDrawParticles | TDrawParticles3d): number => {
    let total = item.count;
    for (const child of item.children ?? []) {
        total += countWithChildren(child);
    }
    return total;
};

/**
 * Counts what a pass draws, in one walk of it. It used to be one walk per kind, and in a scene of
 * many thousands of sprites, which are none of these, those walks were a sizeable part of the frame.
 *
 * Shared by both backends, so the two reserve the same room. **What comes back is good until the
 * next call**: it is the same object every time.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const countDrawn = (drawables: readonly TDrawItem[]): TDrawnCounts => {
    counts.meshes = 0;
    counts.layers = 0;
    counts.particles = 0;
    counts.lineCorners = 0;
    for (let i = 0; i < drawables.length; i++) {
        const item = drawables[i];
        switch (item.type) {
            case 'sprite':
                break;
            case 'mesh':
                counts.meshes++;
                break;
            case 'tilemap':
                counts.layers++;
                break;
            case 'particles':
            case 'particles-3d':
                counts.particles += countWithChildren(item);
                break;
            case 'lines':
                counts.lineCorners += item.count;
                break;
            default:
                break;
        }
    }
    return counts;
};
