import {
    GLTF_COMPONENT_COUNT, GLTF_FLOAT, GLTF_UNSIGNED_BYTE, GLTF_UNSIGNED_INT, GLTF_UNSIGNED_SHORT,
} from './types/t_gltf_doc';
import { toScreen } from './to_screen';
import type { TGltfDoc } from './types/t_gltf_doc';

/**
 * The block of numbers an accessor points into, and where in it to start.
 */
const locate = (doc: TGltfDoc, buffers: ArrayBuffer[], index: number) => {
    const accessor = doc.accessors?.[index];
    if (accessor === undefined) {
        throw new Error(`[NacatamalOn] useLoadGltf: the file points at a run of numbers (${index}) it does not contain.`);
    }

    const view = accessor.bufferView !== undefined ? doc.bufferViews?.[accessor.bufferView] : undefined;
    if (view === undefined) {
        throw new Error('[NacatamalOn] useLoadGltf: a run of numbers in the file points nowhere.');
    }

    const bytes = buffers[view.buffer];
    if (bytes === undefined) {
        throw new Error('[NacatamalOn] useLoadGltf: the file points at a block of numbers it does not contain.');
    }
    return { accessor, view, bytes, at: (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) };
};

/**
 * Reads a run of decimal numbers: where the corners are, which way they face, what they show.
 *
 * Read one number at a time through a `DataView` rather than laid over with a `Float32Array`,
 * because a file is free to interleave several runs in one block and say how far apart their
 * entries sit. Laying an array over that would read the neighbours' numbers as its own.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const readFloats = (doc: TGltfDoc, buffers: ArrayBuffer[], index: number): Float32Array => {
    const { accessor, view, bytes, at } = locate(doc, buffers, index);
    if (accessor.componentType !== GLTF_FLOAT) {
        throw new Error(`[NacatamalOn] useLoadGltf: a run of numbers is stored as kind ${accessor.componentType}; only decimals are read.`);
    }

    const each = GLTF_COMPONENT_COUNT[accessor.type];
    const stride = view.byteStride ?? each * 4;
    const data = new DataView(bytes);
    const out = new Float32Array(accessor.count * each);
    for (let i = 0; i < accessor.count; i++) {
        const base = at + i * stride;
        for (let c = 0; c < each; c++) {
            out[i * each + c] = data.getFloat32(base + c * 4, true);
        }
    }
    return out;
};

/**
 * Reads the order the corners make triangles in.
 *
 * **The width comes back as it was written.** A file counting past 65.535 corners says so by
 * storing its numbers four bytes wide, and narrowing them here would fold a large model back onto
 * its own beginning. The narrow ones stay narrow, which is half the memory for the overwhelming
 * majority of models that never need more.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const readIndices = (doc: TGltfDoc, buffers: ArrayBuffer[], index: number): Uint16Array | Uint32Array => {
    const { accessor, view, bytes, at } = locate(doc, buffers, index);
    const data = new DataView(bytes);

    if (accessor.componentType === GLTF_UNSIGNED_INT) {
        const stride = view.byteStride ?? 4;
        const out = new Uint32Array(accessor.count);
        for (let i = 0; i < accessor.count; i++) {
            out[i] = data.getUint32(at + i * stride, true);
        }
        return out;
    }

    const out = new Uint16Array(accessor.count);
    if (accessor.componentType === GLTF_UNSIGNED_SHORT) {
        const stride = view.byteStride ?? 2;
        for (let i = 0; i < accessor.count; i++) {
            out[i] = data.getUint16(at + i * stride, true);
        }
        return out;
    }
    if (accessor.componentType === GLTF_UNSIGNED_BYTE) {
        const stride = view.byteStride ?? 1;
        for (let i = 0; i < accessor.count; i++) {
            out[i] = data.getUint8(at + i * stride);
        }
        return out;
    }

    throw new Error(`[NacatamalOn] useLoadGltf: the triangle order is stored as kind ${accessor.componentType}, which is not one this engine reads.`);
};

/**
 * Reads which bones move a corner, as decimals.
 *
 * They are whole numbers in the file, one or two bytes each, and they come back as decimals so they
 * can travel beside the weights in one run: a graphics card reads a run of corners in one format,
 * and two formats would mean two runs for eight numbers.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const readJoints = (doc: TGltfDoc, buffers: ArrayBuffer[], index: number): Float32Array => {
    const { accessor, view, bytes, at } = locate(doc, buffers, index);
    const data = new DataView(bytes);
    const out = new Float32Array(accessor.count * 4);

    if (accessor.componentType === GLTF_UNSIGNED_SHORT) {
        const stride = view.byteStride ?? 8;
        for (let i = 0; i < accessor.count; i++) {
            for (let c = 0; c < 4; c++) {
                out[i * 4 + c] = data.getUint16(at + i * stride + c * 2, true);
            }
        }
        return out;
    }
    if (accessor.componentType === GLTF_UNSIGNED_BYTE) {
        const stride = view.byteStride ?? 4;
        for (let i = 0; i < accessor.count; i++) {
            for (let c = 0; c < 4; c++) {
                out[i * 4 + c] = data.getUint8(at + i * stride + c);
            }
        }
        return out;
    }

    throw new Error(`[NacatamalOn] useLoadGltf: the bones of a corner are stored as kind ${accessor.componentType}, which is not one this engine reads.`);
};

/**
 * A painted byte in linear light, as the screen colour it stands for. Worked out once per value.
 */
