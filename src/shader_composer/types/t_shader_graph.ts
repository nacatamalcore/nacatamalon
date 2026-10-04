import type { TUniformValues } from '../../materials/types/t_uniforms';
import type { TComposerNode } from './t_composer_node';
import type { TGraphTarget } from './t_shader_graph_doc';

/**
 * What `compileShader` is handed: the family the shader is for, and up to two results.
 *
 * `color` is what the colour hook returns and `position` is where the vertex hook moves a corner
 * to (models only). Leave one out and that stage keeps the engine's own.
 *
 * The family is kept in the type, so what comes out is known to be a sprite's or a model's.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TShaderGraph<S extends TGraphTarget = TGraphTarget> = {
    shader: S;
    color?: TComposerNode;
    position?: TComposerNode;
};

/**
 * What `compileShader` gives back: exactly the fields `createMaterial` takes, so it is spread
 * straight in, `createMaterial({ ...compiled })`.
 *
 * A stage left at the engine's own is missing, the same as not writing it in `createMaterial`.
 * `uniforms` holds every parameter found in the graph, ready to be changed while the game runs.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCompiledShader<S extends TGraphTarget = TGraphTarget> = {
    shader: S;
    /**
     * The colour hook in WGSL, missing when the graph has no `color`.
     */
    fragment?: string;
    /**
     * The vertex hook in WGSL, missing when the graph has no `position`.
     */
    vertex?: string;
    /**
     * The same two hooks in GLSL, always, never on request.
     *
     * That is what makes a composed shader work on both backends by construction rather than when
     * somebody remembers to ask. The values are typed, so the second language is a second walk
     * over the same graph and not a translation of the first one's text.
     */
    fragmentGlsl?: string;
    vertexGlsl?: string;
    uniforms: TUniformValues;
};
