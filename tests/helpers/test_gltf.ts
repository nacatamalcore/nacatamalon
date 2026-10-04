import { spyOn } from 'bun:test';

/**
 * Model files, built in memory and served.
 *
 * A glTF file is a description pointing into a block of numbers, so a test that wants to know how
 * a corner comes out has to write both. Building them here rather than keeping sample files on
 * disk is what lets a test say "a triangle turned by its node" and read the answer back: the input
 * is three numbers in the test itself, not something to go and look at.
 *
 * The same description is served as either shape, text with its numbers beside it or one binary,
 * which is how the two are shown to agree.
 */

/**
 * One run of triangles: where its corners are, and optionally how they face and what they show.
 */
export type TTestPrimitive = {
    positions: number[];
    normals?: number[];
    uvs?: number[];
    indices?: number[];
    material?: number;
    mode?: number;
    /**
     * Four bone numbers a corner.
     */
    joints?: number[];
    /**
     * Four weights a corner.
     */
    weights?: number[];
    /**
     * How wide the bone numbers are written. Default 16.
     */
    jointBits?: 8 | 16;
    /**
     * The colour painted on each corner, three or four numbers apiece as `colorType` says, written
     * in `colorFormat`: bytes and shorts as whole numbers standing for 0 to 1, decimals as they are.
     */
    colors?: number[];
    colorFormat?: 'u8' | 'u16' | 'float';
    colorType?: 'VEC3' | 'VEC4';
};

/**
 * One piece of the file's tree.
 */
export type TTestNode = {
    name?: string;
    /**
     * Which rig deforms this node's mesh.
     */
    skin?: number;
    primitives?: TTestPrimitive[];
    translation?: [number, number, number];
    rotation?: [number, number, number, number];
    scale?: [number, number, number];
    matrix?: number[];
    children?: number[];
};

/**
 * A surface, in the few terms the engine reads back out of one.
 */
export type TTestMaterial = {
    name?: string;
    baseColorFactor?: [number, number, number, number];
    image?: string;
    /**
     * A picture kept inside the file itself, which is what a binary export usually does.
     */
    embeddedImage?: string;
    emissiveFactor?: [number, number, number];
    emissiveStrength?: number;
    /**
     * Declares a picture masking the glow, which the engine does not read but must notice.
     */
    emissiveMask?: boolean;
    /**
     * What the picture does past its edge each way, in the format's numbers. Left out, no sampler.
     */
    wrapS?: number;
    wrapT?: number;
};

/**
 * A rig: which nodes are its bones, and what undoes their rest position.
 */
export type TTestSkin = {
    joints: number[];
    /**
     * 16 numbers a bone, in the order `joints` lists them. Left out means every bone rests at the origin.
     */
    inverseBindMatrices?: number[];
};

/**
 * A movement: what it moves, and the values it moves through.
 */
export type TTestAnimation = {
    name?: string;
    channels: Array<{
        node: number;
        path: 'translation' | 'rotation' | 'scale' | 'weights';
        times: number[];
        values: number[];
        interpolation?: 'LINEAR' | 'STEP' | 'CUBICSPLINE';
    }>;
};

export type TTestModel = {
    nodes: TTestNode[];
    skins?: TTestSkin[];
    animations?: TTestAnimation[];
    /**
     * Which nodes the scene starts from. All of them, by default.
     */
    roots?: number[];
    materials?: TTestMaterial[];
    /**
     * How wide the triangle order is written. Default 16.
     */
    indexBits?: 8 | 16 | 32;
};

/**
 * A square, one unit across, sitting on the origin and facing the viewer.
 */
export const TEST_QUAD: TTestPrimitive = {
    positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: [0, 1, 2, 0, 2, 3],
};

const COMPONENT = { float: 5126, u8: 5121, u16: 5123, u32: 5125 };

/**
 * Builds the description and the block of numbers together, so they cannot disagree.
 */
