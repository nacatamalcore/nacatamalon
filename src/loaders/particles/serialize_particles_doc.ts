import { PARTICLES_FORMAT } from './types/t_particles_doc';
import type { TColor } from '../../color';
import type { TParticlesDoc } from './types/t_particles_doc';

/**
 * A colour as the file writes it, `#rrggbb`: its opacity lives in the stop, next to it.
 */
const toHex = (color: TColor): string =>
    `#${[color.r, color.g, color.b]
        .map((channel) => Math.round(Math.min(1, Math.max(0, channel)) * 255).toString(16).padStart(2, '0'))
        .join('')}`;

/**
 * Writes an effect back out as the text of a `.particles` file, for a tool that saves one.
 *
 * In the order the files already on disk have, so saving an effect nobody changed leaves nothing to
 * review. What is not there is not written: an effect with no tail does not grow `"trail": null`,
 * and one nobody measured does not grow a box of nothing, which would read as "measured, reaches
 * nothing". Whatever the file declared that this version does not read goes back at the end, as it
 * was written.
 *
 * @param doc - The effect to write.
 * @returns The file's text.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const serializeParticlesDoc = (doc: TParticlesDoc): string => {
    const out: Record<string, unknown> = {
        format: PARTICLES_FORMAT,
        kind: doc.kind,
        ...(doc.atlas !== null ? { atlas: doc.atlas } : {}),
        ...(doc.texture !== null ? { texture: doc.texture } : {}),
        ...(doc.frame !== null ? { frame: doc.frame } : {}),
        ...(doc.anim !== null ? { anim: doc.anim } : {}),
        max: doc.max,
        blend: doc.blend,
        worldSpace: doc.worldSpace,
        emission: doc.emission,
        shape: doc.shape,
        direction: doc.direction,
        spread: doc.spread,
        life: doc.life,
        speed: doc.speed,
        size: doc.size,
        spin: doc.spin,
        gravity: doc.gravity,
        damping: doc.damping,
        colorOverLife: doc.colorOverLife.map((stop) => ({ t: stop.t, color: toHex(stop.color), alpha: stop.alpha })),
        sizeOverLife: doc.sizeOverLife,
        ...(doc.trail !== null ? { trail: doc.trail } : {}),
        ...(doc.bounds !== null ? { bounds: doc.bounds } : {}),
        ...(doc.children.length > 0 ? { children: doc.children } : {}),
        ...(doc.collision !== null ? { collision: doc.collision } : {}),
        ...doc.unsupported,
    };
    return `${JSON.stringify(out, null, 4)}\n`;
};
