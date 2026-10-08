import { composerFloat, composerSwizzle, composerVec2, composerVec3, composerVec4 } from './constructors';
import {
    composerEmissive, composerEnvUv, composerLight, composerMapSample, composerShine, composerResolution, composerSurface, composerTextureSample, composerTime,
    composerUniform, composerUv, composerVertexColor, composerVertexNormal, composerVertexPosition, composerViewDir, composerWorldNormal,
    composerWorldPos,
} from './inputs';
import {
    composerAbs, composerAdd, composerClamp, composerCos, composerCross, composerDistance, composerDiv, composerDot,
    composerFloor, composerFract, composerLength, composerMax, composerMin, composerMix, composerMod, composerMul,
    composerNormalize, composerOneMinus, composerPow, composerReflect, composerSaturate, composerSign, composerSin,
    composerSmoothstep, composerSqrt, composerStep, composerSub,
} from './math';
import { composerCellularNoise, composerFbm, composerSimplexNoise } from './noise';
import { composerCelShade, composerFresnel } from './effects';
import type { TUniformType } from '../materials/types/t_uniforms';
import type { TComposerNode } from './types/t_composer_node';
import type { TGraphTarget, TParamValue } from './types/t_shader_graph_doc';
import type { TInputPort, TNodeCategory, TNodeDef, TOutputPort, TPortDefault } from './types/t_node_def';

// The node catalogue: one entry per kind of node, and the only place a kind of node is described.
// Two readers depend on it and must never disagree: `compile_shader_graph.ts`, which calls
// `build`, and an editor's palette and inspector, which read the inputs, outputs and literals.
// Adding a node here makes it appear in the editor and compile, with nothing to register anywhere
// else.
//
// Every `build` calls the composer functions instead of writing shader code, so a graph drawn on
// a canvas and the same graph written in code produce the same shader and share every check.
//
// The `type` of each entry is what a `.shader` file stores. It is the file format, not the API,
// so it keeps the short names (`'sin'`, `'add'`) whatever the functions are called.

/**
 * The palette's sections, in the order they are shown.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const NODE_CATEGORIES: readonly TNodeCategory[] = [
    'input', 'constant', 'math', 'vector', 'procedural', 'effect', 'output',
];

const F32 = 'f32' as const;
const V2 = 'vec2<f32>' as const;
const V3 = 'vec3<f32>' as const;
const V4 = 'vec4<f32>' as const;

/**
 * A socket's label from its name (`edge0` becomes `Edge0`).
 */
const titled = (name: string): string => name.charAt(0).toUpperCase() + name.slice(1);

/**
 * One input. Without `def` it needs a wire.
 */
const port = (name: string, type: TUniformType | null, def?: TPortDefault): TInputPort => ({
    name,
    label: titled(name),
    type,
    ...(def === undefined ? {} : { default: def }),
});

const OUT: TOutputPort[] = [{ name: 'value', label: 'Out' }];

/**
 * A number literal, or `fallback` when it is missing or not a number.
 */
const num = (params: Record<string, TParamValue>, name: string, fallback: number): number => {
    const raw = params[name];
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
};

/**
 * A text literal, or `fallback`.
 */
const text = (params: Record<string, TParamValue>, name: string, fallback: string): string => {
    const raw = params[name];
    return typeof raw === 'string' && raw.length > 0 ? raw : fallback;
};

/**
 * A literal read as a number or a list of numbers, the shapes a parameter and the vector constants
 * take. Anything else falls back, so a file edited by hand with a typo in it draws the default
 * rather than a broken shader.
 */
const value = (params: Record<string, TParamValue>, name: string, fallback: number | number[]): number | number[] => {
    const raw = params[name];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        return raw;
    }
    if (Array.isArray(raw) && raw.length >= 2 && raw.length <= 4 && raw.every((n) => typeof n === 'number' && Number.isFinite(n))) {
        return raw;
    }
    return fallback;
};

/**
 * Reshapes a literal to a type: a number is copied into every lane, a longer list is cut and a
 * shorter one repeats its last number. So changing the type of a parameter node does not throw
 * away the value already saved in the file.
 */
