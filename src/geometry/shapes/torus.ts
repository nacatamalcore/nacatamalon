import { addRing, addRingQuads, createGeometryBuilder } from '../build/geometry_builder';

/**
 * A ring, like a doughnut: a small circle swept around a big one.
 *
 * @internal
 */
export const buildTorus = (radius: number, tube: number, radialSegments: number, tubularSegments: number) => {
    const b = createGeometryBuilder();

    const rings = Array.from({ length: radialSegments + 1 }, (_, i) => {
        const theta = (i / radialSegments) * Math.PI * 2;
        const cx = Math.cos(theta) * radius;
        const cz = -Math.sin(theta) * radius;
        const out: [number, number, number] = [Math.cos(theta), 0, -Math.sin(theta)];

        return addRing(
            b, tubularSegments,
            (phi) => [cx + Math.cos(phi) * out[0] * tube, Math.sin(phi) * tube, cz + Math.cos(phi) * out[2] * tube],
            (phi) => [Math.cos(phi) * out[0], Math.sin(phi), Math.cos(phi) * out[2]],
            i / radialSegments,
        );
    });

    for (let i = 0; i < radialSegments; i++) {
        addRingQuads(b, rings[i], rings[i + 1]);
    }

    return b.build();
};
