import { addRing, addRingQuads, createGeometryBuilder } from '../build/geometry_builder';

/**
 * A ball built as lines of latitude, the way a globe is drawn: rings from pole to pole, joined.
 *
 * Its squares bunch up at the poles, which is the price of a picture that wraps round it neatly.
 * The evenly divided one is the icosphere.
 *
 * @internal
 */
export const buildUvSphere = (radius: number, segments: number, rings: number) => {
    const b = createGeometryBuilder();

    const ringList = Array.from({ length: rings + 1 }, (_, i) => {
        const theta = (i / rings) * Math.PI;
        const y = Math.cos(theta) * radius;
        const ringRadius = Math.sin(theta) * radius;

        return addRing(
            b, segments,
            (phi) => [Math.cos(phi) * ringRadius, y, -Math.sin(phi) * ringRadius],
            (phi) => [Math.cos(phi) * Math.sin(theta), Math.cos(theta), -Math.sin(phi) * Math.sin(theta)],
            i / rings,
        );
    });

    for (let i = 0; i < rings; i++) {
        addRingQuads(b, ringList[i], ringList[i + 1]);
    }

    return b.build();
};