const assemble = (model: TTestModel) => {
    const chunks: Uint8Array[] = [];
    const accessors: unknown[] = [];
    const bufferViews: unknown[] = [];
    let offset = 0;

    const put = (bytes: Uint8Array, componentType: number, type: string, count: number, normalized = false): number => {
        // Every run starts on a round four bytes, which is what the format asks for and what a
        // reader laying numbers over it would assume.
        const pad = (4 - (offset % 4)) % 4;
        if (pad > 0) {
            chunks.push(new Uint8Array(pad));
            offset += pad;
        }
        bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength });
        accessors.push({ bufferView: bufferViews.length - 1, componentType, count, type, ...(normalized ? { normalized } : {}) });
        chunks.push(bytes);
        offset += bytes.byteLength;
        return accessors.length - 1;
    };

    const putRaw = (bytes: Uint8Array): number => {
        const pad = (4 - (offset % 4)) % 4;
        if (pad > 0) {
            chunks.push(new Uint8Array(pad));
            offset += pad;
        }
        bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength });
        chunks.push(bytes);
        offset += bytes.byteLength;
        return bufferViews.length - 1;
    };

    const PER = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 } as Record<string, number>;

    const floats = (values: number[], type: string): number => {
        const array = new Float32Array(values);
        return put(new Uint8Array(array.buffer), COMPONENT.float, type, values.length / PER[type]);
    };

    const indices = (values: number[]): number => {
        const bits = model.indexBits ?? 16;
        if (bits === 32) {
            return put(new Uint8Array(new Uint32Array(values).buffer), COMPONENT.u32, 'SCALAR', values.length);
        }
        if (bits === 8) {
            return put(Uint8Array.from(values), COMPONENT.u8, 'SCALAR', values.length);
        }
        return put(new Uint8Array(new Uint16Array(values).buffer), COMPONENT.u16, 'SCALAR', values.length);
    };

    const wholes = (values: number[], bits: 8 | 16): number => {
        if (bits === 8) {
            return put(Uint8Array.from(values), COMPONENT.u8, 'VEC4', values.length / 4);
        }
        return put(new Uint8Array(new Uint16Array(values).buffer), COMPONENT.u16, 'VEC4', values.length / 4);
    };

    const colors = (primitive: TTestPrimitive): number => {
        const values = primitive.colors ?? [];
        const type = primitive.colorType ?? 'VEC4';
        const count = values.length / PER[type];
        const format = primitive.colorFormat ?? 'u8';
        if (format === 'float') {
            return floats(values, type);
        }
        if (format === 'u16') {
            return put(new Uint8Array(new Uint16Array(values).buffer), COMPONENT.u16, type, count, true);
        }
        return put(Uint8Array.from(values), COMPONENT.u8, type, count, true);
    };

    const meshes: unknown[] = [];
    const nodes = model.nodes.map((node) => {
        const out: Record<string, unknown> = {};
        if (node.name !== undefined) out.name = node.name;
        if (node.translation !== undefined) out.translation = node.translation;
        if (node.rotation !== undefined) out.rotation = node.rotation;
        if (node.scale !== undefined) out.scale = node.scale;
        if (node.matrix !== undefined) out.matrix = node.matrix;
        if (node.children !== undefined) out.children = node.children;
        if (node.skin !== undefined) out.skin = node.skin;

        if (node.primitives !== undefined) {
            meshes.push({
                primitives: node.primitives.map((primitive) => {
                    const attributes: Record<string, number> = { POSITION: floats(primitive.positions, 'VEC3') };
                    if (primitive.normals !== undefined) attributes.NORMAL = floats(primitive.normals, 'VEC3');
                    if (primitive.uvs !== undefined) attributes.TEXCOORD_0 = floats(primitive.uvs, 'VEC2');
                    if (primitive.joints !== undefined) attributes.JOINTS_0 = wholes(primitive.joints, primitive.jointBits ?? 16);
                    if (primitive.weights !== undefined) attributes.WEIGHTS_0 = floats(primitive.weights, 'VEC4');
                    if (primitive.colors !== undefined) attributes.COLOR_0 = colors(primitive);
                    const out2: Record<string, unknown> = { attributes };
                    if (primitive.indices !== undefined) out2.indices = indices(primitive.indices);
                    if (primitive.material !== undefined) out2.material = primitive.material;
                    if (primitive.mode !== undefined) out2.mode = primitive.mode;
                    return out2;
                }),
            });
            out.mesh = meshes.length - 1;
        }
        return out;
    });

    const skins = (model.skins ?? []).map((skin) => ({
        joints: skin.joints,
        ...(skin.inverseBindMatrices === undefined ? {} : { inverseBindMatrices: floats(skin.inverseBindMatrices, 'MAT4') }),
    }));

    const animations = (model.animations ?? []).map((animation, index) => {
        const samplers: unknown[] = [];
        const channels = animation.channels.map((channel) => {
            samplers.push({
                input: floats(channel.times, 'SCALAR'),
                output: floats(channel.values, channel.path === 'rotation' ? 'VEC4' : 'VEC3'),
                interpolation: channel.interpolation ?? 'LINEAR',
            });
            return { sampler: samplers.length - 1, target: { node: channel.node, path: channel.path } };
        });
        return { name: animation.name ?? `clip${index}`, channels, samplers };
    });

    const images: unknown[] = [];
    const textures: unknown[] = [];
    const imageSamplers: unknown[] = [];
    /**
     * The picture just listed, with a sampler of its own when the material asks for one.
     */
    const texture = (material: TTestMaterial): Record<string, unknown> => {
        if (material.wrapS === undefined && material.wrapT === undefined) {
            return { source: images.length - 1 };
        }
        imageSamplers.push({
            ...(material.wrapS !== undefined ? { wrapS: material.wrapS } : {}),
            ...(material.wrapT !== undefined ? { wrapT: material.wrapT } : {}),
        });
        return { source: images.length - 1, sampler: imageSamplers.length - 1 };
    };
    const materials = (model.materials ?? []).map((material) => {
        const pbr: Record<string, unknown> = {};
        if (material.baseColorFactor !== undefined) pbr.baseColorFactor = material.baseColorFactor;
        if (material.embeddedImage !== undefined) {
            images.push({ bufferView: putRaw(new TextEncoder().encode(material.embeddedImage)), mimeType: 'image/png' });
            textures.push(texture(material));
            pbr.baseColorTexture = { index: textures.length - 1 };
        } else if (material.image !== undefined) {
            images.push({ uri: material.image });
            textures.push(texture(material));
            pbr.baseColorTexture = { index: textures.length - 1 };
        }
        const out: Record<string, unknown> = { pbrMetallicRoughness: pbr };
        if (material.name !== undefined) out.name = material.name;
        if (material.emissiveFactor !== undefined) out.emissiveFactor = material.emissiveFactor;
        if (material.emissiveMask === true) out.emissiveTexture = { index: 0 };
        if (material.emissiveStrength !== undefined) {
            out.extensions = { KHR_materials_emissive_strength: { emissiveStrength: material.emissiveStrength } };
        }
        return out;
    });

    const total = new Uint8Array(offset);
    let at = 0;
    for (const chunk of chunks) {
        total.set(chunk, at);
        at += chunk.byteLength;
    }

    return {
        bin: total,
        doc: {
            asset: { version: '2.0' },
            scene: 0,
            scenes: [{ nodes: model.roots ?? model.nodes.map((_, i) => i) }],
            nodes,
            meshes,
            accessors,
            bufferViews,
            buffers: [{ byteLength: offset }],
            ...(materials.length > 0 ? { materials, textures, images } : {}),
            ...(imageSamplers.length > 0 ? { samplers: imageSamplers } : {}),
            ...(skins.length > 0 ? { skins } : {}),
            ...(animations.length > 0 ? { animations } : {}),
        } as Record<string, unknown>,
    };
};

