import { addDiskFan, createGeometryBuilder } from '../build/geometry_builder';

/**
 * A flat disc facing up.
 *
 * @internal
 */
export const buildCircle = (radius: number, segments: number) => {
    const b = createGeometryBuilder();
    addDiskFan(b, 0, radius, segments, 1);
    return b.build();
};
