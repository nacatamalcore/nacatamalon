import { f32Literal } from './f32_literal';
import { valueType } from './value_type';
import type { TUniformValues } from '../materials/types/t_uniforms';
import type { TComposerNode, TInputKind } from './types/t_composer_node';
import type { TShaderTarget, TStageCtx } from './types/t_shader_target';

// The walk every stage shares: the graph is language-free, and the target it is handed says how
// each piece is spelled.

/**
 * How a stage is named in an error, for the author who put a leaf where it does not exist.
 */
const STAGE_LABEL: Record<TStageCtx, string> = {
    'sprite2d.frag': 'a 2D colour graph',
    'mesh3d.frag': 'a model colour graph',
    'mesh3d.vert': 'a model vertex (position) graph',
    'preview.frag': 'a node preview',
};

/**
 * What a leaf reads in this stage, or an error naming the stage when it does not exist there.
 */
const inputSource = (kind: TInputKind, stage: TStageCtx, target: TShaderTarget): string => {
    const source = target.input(kind, stage);
    if (source === undefined) {
        throw new Error(`[NacatamalOn] shader composer: ${kind} is not available in ${STAGE_LABEL[stage]}.`);
    }
    return source;
};

/**
 * The expression for one value, given what its dependencies were already written as.
 */
const emitExpr = (n: TComposerNode, refs: string[], stage: TStageCtx, target: TShaderTarget): string => {
    switch (n.kind) {
        case 'literal':
            return f32Literal(n.params![0] as number);
        case 'uniform':
            return `mu.${n.uniform!.name}`;
        case 'input':
            return inputSource(n.input!, stage, target);
        case 'texture': {
            if (stage === 'mesh3d.vert') {
                throw new Error('[NacatamalOn] shader composer: textureSample is not available in a vertex graph.');
            }
            const map = n.params?.[0];
            if (typeof map !== 'string') {
                return `sampleTexture(${refs[0]})`;
            }
            // A map belongs to a model's material. A node's own thumbnail has none, so it shows white,
            // which is what a map the material does not carry reads as anyway.
            if (stage === 'preview.frag') {
                return `${target.type('vec4<f32>')}(1.0)`;
            }
            if (stage !== 'mesh3d.frag') {
                throw new Error(`[NacatamalOn] shader composer: the map '${map}' can only be read in a model's colour graph.`);
            }
            return `sampleMap_${map}(${refs[0]})`;
        }
        case 'construct':
            return `${target.type(n.type)}(${refs.join(', ')})`;
        case 'swizzle':
            return `(${refs[0]}).${n.params![0]}`;
        case 'binop':
            return `(${refs[0]} ${n.params![0]} ${refs[1]})`;
        case 'call':
            return `${n.params![0]}(${refs.join(', ')})`;
        default:
            throw new Error(`[NacatamalOn] shader composer: unknown kind of value "${n.kind}".`);
    }
};

/**
 * Counts how many times each value is used, walking down from `root`.
 */
const countRefs = (root: TComposerNode, counts: Map<TComposerNode, number>): void => {
    const visit = (n: TComposerNode): void => {
        for (const dep of n.deps) {
            counts.set(dep, (counts.get(dep) ?? 0) + 1);
            visit(dep);
        }
    };
    counts.set(root, (counts.get(root) ?? 0) + 1);
    visit(root);
};

/**
 * Writes one result as the body of its function: a few locals, then a `return`.
 *
 * A value used twice or more, that is more than a bare leaf, becomes a local and is worked out
 * once. Everything else is written in place. That is the whole of the sharing, and it is what keeps
 * a graph that reuses a value from costing it twice on the card.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const emitBody = (
    root: TComposerNode,
    stage: TStageCtx,
    target: TShaderTarget,
): { lines: string[]; result: string } => {
    const counts = new Map<TComposerNode, number>();
    countRefs(root, counts);

    const lines: string[] = [];
    const nameOf = new Map<TComposerNode, string>();
    let counter = 0;

    const refOf = (n: TComposerNode): string => {
        const existing = nameOf.get(n);
        if (existing !== undefined) {
            return existing;
        }

        const expr = emitExpr(n, n.deps.map(refOf), stage, target);
        const shared = (counts.get(n) ?? 0) >= 2 && n.deps.length > 0;
        if (!shared) {
            return expr;
        }

        const name = `v${counter++}`;
        lines.push(target.declare(n.type, name, expr));
        nameOf.set(n, name);
        return name;
    };

    const result = refOf(root);
    return { lines, result };
};

/**
 * Gathers every parameter in the graph, with the value it starts at. One name used as two
 * different types is an error: the shader has one slot per name.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const collectUniforms = (roots: TComposerNode[]): TUniformValues => {
    const values: TUniformValues = {};
    const seen = new Set<TComposerNode>();
    const visit = (n: TComposerNode): void => {
        if (seen.has(n)) {
            return;
        }
        seen.add(n);
        if (n.uniform !== undefined) {
            const { name, value } = n.uniform;
            const previous = values[name];
            if (previous !== undefined && valueType(previous) !== valueType(value)) {
                throw new Error(`[NacatamalOn] shader composer: the parameter "${name}" is used as two different types.`);
            }
            values[name] = value;
        }
        n.deps.forEach(visit);
    };
    roots.forEach(visit);
    return values;
};

/**
 * Gathers the functions the graph needs at the top of the shader, each once, in the target's
 * language.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const collectHelpers = (roots: TComposerNode[], target: TShaderTarget): string[] => {
    const byName = new Map<string, string>();
    const seen = new Set<TComposerNode>();
    const visit = (n: TComposerNode): void => {
        if (seen.has(n)) {
            return;
        }
        seen.add(n);
        for (const helper of n.helpers ?? []) {
            if (!byName.has(helper.name)) {
                byName.set(helper.name, target.language === 'glsl' ? helper.glsl : helper.wgsl);
            }
        }
        n.deps.forEach(visit);
    };
    roots.forEach(visit);
    return [...byName.values()];
};