const coerce = (raw: number | number[], type: TUniformType): number | number[] => {
    const arity = type === F32 ? 1 : Number(type[3]);
    const parts = typeof raw === 'number' ? [raw] : raw;
    if (arity === 1) {
        return parts[0] ?? 0;
    }
    return Array.from({ length: arity }, (_, i) => parts[Math.min(i, parts.length - 1)] ?? 0);
};

const UNIFORM_TYPES = [F32, V2, V3, V4] as const;

/**
 * A leaf: no inputs, no literals, one output of a fixed type.
 */
const inputNode = (
    type: string,
    label: string,
    outputType: TUniformType,
    summary: string,
    targets?: readonly TGraphTarget[],
): TNodeDef => ({
    type,
    label,
    category: 'input',
    summary,
    inputs: [],
    outputs: OUT,
    params: [],
    outputType,
    ...(targets === undefined ? {} : { targets }),
    build: () => {
        throw new Error('unreachable');
    },
});

/**
 * A one-input math node whose result is the type of its operand.
 */
const unaryNode = (
    type: string,
    label: string,
    summary: string,
    fn: (a: TComposerNode) => TComposerNode,
    def?: TPortDefault,
): TNodeDef => ({
    type,
    label,
    category: 'math',
    summary,
    inputs: [port('a', null, def)],
    outputs: OUT,
    params: [],
    build: (i) => fn(i.a),
});

/**
 * A two-input math node, a number spreading over a vector.
 */
const binaryNode = (
    type: string,
    label: string,
    summary: string,
    fn: (a: TComposerNode, b: TComposerNode) => TComposerNode,
    defaults: [TPortDefault | undefined, TPortDefault | undefined],
    names: [string, string] = ['a', 'b'],
): TNodeDef => ({
    type,
    label,
    category: 'math',
    summary,
    inputs: [port(names[0], null, defaults[0]), port(names[1], null, defaults[1])],
    outputs: OUT,
    params: [],
    build: (i) => fn(i[names[0]], i[names[1]]),
});

