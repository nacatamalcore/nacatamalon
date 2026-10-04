import type { TMaterialShader, TUniformSignature, TUniformValues } from '../../../materials/types/t_material';
import type { TShaderTarget } from './t_shader_target';
import type { TLoadStatus } from '../../types/t_load_status';

/**
 * A shader written in a file, on its way in or already here.
 *
 * The file holds the hooks and the knobs and says which family it is for, so the scene that uses it
 * repeats none of that. One file can be shared by any number of materials, and is fetched once.
 *
 * **It keeps a list of who is following it**, which is the one thing that makes it unlike a texture.
 * A texture is handed to a drawing and that is enough, because the drawing hands the texture
 * straight to the card. A shader is not: the card compiles from the *source*, so when the bytes
 * finally land they have to be poured into every material that was already built against it.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TShader = {
    readonly type: 'shader';
    /**
     * What it is kept under in this game. The `src` unless a `key` was given.
     */
    key: string;
    /**
     * Where the WGSL comes from.
     */
    src: string;
    /**
     * Where the GLSL comes from, when it was written in a second file instead of the same one.
     */
    glslSrc: string | null;
    status: TLoadStatus;
    /**
     * Which family the file declared, or `'sprite2d'` when it did not say.
     */
    shader: TMaterialShader;
    /**
     * The fragment hook in WGSL, or `null` if the file defines only a vertex one.
     */
    fragment: string | null;
    /**
     * The same hook in GLSL, or `null` when the author wrote no GLSL half.
     */
    fragmentGlsl: string | null;
    /**
     * The vertex hook in WGSL.
     */
    vertex: string | null;
    /**
     * The same, in GLSL.
     */
    vertexGlsl: string | null;
    /**
     * The knobs the file declared, with the values it gave them.
     */
    uniforms: TUniformValues;
    /**
     * What kind each of those is.
     */
    uniformSig: TUniformSignature;
    /**
     * Everything built on this file, which is filled in when it lands. Never written out.
     *
     * Materials and screen-wide effects both, because the two want the same thing from a file and
     * neither can be built from it until the bytes are here.
     */
    bound: TShaderTarget[];
};
