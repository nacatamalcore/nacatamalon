import { addDiskFan, addRing, addRingQuads, createGeometryBuilder } from '../build/geometry_builder';

/**
 * A tube with a lid and a base.
 *
 * @internal
 */
export const buildCylinder = (radius: number, height: number, segments: number) => {
    const b = createGeometryBuilder();
    const halfHeight = height / 2;
    const radial = (phi: number): [number, number, number] => [Math.cos(phi), 0, -Math.sin(phi)];

    const top = addRing(b, segments, (phi) => {
        const [nx, , nz] = radial(phi);
        return [nx * radius, halfHeight, nz * radius];
    }, radial, 0);
    const bottom = addRing(b, segments, (phi) => {
        const [nx, , nz] = radial(phi);
        return [nx * radius, -halfHeight, nz * radius];
    }, radial, 1);

    addRingQuads(b, top, bottom);
    addDiskFan(b, halfHeight, radius, segments, 1);
    addDiskFan(b, -halfHeight, radius, segments, -1);

    return b.build();
};