const DEFS: TNodeDef[] = [
    // ── Inputs ──────────────────────────────────────────────────────────────────────
    // `build` is never called for these: the compiler maps them straight to their composer
    // function, because they are the leaves. They are declared here so the palette, the socket
    // colours and the family filter all come from one place.
    inputNode('uv', 'UV', V2, 'The fragment\'s texture coordinate, 0-1 across the surface.'),
    inputNode('time', 'Time', F32, 'Seconds since the game started: the source of every animation.'),
    inputNode('resolution', 'Resolution', V2, 'The render target size in pixels.'),
    inputNode('surface', 'Surface', V4, 'The material\'s own textured, tinted (and vertex-painted) color before the effect.'),
    inputNode('worldNormal', 'World Normal', V3, 'The surface normal in world space.', ['mesh3d']),
    inputNode('worldPos', 'World Position', V3, 'The fragment\'s position in world space.', ['mesh3d']),
    inputNode('viewDir', 'View Direction', V3, 'Unit vector from the fragment towards the camera.', ['mesh3d']),
    inputNode('light', 'Light', V3, 'The accumulated scene lighting for this fragment.', ['mesh3d']),
    inputNode('emissive', 'Emissive', V3, 'The material\'s emissive color, untouched by lighting.', ['mesh3d']),
    inputNode('shine', 'Shine', V3, 'The highlight the lamps put on the surface, already shadowed.', ['mesh3d']),
    inputNode('envUv', 'Reflection UV', V2, 'Where the surface reflects the world on a round map of its surroundings: feed it to Map Sample for chrome.', ['mesh3d']),
    inputNode('vertexPosition', 'Vertex Position', V3, 'The vertex\'s local-space position. Vertex stage only.', ['mesh3d']),
    inputNode('vertexNormal', 'Vertex Normal', V3, 'The vertex\'s normal. Vertex stage only.', ['mesh3d']),
    inputNode('vertexColor', 'Vertex Color', V4, 'The color painted on the model\'s vertices. Already part of Surface.', ['mesh3d']),

    {
        type: 'textureSample',
        label: 'Texture Sample',
        category: 'input',
        summary: 'Samples the material\'s texture at any coordinate: the basis for warps, blurs and splits.',
        inputs: [port('uv', V2, () => composerUv())],
        outputs: OUT,
        params: [],
        outputType: V4,
        build: (i) => composerTextureSample(i.uv),
    },
    {
        type: 'mapSample',
        label: 'Map Sample',
        category: 'input',
        summary: 'Samples one of the material\'s extra maps by name: a reflection, a mask, a detail, a ripple.',
        inputs: [port('uv', V2, () => composerUv())],
        outputs: OUT,
        params: [{ name: 'name', label: 'Map', kind: 'text', default: 'noise' }],
        outputType: V4,
        targets: ['mesh3d'],
        build: (i, p) => composerMapSample(text(p, 'name', 'noise'), i.uv),
    },
    {
        type: 'uniform',
        label: 'Parameter',
        category: 'input',
        summary: 'A named value you can tune in the inspector and animate at runtime.',
        inputs: [],
        outputs: OUT,
        params: [
            { name: 'name', label: 'Name', kind: 'text', default: 'param' },
            { name: 'type', label: 'Type', kind: 'select', default: F32, options: UNIFORM_TYPES },
            { name: 'value', label: 'Value', kind: 'value', default: 1 },
        ],
        build: (_i, p) => {
            const type = (UNIFORM_TYPES as readonly string[]).includes(text(p, 'type', F32))
                ? (text(p, 'type', F32) as TUniformType)
                : F32;
            return composerUniform(text(p, 'name', 'param'), coerce(value(p, 'value', 1), type));
        },
    },

    // ── Constants ───────────────────────────────────────────────────────────────────
    {
        type: 'const.float',
        label: 'Float',
        category: 'constant',
        summary: 'A fixed number.',
        inputs: [],
        outputs: OUT,
        params: [{ name: 'value', label: 'Value', kind: 'number', default: 1, step: 0.05 }],
        outputType: F32,
        build: (_i, p) => composerFloat(num(p, 'value', 1)),
    },
    {
        type: 'const.vec2',
        label: 'Vector 2',
        category: 'constant',
        summary: 'A fixed 2-component vector.',
        inputs: [],
        outputs: OUT,
        params: [{ name: 'value', label: 'Value', kind: 'value', default: [0, 0] }],
        outputType: V2,
        build: (_i, p) => composerVec2(...(coerce(value(p, 'value', [0, 0]), V2) as number[])),
    },
    {
        type: 'const.vec3',
        label: 'Vector 3',
        category: 'constant',
        summary: 'A fixed 3-component vector.',
        inputs: [],
        outputs: OUT,
        params: [{ name: 'value', label: 'Value', kind: 'value', default: [0, 0, 0] }],
        outputType: V3,
        build: (_i, p) => composerVec3(...(coerce(value(p, 'value', [0, 0, 0]), V3) as number[])),
    },
    {
        type: 'const.vec4',
        label: 'Vector 4',
        category: 'constant',
        summary: 'A fixed 4-component vector.',
        inputs: [],
        outputs: OUT,
        params: [{ name: 'value', label: 'Value', kind: 'value', default: [0, 0, 0, 1] }],
        outputType: V4,
        build: (_i, p) => composerVec4(...(coerce(value(p, 'value', [0, 0, 0, 1]), V4) as number[])),
    },
    {
        type: 'const.color',
        label: 'Color',
        category: 'constant',
        summary: 'A fixed RGBA color, picked rather than typed.',
        inputs: [],
        outputs: OUT,
        params: [{ name: 'value', label: 'Color', kind: 'color', default: [1, 1, 1, 1] }],
        outputType: V4,
        build: (_i, p) => composerVec4(...(coerce(value(p, 'value', [1, 1, 1, 1]), V4) as number[])),
    },

    // ── Math ────────────────────────────────────────────────────────────────────────
    binaryNode('add', 'Add', 'Adds, component-wise, broadcasting a scalar.', composerAdd, [0, 0]),
    binaryNode('sub', 'Subtract', 'Subtracts, component-wise, broadcasting a scalar.', composerSub, [0, 0]),
    binaryNode('mul', 'Multiply', 'Multiplies, component-wise, broadcasting a scalar.', composerMul, [1, 1]),
    binaryNode('div', 'Divide', 'Divides, component-wise, broadcasting a scalar.', composerDiv, [1, 1]),
    binaryNode('pow', 'Power', 'Raises the base to an exponent, component-wise.', composerPow, [1, 2], ['base', 'exp']),
    binaryNode('min', 'Min', 'The smaller of two values, component-wise.', composerMin, [0, 1]),
    binaryNode('max', 'Max', 'The larger of two values, component-wise.', composerMax, [0, 1]),
    binaryNode('mod', 'Modulo', 'GLSL-style remainder, which always takes the sign of the divisor.', composerMod, [0, 1], ['x', 'y']),

    unaryNode('abs', 'Absolute', 'Drops the sign, component-wise.', composerAbs, 0),
    unaryNode('floor', 'Floor', 'Rounds down to the nearest integer, component-wise.', composerFloor, 0),
    unaryNode('fract', 'Fract', 'The fractional part: the staple of tiling and repetition.', composerFract, 0),
    unaryNode('sin', 'Sine', 'Sine, in radians.', composerSin, 0),
    unaryNode('cos', 'Cosine', 'Cosine, in radians.', composerCos, 0),
    unaryNode('sqrt', 'Square Root', 'Square root, component-wise.', composerSqrt, 1),
    unaryNode('sign', 'Sign', '-1, 0 or +1 per component.', composerSign, 0),
    unaryNode('oneMinus', 'One Minus', 'The complement, `1 - x`: inverts a mask.', composerOneMinus, 0),
    unaryNode('saturate', 'Saturate', 'Clamps to the 0-1 range.', composerSaturate, 0),

    // Vector-only ops take no defaults: a scalar fallback would be an invalid operand, and
    // a required connection says so at the port instead of failing inside the constructor.
    unaryNode('normalize', 'Normalize', 'Scales a vector to unit length.', composerNormalize),
    unaryNode('length', 'Length', 'The magnitude of a vector.', composerLength),

    binaryNode('distance', 'Distance', 'The distance between two points.', composerDistance, [undefined, undefined]),
    binaryNode('dot', 'Dot Product', 'The dot product of two vectors: the workhorse of lighting maths.', composerDot, [undefined, undefined]),
    binaryNode('cross', 'Cross Product', 'A vector perpendicular to two vec3s.', composerCross, [undefined, undefined]),
    binaryNode('reflect', 'Reflect', 'Mirrors an incident vector about a normal.', composerReflect, [undefined, undefined], ['i', 'n']),

    {
        type: 'clamp',
        label: 'Clamp',
        category: 'math',
        summary: 'Holds a value inside a range.',
        inputs: [port('value', null), port('lo', null, 0), port('hi', null, 1)],
        outputs: OUT,
        params: [],
        build: (i) => composerClamp(i.value, i.lo, i.hi),
    },
    {
        type: 'mix',
        label: 'Mix',
        category: 'math',
        summary: 'Blends between two values: the most-used node in any graph.',
        inputs: [port('a', null, 0), port('b', null, 1), port('t', null, 0.5)],
        outputs: OUT,
        params: [],
        build: (i) => composerMix(i.a, i.b, i.t),
    },
    {
        type: 'step',
        label: 'Step',
        category: 'math',
        summary: 'A hard cut: 0 below the edge, 1 above it.',
        inputs: [port('edge', null, 0.5), port('value', null)],
        outputs: OUT,
        params: [],
        build: (i) => composerStep(i.edge, i.value),
    },
    {
        type: 'smoothstep',
        label: 'Smoothstep',
        category: 'math',
        summary: 'A soft cut: eases from 0 to 1 across a range.',
        inputs: [port('edge0', null, 0), port('edge1', null, 1), port('value', null)],
        outputs: OUT,
        params: [],
        build: (i) => composerSmoothstep(i.edge0, i.edge1, i.value),
    },

    // ── Vector ──────────────────────────────────────────────────────────────────────
    {
        type: 'vec2',
        label: 'Combine XY',
        category: 'vector',
        summary: 'Builds a vec2 from two scalars.',
        inputs: [port('x', F32, 0), port('y', F32, 0)],
        outputs: OUT,
        params: [],
        outputType: V2,
        build: (i) => composerVec2(i.x, i.y),
    },
    {
        type: 'vec3',
        label: 'Combine XYZ',
        category: 'vector',
        summary: 'Builds a vec3 from three scalars.',
        inputs: [port('x', F32, 0), port('y', F32, 0), port('z', F32, 0)],
        outputs: OUT,
        params: [],
        outputType: V3,
        build: (i) => composerVec3(i.x, i.y, i.z),
    },
    {
        type: 'vec4',
        label: 'Combine XYZW',
        category: 'vector',
        summary: 'Builds a vec4 from four scalars.',
        inputs: [port('x', F32, 0), port('y', F32, 0), port('z', F32, 0), port('w', F32, 1)],
        outputs: OUT,
        params: [],
        outputType: V4,
        build: (i) => composerVec4(i.x, i.y, i.z, i.w),
    },
    {
        type: 'combine.rgba',
        label: 'RGB + A',
        category: 'vector',
        summary: 'Attaches an alpha to a vec3 color: the usual last step before the output.',
        inputs: [port('rgb', V3), port('a', F32, 1)],
        outputs: OUT,
        params: [],
        outputType: V4,
        build: (i) => composerVec4(i.rgb, i.a),
    },
    {
        type: 'swizzle',
        label: 'Swizzle',
        category: 'vector',
        summary: 'Reorders or selects components by mask (`xy`, `bgr`, `xxx`).',
        inputs: [port('value', null)],
        outputs: OUT,
        params: [{ name: 'mask', label: 'Mask', kind: 'text', default: 'xy' }],
        build: (i, p) => composerSwizzle(i.value, text(p, 'mask', 'xy')),
    },
    {
        type: 'split',
        label: 'Split',
        category: 'vector',
        summary: 'Breaks a vector into its components. Outputs beyond the input\'s size are unavailable.',
        inputs: [port('value', null)],
        // Every component is declared, but `build` only makes the ones the input has: wiring `z`
        // off a vec2 is reported as a missing output, which says more than a shader error about
        // a swizzle.
        outputs: [
            { name: 'x', label: 'X' },
            { name: 'y', label: 'Y' },
            { name: 'z', label: 'Z' },
            { name: 'w', label: 'W' },
        ],
        params: [],
        build: (i) => {
            const size = i.value.type === F32 ? 1 : Number(i.value.type[3]);
            const out: Record<string, TComposerNode> = {};
            for (const [index, name] of ['x', 'y', 'z', 'w'].entries()) {
                if (index < size) {
                    out[name] = composerSwizzle(i.value, name);
                }
            }
            return out;
        },
    },

    // ── Procedural ──────────────────────────────────────────────────────────────────
    {
        type: 'simplexNoise',
        label: 'Simplex Noise',
        category: 'procedural',
        summary: 'Coherent noise in 0-1 for clouds, flow and dissolve masks. Scale the input for frequency.',
        inputs: [port('pos', null)],
        outputs: OUT,
        params: [],
        outputType: F32,
        build: (i) => composerSimplexNoise(i.pos),
    },
    {
        type: 'fbm',
        label: 'FBM',
        category: 'procedural',
        summary: 'Layered noise at doubling frequency: terrain, turbulence, lava.',
        inputs: [port('pos', null)],
        outputs: OUT,
        params: [{ name: 'octaves', label: 'Octaves', kind: 'int', default: 4, min: 1, max: 8, step: 1 }],
        outputType: F32,
        build: (i, p) => composerFbm(i.pos, num(p, 'octaves', 4)),
    },
    {
        type: 'cellularNoise',
        label: 'Cellular Noise',
        category: 'procedural',
        summary: 'Worley/voronoi cells: cracked, organic, scaly surfaces.',
        inputs: [port('pos', null)],
        outputs: OUT,
        params: [],
        outputType: F32,
        build: (i) => composerCellularNoise(i.pos),
    },

    // ── Effects ─────────────────────────────────────────────────────────────────────
    {
        type: 'fresnel',
        label: 'Fresnel',
        category: 'effect',
        summary: 'Rim falloff, 0 facing the camera and 1 at grazing angles. Rim light, holograms, shields.',
        inputs: [port('power', F32, 3)],
        outputs: OUT,
        params: [],
        outputType: F32,
        targets: ['mesh3d'],
        build: (i) => composerFresnel(i.power),
    },
    {
        type: 'celShade',
        label: 'Cel Shade',
        category: 'effect',
        summary: 'Quantizes a gradient into flat bands: the toon-shading move.',
        inputs: [port('value', null), port('steps', F32, 3)],
        outputs: OUT,
        params: [],
        targets: ['mesh3d'],
        build: (i) => composerCelShade(i.value, i.steps),
    },

    // ── Outputs ─────────────────────────────────────────────────────────────────────
    // The endpoints. `build` is never called: `compileShaderGraph` reads what is wired into them
    // and hands it to `compileShader` as that stage's result. One left unwired keeps the engine's
    // own for that stage, which is what leaving the field out of a composed graph means too.
    {
        type: 'output.color',
        label: 'Color Output',
        category: 'output',
        summary: 'The final fragment color. Leave it unwired to keep the built-in look.',
        inputs: [port('color', null)],
        outputs: [],
        params: [],
        role: 'output',
        build: () => {
        throw new Error('unreachable');
    },
    },
    {
        type: 'output.position',
        label: 'Position Output',
        category: 'output',
        summary: 'A displaced vertex position. Leave it unwired for no deformation.',
        inputs: [port('position', V3)],
        outputs: [],
        params: [],
        role: 'output',
        targets: ['mesh3d'],
        build: () => {
        throw new Error('unreachable');
    },
    },
];

