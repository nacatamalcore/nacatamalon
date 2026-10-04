import type { TUniformSignature, TUniformType, TUniformValues } from '../../materials/types/t_uniforms';

/**
 * What an editor needs to draw a graph: what every output carries, and what went wrong, node by
 * node.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGraphTypeInfo = {
    /**
     * `outputs[nodeId][portName]`: what that output carries. Missing when it could not be worked out.
     */
    outputs: Record<string, Record<string, TUniformType>>;
    /**
     * `errors[nodeId]`: why that node could not be worked out, written for a person.
     */
    errors: Record<string, string>;
    /**
     * A problem with the file as a whole (two wires into one input, a wire to a node that is not there).
     */
    fatal: string | null;
};

/**
 * One node's small picture: the colour hook that draws it, and the parameters it reads.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TNodePreview = {
    /**
     * A sprite's colour hook, in WGSL.
     */
    fragment: string;
    uniforms: TUniformValues;
    uniformSig: TUniformSignature;
};
