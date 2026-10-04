import { addDiskFan, createGeometryBuilder } from '../build/geometry_builder';

/**
 * Which way the slanted side faces at an angle around it.
 */
const slantNormal = (phi: number, radius: number, height: number): [number, number, number] => {
    const slope = radius / height;
    const len = Math.sqrt(1 + slope * slope);
    return [Math.cos(phi) / len, slope / len, -Math.sin(phi) / len];
};

/**
 * A cone with a base.
 *
 * One triangle per slice, each with its own tip: unlike the tube there is no ring at the top to
 * join to, because the tip is a single point and every slice meets it facing a different way.
 *
 * @internal
 */
export const buildCone = (radius: number, height: number, segments: number) => {
    const b = createGeometryBuilder();
    const halfHeight = height / 2;

    for (let i = 0; i < segments; i++) {
        const phi0 = (i / segments) * Math.PI * 2;
        const phi1 = ((i + 1) / segments) * Math.PI * 2;

        const apex = b.addVertex(0, halfHeight, 0, ...slantNormal(phi0, radius, height), i / segments, 0);
        const base0 = b.addVertex(Math.cos(phi0) * radius, -halfHeight, -Math.sin(phi0) * radius, ...slantNormal(phi0, radius, height), i / segments, 1);
        const base1 = b.addVertex(Math.cos(phi1) * radius, -halfHeight, -Math.sin(phi1) * radius, ...slantNormal(phi1, radius, height), (i + 1) / segments, 1);

        b.addTriangle(apex, base0, base1);
    }

    addDiskFan(b, -halfHeight, radius, segments, -1);
    return b.build();
};