const SCREEN_BYTE = Uint8Array.from({ length: 256 }, (_, v) => Math.round(toScreen(v / 255) * 255));

/**
 * Reads the colour painted on each corner, as four screen bytes apiece: red, green, blue and how
 * opaque.
 *
 * The format allows a file to store it three ways (decimals, or whole numbers a byte or two wide
 * standing for 0 to 1) and with or without the fourth number. All of them arrive here the same way,
 * so nothing downstream has to ask which one a file chose. A missing fourth number is fully opaque.
 *
 * **The colour is stored in linear light, like every glTF colour**, and turned into a screen colour
 * here, the same way a surface's colour is. Without that a painted cave comes out far darker than the
 * artist left it. How opaque it is was never a colour, so it is taken as it comes.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const readColors = (doc: TGltfDoc, buffers: ArrayBuffer[], index: number): Uint8Array => {
    const { accessor, view, bytes, at } = locate(doc, buffers, index);
    const each = GLTF_COMPONENT_COUNT[accessor.type];
    if (each !== 3 && each !== 4) {
        throw new Error(`[NacatamalOn] useLoadGltf: a corner's colour has ${each} numbers; it should have three or four.`);
    }

    const data = new DataView(bytes);
    const out = new Uint8Array(accessor.count * 4);
    const toByte = (linear: number): number => Math.round(toScreen(Math.min(Math.max(linear, 0), 1)) * 255);

    if (accessor.componentType === GLTF_UNSIGNED_BYTE) {
        const stride = view.byteStride ?? each;
        for (let i = 0; i < accessor.count; i++) {
            const base = at + i * stride;
            out[i * 4] = SCREEN_BYTE[data.getUint8(base)];
            out[i * 4 + 1] = SCREEN_BYTE[data.getUint8(base + 1)];
            out[i * 4 + 2] = SCREEN_BYTE[data.getUint8(base + 2)];
            out[i * 4 + 3] = each === 4 ? data.getUint8(base + 3) : 255;
        }
        return out;
    }
    if (accessor.componentType === GLTF_UNSIGNED_SHORT) {
        const stride = view.byteStride ?? each * 2;
        for (let i = 0; i < accessor.count; i++) {
            const base = at + i * stride;
            for (let c = 0; c < 3; c++) {
                out[i * 4 + c] = toByte(data.getUint16(base + c * 2, true) / 65535);
            }
            out[i * 4 + 3] = each === 4 ? Math.round(data.getUint16(base + 6, true) / 257) : 255;
        }
        return out;
    }
    if (accessor.componentType === GLTF_FLOAT) {
        const stride = view.byteStride ?? each * 4;
        for (let i = 0; i < accessor.count; i++) {
            const base = at + i * stride;
            for (let c = 0; c < 3; c++) {
                out[i * 4 + c] = toByte(data.getFloat32(base + c * 4, true));
            }
            out[i * 4 + 3] = each === 4 ? Math.round(Math.min(Math.max(data.getFloat32(base + 12, true), 0), 1) * 255) : 255;
        }
        return out;
    }

    throw new Error(`[NacatamalOn] useLoadGltf: a corner's colour is stored as kind ${accessor.componentType}, which is not one this engine reads.`);
};

/**
 * The raw bytes a slice of the file holds, for a picture kept inside it rather than beside it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const readBufferView = (doc: TGltfDoc, buffers: ArrayBuffer[], index: number): ArrayBuffer => {
    const view = doc.bufferViews?.[index];
    if (view === undefined || buffers[view.buffer] === undefined) {
        throw new Error('[NacatamalOn] useLoadGltf: the file points at a slice of itself that is not there.');
    }
    const at = view.byteOffset ?? 0;
    return buffers[view.buffer].slice(at, at + (view.byteLength ?? 0));
};
