/**
 * The part of a glTF file this engine reads, written out as types.
 *
 * A glTF file describes far more than a retro engine has any use for: physically based surfaces,
 * cameras, lights, compressed geometry, shapes that morph. What is here is what ends up on screen,
 * and everything else is walked past. Writing the subset down rather than reaching into `any` is
 * what makes a file that breaks one of these assumptions fail at the line that assumed it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGltfDoc = {
    scene?: number;
    scenes?: Array<{ nodes?: number[] }>;
    nodes?: TGltfNode[];
    meshes?: Array<{ name?: string; primitives: TGltfPrimitive[] }>;
    accessors?: TGltfAccessor[];
    bufferViews?: TGltfBufferView[];
    buffers?: Array<{ uri?: string; byteLength: number }>;
    materials?: TGltfMaterial[];
    textures?: Array<{ source?: number; sampler?: number }>;
    /**
     * How a picture is read: only what it does past its edge is taken from here.
     */
    samplers?: Array<{ wrapS?: number; wrapT?: number; magFilter?: number; minFilter?: number }>;
    images?: Array<{ uri?: string; bufferView?: number; mimeType?: string }>;
    skins?: TGltfSkin[];
    animations?: TGltfAnimation[];
};

/**
 * A rig: which nodes of the file are bones, and what undoes their rest position.
 *
 * @internal
 */
export type TGltfSkin = {
    name?: string;
    /**
     * The nodes that are bones, in the order the corners count them.
     */
    joints: number[];
    /**
     * A run of 16 numbers a bone. Absent means every bone rests at the origin.
     */
    inverseBindMatrices?: number;
};

/**
 * One named movement of the file: what it moves, and the values it moves through.
 *
 * @internal
 */
export type TGltfAnimation = {
    name?: string;
    channels: Array<{ sampler: number; target: { node?: number; path: string } }>;
    samplers: Array<{ input: number; output: number; interpolation?: 'LINEAR' | 'STEP' | 'CUBICSPLINE' }>;
};

/**
 * One node of the file's own tree: where a piece sits relative to the piece above it.
 *
 * The turn arrives as a quaternion, which is glTF's own choice and for the same reason this engine
 * now offers one: three angles cannot say every facing on the way to it.
 *
 * @internal
 */
export type TGltfNode = {
    name?: string;
    children?: number[];
    mesh?: number;
    /**
     * Which rig deforms this node's mesh, when it has one.
     */
    skin?: number;
    /**
     * Either this, or the three below. Never both, by the format's own rule.
     */
    matrix?: number[];
    translation?: [number, number, number];
    rotation?: [number, number, number, number];
    scale?: [number, number, number];
};

/**
 * One drawable piece of a mesh: a run of triangles sharing one surface.
 *
 * **This is the unit that becomes a model's part.** A mesh of three primitives is three of them
 * because it has three different surfaces, which is exactly why they cannot be merged into one.
 *
 * @internal
 */
export type TGltfPrimitive = {
    attributes: { POSITION?: number; NORMAL?: number; TEXCOORD_0?: number; JOINTS_0?: number; WEIGHTS_0?: number; COLOR_0?: number };
    indices?: number;
    material?: number;
    /**
     * 4 is triangles, which is the only one drawn. Absent means triangles.
     */
    mode?: number;
};

/**
 * @internal
 */
export type TGltfAccessor = {
    bufferView?: number;
    byteOffset?: number;
    componentType: number;
    /**
     * Whether whole numbers stand for 0 to 1 rather than for themselves, as a painted colour's do.
     */
    normalized?: boolean;
    count: number;
    type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4' | 'MAT4';
};

/**
 * @internal
 */
export type TGltfBufferView = {
    buffer: number;
    byteOffset?: number;
    byteLength?: number;
    byteStride?: number;
};

/**
 * @internal
 */
export type TGltfMaterial = {
    name?: string;
    pbrMetallicRoughness?: {
        baseColorFactor?: [number, number, number, number];
        baseColorTexture?: { index: number };
    };
    emissiveFactor?: [number, number, number];
    /**
     * How its alpha is used. Absent is `'OPAQUE'`.
     */
    alphaMode?: 'OPAQUE' | 'MASK' | 'BLEND';
    /**
     * A picture masking where the glow actually is. Not read, but its presence matters.
     */
    emissiveTexture?: { index: number };
    extensions?: { KHR_materials_emissive_strength?: { emissiveStrength?: number } };
};

/**
 * Triangles. The only kind of run this engine draws.
 */
export const GLTF_MODE_TRIANGLES = 4;

/**
 * What a number in an accessor is, as the format numbers them.
 */
export const GLTF_UNSIGNED_BYTE = 5121;
/**
 * @internal
 */
export const GLTF_UNSIGNED_SHORT = 5123;
/**
 * @internal
 */
export const GLTF_UNSIGNED_INT = 5125;
/**
 * @internal
 */
export const GLTF_FLOAT = 5126;

/**
 * How many numbers each kind of entry takes.
 */
export const GLTF_COMPONENT_COUNT: Record<TGltfAccessor['type'], number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
