import { addQuadFace, createGeometryBuilder } from '../build/geometry_builder';

/**
 * A box, centred on nothing in particular: six flat faces, each looking outwards.
 *
 * @internal
 */
export const buildCube = (width: number, height: number, depth: number) => {
    const b = createGeometryBuilder();
    const hx = width / 2;
    const hy = height / 2;
    const hz = depth / 2;

    addQuadFace(b, { x: hx, y: 0, z: 0 }, [1, 0, 0], [0, 1, 0], [0, 0, 1], hy, hz);
    addQuadFace(b, { x: -hx, y: 0, z: 0 }, [-1, 0, 0], [0, 0, 1], [0, 1, 0], hz, hy);
    addQuadFace(b, { x: 0, y: hy, z: 0 }, [0, 1, 0], [0, 0, 1], [1, 0, 0], hz, hx);
    addQuadFace(b, { x: 0, y: -hy, z: 0 }, [0, -1, 0], [1, 0, 0], [0, 0, 1], hx, hz);
    addQuadFace(b, { x: 0, y: 0, z: hz }, [0, 0, 1], [1, 0, 0], [0, 1, 0], hx, hy);
    addQuadFace(b, { x: 0, y: 0, z: -hz }, [0, 0, -1], [0, 1, 0], [1, 0, 0], hy, hx);

    return b.build();
};
