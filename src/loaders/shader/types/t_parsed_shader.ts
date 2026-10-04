import type { TMaterialShader, TUniformSignature, TUniformValues } from '../../../materials/types/t_material';

/**
 * What reading a shader file got out of it.
 *
 * The same shape whichever way the file was authored, so whatever learns to write shader files next
 * plugs in here without anything downstream noticing.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParsedShader = {
    /**
     * Which family the file is for, from its `@shader` line, or `'sprite2d'` if it had none.
     */
    shader: TMaterialShader;
    fragment: string | null;
    vertex: string | null;
    fragmentGlsl: string | null;
    vertexGlsl: string | null;
    /**
     * The knobs it declared, with the values it gave them.
     */
    uniforms: TUniformValues;
    /**
     * What kind each of those is, straight from the declaration rather than guessed.
     */
    uniformSig: TUniformSignature;
};
