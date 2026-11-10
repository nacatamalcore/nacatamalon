import type { TUniformType } from '../../materials/types/t_uniforms';

/**
 * A value a leaf reads from the running shader: a function argument (`uv`, `pos`), one of the
 * values the engine writes for every material (`time`), or what the model's colour hook is told
 * about the place it is colouring (`worldNormal`, `light`).
 *
 * Each one is only there in some stages, and the compiler refuses a leaf read where it does not
 * exist (`light` in a vertex graph, say) instead of emitting code the card then rejects.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TInputKind =
    | 'uv'
    | 'time'
    | 'resolution'
    | 'surface'
    | 'worldNormal'
    | 'worldPos'
    | 'viewDir'
    | 'light'
    | 'emissive'
    | 'shine'
    | 'envUv'
    | 'vertexPosition'
    | 'vertexNormal'
    | 'vertexColor'
    | 'screenPos'
    | 'uv2'
    | 'worldTangent'
    | 'worldBitangent'
    | 'vertexTangent'
    | 'vertexBitangent'
    | 'instanceData'
    | 'instanceOrigin'
    | 'frontFacing'
    | 'carry'
    | 'occlusion'
    | 'localUv'
    | 'layerUv';

/**
 * A function a node needs written once at the top of the shader (the noise functions, for
 * instance), kept only once however many nodes ask for it.
 *
 * Both languages ride on the node rather than living in a table per language looked up by name.
 * A helper exists **because** a node needs it, and keeping the two apart would let a graph ask for
 * a helper one language never defined: a failure that shows up as a shader that does not compile
 * in somebody's browser, rather than as a missing entry while writing it.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type THelperDef = {
    name: string;
    wgsl: string;
    glsl: string;
};

/**
 * One value in a composed shader: what kind of value it is, and how to build it from the values it
 * depends on.
 *
 * **It is plain data, never a closure.** `kind` picks how it is written out, `params` carries its
 * literal operands and `deps` the values it is made from. That is what lets a graph be written to
 * JSON and read back, the same rule every other piece of state in the engine follows.
 *
 * Never built by hand: the `composer*` functions fill these fields consistently and check their
 * operands as they go.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TComposerNode = {
    /**
     * How it is written out: `literal`, `input`, `uniform`, `texture`, `construct`, `swizzle`, `binop` or `call`.
     */
    kind: string;
    /**
     * What it evaluates to. Every operation checks its operands against this.
     */
    type: TUniformType;
    /**
     * The values it is made from, in argument order.
     */
    deps: TComposerNode[];
    /**
     * Literal operands: a number, an operator, a swizzle mask or the name of the function called.
     */
    params?: (number | string)[];
    /**
     * For a leaf, which value of the running shader it reads.
     */
    input?: TInputKind;
    /**
     * For a parameter, the name the shader reads it by and the value it starts at.
     */
    uniform?: { name: string; value: number | number[] };
    /**
     * Functions this node needs written at the top of the shader.
     */
    helpers?: THelperDef[];
};

/**
 * What an operand of a composer function may be: another value, or a plain number, which becomes a
 * constant. So `composerAdd(composerX(composerUv()), 0.5)` needs no `composerFloat(0.5)`.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TComposerInput = TComposerNode | number;

/**
 * How `composerTextureSample` and `composerMapSample` read a picture that has mipmaps.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TComposerSampleOptions = {
    /**
     * How many times as fast the place read runs as the model's own picture coordinate: `8` for
     * `uv * 8`, `[4, 2]` for one that runs faster across than down, or a value worked out in the
     * graph (a parameter, say). It picks the mipmap that place asks for; without it a picture
     * repeated eight times is read eight times too sharp far away, and shimmers. `0` reads the picture
     * itself, for a place that does not follow the surface (`composerEnvUv()`). Only a model's colour
     * graph reads mipmaps; anywhere else it changes nothing. Left out, `1`.
     */
    scale?: TComposerInput | readonly [number, number];
};

/**
 * One stage of `composerPipe`: it takes the value flowing through and returns the next.
 *
 * Every one-operand function already is one, and the two-operand ones become one when given a
 * single operand (`composerMul(2)`), so they chain without wrapping.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TComposerStep = (value: TComposerNode) => TComposerNode;
