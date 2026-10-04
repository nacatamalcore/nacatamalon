import type { TDrawMaterial } from '../interface';
import type { TTextureWrap } from '../../materials/types/t_material';

/**
 * What a model's picture does past its edge, each way, with the default filled in.
 *
 * One place for it, because both backends turn it into a sampler of their own and they have to
 * agree on what nothing written means: repeating, which is what a model's file almost always asks.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const textureWrapOf = (material: TDrawMaterial): { u: TTextureWrap; v: TTextureWrap } => {
    const wrap = material.wrap ?? 'repeat';
    return typeof wrap === 'string' ? { u: wrap, v: wrap } : { u: wrap.u, v: wrap.v };
};

/**
 * Every thing a model's picture can do past its edge, for a backend making one sampler for each.
 *
 * @internal
 */
export const TEXTURE_WRAPS: readonly TTextureWrap[] = ['repeat', 'clamp', 'mirror'];

/**
 * The name a way of reading a picture is kept under: its filter, and its edge each way. The same in
 * both backends, so the two tables of samplers are keyed alike.
 *
 * @internal
 */
export const wrapKey = (filter: 'nearest' | 'linear', u: TTextureWrap, v: TTextureWrap): string => `${filter} ${u} ${v}`;
