import { findFunctions } from './find_functions';
import { splitSections } from './split_sections';
import type { TParsedShader } from './types/t_parsed_shader';
import type { TMaterialShader, TUniformSignature, TUniformType, TUniformValues } from '../../materials/types/t_material';

/**
 * The hook that decides what a surface finally looks like. Every family has one.
 */
const FRAGMENT_HOOK = 'effect';

/**
 * The hook that moves a corner before anything is worked out about it. Models only.
 */
const VERTEX_HOOK = 'vertex';

const FAMILIES: TMaterialShader[] = ['sprite2d', 'mesh3d', 'post'];

/**
 * How many numbers each kind is written with, so a wrong count is caught where it was written.
 */
const ARITY: Record<TUniformType, number> = {
    'f32': 1,
    'vec2<f32>': 2,
    'vec3<f32>': 3,
    'vec4<f32>': 4,
};

const UNIFORM_LINE = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+?)\s*=\s*(.+)$/;

/**
 * One half of a file, pulled apart into the hooks it defines and the helpers they share.
 */
type TStages = {
    fragment: string | null;
    vertex: string | null;
};

/**
 * Splits one half into its hooks, giving each one every helper the half defined.
 *
 * Every helper goes into **both** hooks, because neither language has a way to import one and the
 * two stages are compiled apart. The cost of that is worth saying out loud: a helper has to make
 * sense in either stage, so one that reads something only a fragment has will not compile when it is
 * carried into the vertex.
 */
const splitStages = (source: string, src: string, half: string): TStages => {
    const functions = findFunctions(source);
    const helpers = functions
        .filter((found) => found.name !== FRAGMENT_HOOK && found.name !== VERTEX_HOOK)
        .map((found) => source.slice(found.start, found.end));

    const build = (name: string): string | null => {
        const hook = functions.find((found) => found.name === name);
        if (hook === undefined) {
            return null;
        }
        return [...helpers, source.slice(hook.start, hook.end)].join('\n\n');
    };

    const stages = { fragment: build(FRAGMENT_HOOK), vertex: build(VERTEX_HOOK) };

    if (stages.fragment === null && stages.vertex === null) {
        throw new Error(
            `[NacatamalOn] useLoadShader: the ${half} of '${src}' defines no hook. ` +
            `It needs a 'fn ${FRAGMENT_HOOK}(...)', a 'fn ${VERTEX_HOOK}(...)', or both.`,
        );
    }

    return stages;
};

/**
 * Reads the `@shader` and `@uniform` lines, which may sit anywhere in the file.
 */
const readHeader = (source: string, src: string): { shader: TMaterialShader; uniforms: TUniformValues; uniformSig: TUniformSignature } => {
    let shader: TMaterialShader = 'sprite2d';
    const uniforms: TUniformValues = {};
    const uniformSig: TUniformSignature = {};

    for (const raw of source.split('\n')) {
        const line = raw.trim();
        if (!line.startsWith('//')) {
            continue;
        }
        const directive = line.slice(2).trim();

        if (directive.startsWith('@shader')) {
            const value = directive.slice('@shader'.length).trim() as TMaterialShader;
            if (!FAMILIES.includes(value)) {
                throw new Error(
                    `[NacatamalOn] useLoadShader: '${src}' says '@shader ${value}', which is not one of ` +
                    `${FAMILIES.join(', ')}.`,
                );
            }
            shader = value;
            continue;
        }

        if (!directive.startsWith('@uniform')) {
            continue;
        }

        const matched = UNIFORM_LINE.exec(directive.slice('@uniform'.length).trim());
        if (matched === null) {
            throw new Error(
                `[NacatamalOn] useLoadShader: '${src}' has a parameter it cannot read: '${directive}'. ` +
                'It goes: // @uniform name: type = value.',
            );
        }

        const [, name, written, rawValue] = matched as unknown as [string, string, string, string];
        const type = written as TUniformType;
        if (ARITY[type] === undefined) {
            throw new Error(
                `[NacatamalOn] useLoadShader: parameter '${name}' of '${src}' is a ${written}, and a ` +
                'parameter can only be f32, vec2<f32>, vec3<f32> or vec4<f32>.',
            );
        }

        const parts = rawValue.split(',').map((piece) => Number(piece.trim()));
        if (parts.some((piece) => Number.isNaN(piece))) {
            throw new Error(
                `[NacatamalOn] useLoadShader: parameter '${name}' of '${src}' has a value that is not a number.`,
            );
        }
        if (parts.length !== ARITY[type]) {
            throw new Error(
                `[NacatamalOn] useLoadShader: parameter '${name}' of '${src}' is a ${written}, so it needs ` +
                `${ARITY[type]} numbers and was given ${parts.length}.`,
            );
        }

        uniforms[name] = type === 'f32' ? (parts[0] as number) : parts;
        uniformSig[name] = type;
    }

    return { shader, uniforms, uniformSig };
};

/**
 * Reads a shader file: comments that say what it is, and plain shader code that says what it does.
 *
 * The header is **read from the whole file**, deliberately outside the language halves. What the
 * file is for and what knobs it has are one fact about the file, and a fact written twice is two
 * facts that can drift apart.
 *
 * A file stays valid code in its own language, so an editor colours it and a card could compile it
 * with the engine's own preamble in front. That is the point of a comment-based header: nothing here
 * invents a format that only this engine can open.
 *
 * @param source The text of the file.
 * @param src Where it came from, used only so an error can name it.
 * @returns What the file declares, and its code in both languages.
 *
 * @category Materials
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const parseShaderFile = (source: string, src: string): TParsedShader => {
    const { shader, uniforms, uniformSig } = readHeader(source, src);
    const halves = splitSections(source, src);

    const wgsl = splitStages(halves.wgsl, src, 'WGSL half');
    const glsl = halves.glsl.trim() === ''
        ? { fragment: null, vertex: null }
        : splitStages(halves.glsl, src, 'GLSL half');

    if (halves.glsl.trim() !== '') {
        for (const stage of ['fragment', 'vertex'] as const) {
            if ((wgsl[stage] !== null) !== (glsl[stage] !== null)) {
                throw new Error(
                    `[NacatamalOn] useLoadShader: the two halves of '${src}' do not define the same hooks: ` +
                    `one has a ${stage} and the other does not. That is not a compile error anywhere, it is ` +
                    'an effect that quietly does less on one of the two cards.',
                );
            }
        }
    }

    if (shader === 'post' && wgsl.vertex !== null) {
        throw new Error(
            `[NacatamalOn] useLoadShader: '${src}' is a screen-wide effect and defines a vertex hook. ` +
            'There are no corners to move: the whole picture is one flat rectangle.',
        );
    }

    if (shader === 'post' && wgsl.fragment === null) {
        throw new Error(
            `[NacatamalOn] useLoadShader: '${src}' is a screen-wide effect, so it needs a fragment hook.`,
        );
    }

    if (shader === 'sprite2d' && wgsl.vertex !== null) {
        throw new Error(
            `[NacatamalOn] useLoadShader: '${src}' is for sprites and defines a vertex hook, which a flat ` +
            'square has no use for. Did you mean // @shader mesh3d?',
        );
    }

    return {
        shader,
        fragment: wgsl.fragment,
        vertex: wgsl.vertex,
        fragmentGlsl: glsl.fragment,
        vertexGlsl: glsl.vertex,
        uniforms,
        uniformSig,
    };
};
