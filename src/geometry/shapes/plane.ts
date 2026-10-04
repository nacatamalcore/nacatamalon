import { addQuadFace, createGeometryBuilder } from '../build/geometry_builder';

/**
 * A flat sheet lying like a floor, facing up. Cut into squares when asked, which is what makes it
 * useful for anything that bends it later.
 *
 * The picture runs along X and Z, and the two paths below have to agree about that: they did not
 * once, and every textured floor came out a quarter turn round.
 *
 * @internal
 */
export const buildPlane = (width: number, depth: number, widthSegments: number, depthSegments: number) => {
    const b = createGeometryBuilder();

    if (widthSegments === 1 && depthSegments === 1) {
        addQuadFace(b, { x: 0, y: 0, z: 0 }, [0, 1, 0], [1, 0, 0], [0, 0, -1], width / 2, depth / 2);
        return b.build();
    }

    const halfW = width / 2;
    const halfD = depth / 2;
    const grid: number[][] = Array.from({ length: depthSegments + 1 }, () => []);

    for (let z = 0; z <= depthSegments; z++) {
        const zRatio = z / depthSegments;
        for (let x = 0; x <= widthSegments; x++) {
            const xRatio = x / widthSegments;
            grid[z][x] = b.addVertex(-halfW + xRatio * width, 0, -halfD + zRatio * depth, 0, 1, 0, xRatio, zRatio);
        }
    }

    for (let z = 0; z < depthSegments; z++) {
        for (let x = 0; x < widthSegments; x++) {
            const i00 = grid[z][x];
            const i10 = grid[z][x + 1];
            const i01 = grid[z + 1][x];
            const i11 = grid[z + 1][x + 1];
            b.addTriangle(i00, i01, i11);
            b.addTriangle(i00, i11, i10);
        }
    }

    return b.build();
};
