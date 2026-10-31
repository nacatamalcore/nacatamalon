import type { TColor } from '../../../color';
import type { TDrawTexture } from './t_draw_texture';
import type { TUniformSignature, TUniformValues } from '../../../materials/types/t_uniforms';
import type { TCullMode, TTextureWrap } from '../../../materials/types/t_material';

/**
 * A shader of the author's own, as the card needs to see it.
 *
 * Both halves are here because portability is a property of the **material**, not of the backend: a
 * card takes the half it speaks and, finding none, draws the built-in shader and says so once.
 *
 * `id` is what a backend keys its compiled pipeline on together with the source, so two materials
 * running the same effect can share one compile.
 *
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDrawShader = {
    readonly id: string;
    /**
     * Only ever read out in a warning.
     */
    readonly name: string | null;
    readonly fragment: string | null;
    readonly fragmentGlsl: string | null;
    readonly vertex: string | null;
    readonly vertexGlsl: string | null;
    /**
     * Read afresh every draw, so turning a knob shows up on the next frame with no re-anything.
     */
    readonly uniforms: TUniformValues | null;
    /**
     * Fixed when the material was made, because the compiled shader was laid out against it.
     */
    readonly uniformSig: TUniformSignature | null;
};

/**
 * A model's surface, and any shader over it.
 *
 * Everything here is read **every frame**, so changing a colour is an assignment and nothing else.
 * The one exception is `uniformSig`, which decides the shape of the block of numbers the card was
 * given and so cannot move once it has been.
 *
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
/**
 * One extra picture a model's material hands its shader.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDrawMaterialMap = {
    readonly texture: TDrawTexture;
    readonly wrap?: TTextureWrap | { readonly u: TTextureWrap; readonly v: TTextureWrap };
    readonly smooth?: boolean;
};

export type TDrawMaterial = TDrawShader & {
    readonly texture: TDrawTexture | null;
    readonly tint: TColor;
    readonly emissive: TColor;
    /**
     * The picture the glow comes through. Omitted, the glow is the same all over.
     */
    readonly emissiveTexture?: TDrawTexture | null;
    /**
     * Where the light from all around is kept out: its picture's red, how much of it, and which
     * picture coordinate lays it out. Omitted, nothing is.
     */
    readonly occlusion?: {
        readonly texture: TDrawTexture;
        readonly strength?: number;
        readonly uv?: 'uv' | 'uv2';
        readonly wrap?: TTextureWrap | { readonly u: TTextureWrap; readonly v: TTextureWrap };
    } | null;
    readonly specular: TColor;
    readonly shininess: number;
    readonly alpha: number;
    /**
     * Drawn as see-through whatever its alpha. Omitted, the alpha decides.
     */
    readonly transparent?: boolean;
    readonly smooth?: boolean;
    /**
     * What the picture does past its edge. Omitted, it repeats.
     */
    readonly wrap?: TTextureWrap | { readonly u: TTextureWrap; readonly v: TTextureWrap };
    /**
     * Extra pictures its shader reads by name with `sampleMap_<name>`.
     */
    readonly maps?: Readonly<Record<string, TDrawMaterialMap>>;
    readonly vertexSnap?: boolean | number;
    /**
     * Its picture stretched across the screen without correcting for depth. Omitted, it is held true.
     */
    readonly affine?: boolean;
    /**
     * Which side of its triangles is thrown away. Omitted, `'back'`.
     */
    readonly cull?: TCullMode;
    /**
     * A pixel whose alpha is below this is not drawn, and every other one is drawn solid. Omitted,
     * nothing is cut.
     */
    readonly alphaCutoff?: number;
};
