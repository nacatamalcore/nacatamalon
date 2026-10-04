import type { TGeometrySource } from './types/t_geometry_source';
import { createRecord } from '../gameobjects/create_record';
import { COLOR_STRIDE, GEOMETRY_STRIDE } from './types/t_geometry';
import type { TRuntimeStore } from '../store';
import type { TGeometry } from './types/t_geometry';

/**
 * The box a shape fits inside, in its own units. Worked out here because this is the last moment
 * the corners exist on this side: once they are on the graphics card they cannot be read back.
 *
 * @internal
 */
const boundsOf = (vertices: Float32Array): TGeometry['bounds'] => {
    if (vertices.length < GEOMETRY_STRIDE) {
        return null;
    }
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (let i = 0; i < vertices.length; i += GEOMETRY_STRIDE) {
        const x = vertices[i];
        const y = vertices[i + 1];
        const z = vertices[i + 2];
        if (x < min.x) min.x = x;
        if (y < min.y) min.y = y;
        if (z < min.z) min.z = z;
        if (x > max.x) max.x = x;
        if (y > max.y) max.y = y;
        if (z > max.z) max.z = z;
    }
    return { min, max };
};

/**
 * The corners' places on their own, for anything that has to measure the shape later.
 */
const positionsOf = (vertices: Float32Array): Float32Array | null => {
    if (vertices.length < GEOMETRY_STRIDE) {
        return null;
    }
    const count = Math.floor(vertices.length / GEOMETRY_STRIDE);
    const out = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        out[i * 3] = vertices[i * GEOMETRY_STRIDE];
        out[i * 3 + 1] = vertices[i * GEOMETRY_STRIDE + 1];
        out[i * 3 + 2] = vertices[i * GEOMETRY_STRIDE + 2];
    }
    return out;
};

/**
 * The painted colours as the card takes them: four bytes a corner, handed over four at a time as one
 * number, which is how a run of bytes fits the buffer calls every backend already has. A shape with
 * none is painted white, which multiplies into nothing.
 */
const colorsFor = (count: number, colors: Uint8Array | null | undefined): Uint32Array => {
    const bytes = new Uint8Array(count * COLOR_STRIDE);
    if (colors === undefined || colors === null) {
        bytes.fill(255);
    } else {
        bytes.set(colors.subarray(0, bytes.length));
    }
    return new Uint32Array(bytes.buffer);
};

/**
 * Puts a built shape on the graphics card and keeps it under its name.
 *
 * Whoever calls this has already looked in the cache: building the shape and then finding out it
 * was there would throw away the work that looking first avoids.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const uploadGeometry = (
    store: TRuntimeStore,
    key: string,
    { vertices, indices, skin, colors }: {
        vertices: Float32Array;
        indices: Uint16Array | Uint32Array;
        skin?: Float32Array | null;
        colors?: Uint8Array | null;
    },
    source: TGeometrySource | null = null,
): TGeometry => {
    const renderer = store.get('screen').renderer;
    const geometry = createRecord('geometry', {
        key,
        status: 'ready' as const,
        source,
        // Taken from what was handed over rather than asked for: whoever built the shape already
        // knew whether its corners fit in the narrow one, and being told twice is a chance to differ.
        indexType: indices instanceof Uint32Array ? ('uint32' as const) : ('uint16' as const),
        vertexCount: vertices.length / GEOMETRY_STRIDE,
        indexCount: indices.length,
        bounds: boundsOf(vertices),
        positions: positionsOf(vertices),
        indices,
        vertexBuffer: renderer.createBuffer(vertices, 'vertex'),
        indexBuffer: renderer.createBuffer(indices, 'index'),
        skinBuffer: skin === undefined || skin === null ? null : renderer.createBuffer(skin, 'vertex'),
        colorBuffer: renderer.createBuffer(colorsFor(vertices.length / GEOMETRY_STRIDE, colors), 'vertex'),
    });

    store.get('assets').geometries.set(key, geometry);
    return geometry;
};
