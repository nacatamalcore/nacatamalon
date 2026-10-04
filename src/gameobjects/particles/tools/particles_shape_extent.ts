import type { TParticlesDoc } from '../../../loaders/particles/types/t_particles_doc';

/**
 * The whole size of the box every place an effect can **give birth** fits in, in the emitter's own
 * space and units: pixels for a flat effect, units for one in depth.
 *
 * The emitter's footprint and not the effect's: particles are born inside it and then fly out, so a
 * plume is far bigger. That is why it is the right thing for a tool to draw around an emitter: it is
 * the part somebody places, and the part that stays still while the cloud moves. It lives next to
 * the shapes it measures so a shape added later cannot quietly measure nothing. A point measures
 * nothing on every axis, which is the truth about it.
 * @param doc - The effect.
 * @returns The size of the area particles are born in, on each axis.
 *
 * @category Particles
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const particlesShapeExtent = (doc: TParticlesDoc): { x: number; y: number; z: number } => {
    const shape = doc.shape;
    switch (shape.kind) {
        case 'circle':
            return { x: shape.radius * 2, y: shape.radius * 2, z: 0 };
        case 'rect':
            return { x: shape.width, y: shape.height, z: 0 };
        // The line itself, so a flat bar of rain measures flat rather than square.
        case 'line':
            return { x: Math.abs(Math.cos(shape.angle)) * shape.length, y: Math.abs(Math.sin(shape.angle)) * shape.length, z: 0 };
        case 'sphere':
            return { x: shape.radius * 2, y: shape.radius * 2, z: shape.radius * 2 };
        case 'box':
            return { x: shape.size[0], y: shape.size[1], z: shape.size[2] };
        // The disc at its base: a cone only aims along its axis, nothing is born up there.
        case 'cone':
            return { x: shape.radius * 2, y: shape.radius * 2, z: 0 };
        case 'point':
            return { x: 0, y: 0, z: 0 };
    }
};