/**
 * The leaves, by kind of node. Beside the catalogue rather than inside each `build` because they
 * take nothing, and the compiler resolves them before any wiring exists.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const INPUT_BUILDERS: Record<string, () => TComposerNode> = {
    uv: composerUv,
    time: composerTime,
    resolution: composerResolution,
    surface: composerSurface,
    worldNormal: composerWorldNormal,
    worldPos: composerWorldPos,
    viewDir: composerViewDir,
    light: composerLight,
    emissive: composerEmissive,
    shine: composerShine,
    envUv: composerEnvUv,
    vertexPosition: composerVertexPosition,
    vertexNormal: composerVertexNormal,
    vertexColor: composerVertexColor,
};

/**
 * Every kind of node a `.shader` file can hold, by its `type`: the one list the compiler and an
 * editor both read.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const NODE_CATALOG: Record<string, TNodeDef> = Object.fromEntries(DEFS.map((d) => [d.type, d]));

/**
 * The same catalogue as a list, in palette order, which is the order above and not the alphabet.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const NODE_DEFS: readonly TNodeDef[] = DEFS;

/**
 * One kind of node, by its `type`. An unknown one throws, naming it: what a file using a node this
 * version of the engine does not have should say.
 *
 * @param type The kind of node.
 * @returns What the catalogue says about it.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const nodeDef = (type: string): TNodeDef => {
    const def = NODE_CATALOG[type];
    if (def === undefined) {
        throw new Error(`[NacatamalOn] shader graph: unknown node type "${type}".`);
    }
    return def;
};

/**
 * A kind of node's literals at their defaults, as a new object each time: what an editor writes
 * into a node when it is dropped, so the file records what it uses instead of trusting a default
 * that may change.
 *
 * @param type The kind of node.
 * @returns Its literals.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const defaultParams = (type: string): Record<string, TParamValue> => {
    const out: Record<string, TParamValue> = {};
    for (const p of nodeDef(type).params) {
        out[p.name] = Array.isArray(p.default) ? [...p.default] : p.default;
    }
    return out;
};
