import type { TGeometry } from '../../../geometry';
import type { TSkeleton } from '../../../animation';
import type { TMeshMaterial } from '../../../materials';
import type { TTransform3d } from '../../types/t_transform_3d';

/**
 * A model: a shape, put somewhere, with a surface.
 *
 * The shape is shared and the placement is its own, which is the whole split: a hundred crates are
 * one shape and a hundred of these. Plain data, like every other drawable, so changing a field is
 * all it takes and the next frame shows it.
 *
 * The surface is a material, and a shared one: a hundred crates are one shape, one surface and a
 * hundred of these. A sprite is the other way round and keeps its own picture and colour, because in
 * two dimensions those vary per sprite and travel with it in the instance buffer.
 *
 * So the question this used to leave open, of what a material is and what sharing one would mean,
 * turned out to have two answers rather than one, which is exactly why it was worth leaving open.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMesh = {
    id: string;
    type: 'mesh';
    /**
     * What shape it is. `null` draws nothing, which is what a model waiting on a file does.
     */
    geometry: TGeometry | null;
    /**
     * Where it is, how it is turned and how big.
     */
    transform: TTransform3d;
    /**
     * Where it ends up once everything above it has moved it. Set each frame; never authored.
     */
    worldMatrix?: Float32Array;
    /**
     * The bones that move it, or `null` for something that does not bend.
     *
     * It comes from a model that was rigged, and it is what decides how this is drawn: with bones,
     * every corner is carried by up to four of them; without, it sits where its placement puts it.
     */
    skeleton: TSkeleton | null;
    /**
     * What it looks like: its picture, its colours, its shine, and any shader of its own.
     *
     * Never null. A model built without being handed one gets a private material of its own, made
     * from the very same fields it used to carry, so `createMesh({ tint })` still reads the way it
     * always did. Handing two models the same material is how they come to share a surface, and with
     * a shader on it, a single compiled pipeline.
     */
    material: TMeshMaterial;
    /**
     * Draw order within its scene, the same one sprites use. On a tie, models are drawn first.
     */
    zIndex?: number;
    /**
     * Whether it is drawn at all. Omitted is drawn.
     */
    visible?: boolean;
    /**
     * Whether it is drawn into the shadow map. Omitted casts, which is what nearly everything
     * should do; `false` is for a floor, a decal or a blob shadow's own disc.
     */
    castShadow?: boolean;
    /**
     * Set by `destroy` and never cleared.
     */
    destroyed: boolean;
};
