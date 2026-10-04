import type { TColor } from '../../../color';
import type { TSkeletalClip, TSkeleton } from '../../../animation';
import type { TGeometry } from '../../../geometry';
import type { TLoadStatus } from '../../types/t_load_status';
import type { TTexture } from '../../texture/types/t_texture';
import type { TTextureWrap } from '../../../materials';

/**
 * One drawable piece of a model: a shape and the surface it wears.
 *
 * A model file is one piece surprisingly rarely. A vehicle is a body, glass and tyres; a character
 * is skin, hair and clothes. Each of those is a piece here because each wears a different surface,
 * and a surface is the thing that cannot be shared: merging them would mean choosing one picture
 * for all of it.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGltfPart = {
    /**
     * The name of the piece it came from, or `''` when it was never given one.
     */
    name: string;
    /**
     * The name of the surface it wears, or `''`. It is often the only thing telling two pieces of
     * one model apart: a windscreen and the body around it are usually the same piece of the file
     * and differ only in this.
     */
    material: string;
    geometry: TGeometry;
    /**
     * The picture on it, or `null` for a plain coloured surface.
     */
    texture: TTexture | null;
    tint: TColor;
    emissive: TColor;
    /**
     * Whether the file says it is seen through, whatever its colour's alpha: a picture with
     * see-through parts is the usual reason, and nothing else would tell.
     */
    transparent: boolean;
    /**
     * What its picture does past its edge, as the file says: repeating, unless it says otherwise.
     */
    wrap: { u: TTextureWrap; v: TTextureWrap };
    /**
     * The bones that move it, or `null` when nothing does.
     */
    skeleton: TSkeleton | null;
};

/**
 * A model loaded from a file, and everything it takes to draw it.
 *
 * You get it back at once, still loading, and the pieces appear in `parts` when the file arrives.
 * Hand it to `createModel` straight away: what it shows turns up by itself.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGltfModel = {
    readonly type: 'gltf';
    /**
     * What it is kept under in this game. The `src` unless a `key` was given.
     */
    key: string;
    src: string;
    status: TLoadStatus;
    /**
     * Its drawable pieces, in the order the file lists them. Empty until it arrives.
     */
    parts: TGltfPart[];
    /**
     * The rigs it holds. Nearly always none or one, but a file is allowed more and a few do.
     *
     * A model holds them rather than a part, because a clip is free to move bones of several at
     * once and playing it has to reach all of them.
     */
    skeletons: TSkeleton[];
    /**
     * The movements it came with, by name. Empty for a model nobody animated.
     */
    clips: Record<string, TSkeletalClip>;
};