/**
 * The description and the numbers as two files, the way an export from Blender usually lands.
 */
export const asGltf = (model: TTestModel, binName = 'model.bin'): { json: unknown; bin: ArrayBuffer } => {
    const { doc, bin } = assemble(model);
    (doc.buffers as Array<Record<string, unknown>>)[0].uri = binName;
    return { json: doc, bin: bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer };
};

/**
 * The same model as one binary file.
 */
export const asGlb = (model: TTestModel): ArrayBuffer => {
    const { doc, bin } = assemble(model);
    const json = new TextEncoder().encode(JSON.stringify(doc));
    const jsonPad = (4 - (json.byteLength % 4)) % 4;
    const binPad = (4 - (bin.byteLength % 4)) % 4;

    const size = 12 + 8 + json.byteLength + jsonPad + 8 + bin.byteLength + binPad;
    const out = new Uint8Array(size);
    const view = new DataView(out.buffer);

    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, size, true);

    view.setUint32(12, json.byteLength + jsonPad, true);
    view.setUint32(16, 0x4e4f534a, true);
    out.set(json, 20);
    // The description is padded with spaces rather than zeroes, which is the format's own rule and
    // the difference between a reader that trims and one that chokes.
    out.fill(0x20, 20 + json.byteLength, 20 + json.byteLength + jsonPad);

    const binStart = 20 + json.byteLength + jsonPad;
    view.setUint32(binStart, bin.byteLength + binPad, true);
    view.setUint32(binStart + 4, 0x004e4942, true);
    out.set(bin, binStart + 8);

    return out.buffer;
};

/**
 * Answers every fetch a model makes: the description, its numbers, and any picture it names.
 *
 * `asked` is what was requested, in order, so a test can check a path was worked out correctly and
 * that two pieces sharing one picture only fetched it once.
 */
export const serveGltf = (files: Record<string, unknown>): { asked: string[]; restore: () => void } => {
    const asked: string[] = [];

    Object.assign(globalThis, {
        createImageBitmap: async () => ({ width: 4, height: 4, close: () => {} }),
        // Paths inside a file are worked out against the page, and a test has no page.
        location: { href: 'http://nacatamalon.local/' },
    });

    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async (input: string) => {
        const url = String(input);
        asked.push(url);
        // A path inside a file is worked out against the page, so it arrives absolute. Answering to
        // either spelling is what a real server does, and saves every test writing both.
        const found = files[url] ?? files[url.replace(/^\//, '')];
        if (found === undefined) {
            return { ok: false, status: 404 };
        }
        if (found instanceof ArrayBuffer) {
            return { ok: true, arrayBuffer: async () => found, blob: async () => new Blob([found]) };
        }
        if (typeof found === 'string') {
            return { ok: true, blob: async () => new Blob([found]) };
        }
        const bytes = new TextEncoder().encode(JSON.stringify(found));
        return {
            ok: true,
            json: async () => found,
            arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
            blob: async () => new Blob([bytes]),
        };
    }) as unknown as typeof fetch);

    return { asked, restore: () => fetchSpy.mockRestore() };
};
