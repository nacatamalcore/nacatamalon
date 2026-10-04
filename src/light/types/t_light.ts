import type { TColor } from '../../color';
import type { TTransform3d } from '../../gameobjects/types/t_transform_3d';

/**
 * What every light has: a colour, how strong it is, and how much of it reaches the parts it does
 * not shine on directly.
 *
 * `ambient` is that last one: light bounces off everything in a real room, so a surface facing away
 * from the lamp is dim and not black. Without it a scene looks like it is in space.
 *
 * @category Lighting
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TLightBase = {
    id: string;
    color: TColor;
    intensity: number;
    ambient: number;
    /**
     * Where it is and which way it faces. Lights shine along their own -Z.
     */
    transform: TTransform3d;
    /**
     * Whether this is **the** light that casts shadows. Default `false`.
     *
     * One light casts, and it is the first one that asks. That is not a budget picked at random: a
     * shadow map is a whole extra pass over everything that casts, and the hardware this engine is
     * aimed at had one of them. A second light asking is warned about rather than ignored, because
     * being quietly overruled is the sort of thing you lose an afternoon to.
     */
    castShadow?: boolean;
    /**
     * How far the shadow test is pushed away from the surface, so a surface does not shadow itself.
     * Default `0.002`.
     *
     * Too little and a lit surface stripes itself. Too much and the shadow detaches from whatever
     * cast it, which reads as the thing hovering.
     */
    shadowBias?: number;
    /**
     * How dark it goes, `0` to `1`. Default `1`. Lower leaves the caster's light partly on.
     */
    shadowStrength?: number;
};

/**
 * A light from far away, like the sun: it has a direction and no position, and it reaches
 * everything with the same strength.
 *
 * @category Lighting
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDirectionalLight = TLightBase & {
    readonly type: 'directional';
    /**
     * How far, in world units, the shadows reach. Default `12`.
     *
     * The square the shadow map covers is this wide, and it **follows the camera**: it starts at
     * the camera and reaches this far in front of it, so what you are looking at is what has
     * shadows. Smaller is crisper over less ground, because the map is always the same number of
     * steps across however much world it is spread over.
     *
     * **It has to be big enough to reach your scene.** A camera five hundred units back from what
     * it is watching wants about a thousand here; leave it at the default and every shadow is
     * simply missing, with nothing said, because a scene where nothing stands in the light's way
     * looks exactly the same from the inside.
     *
     * Only a directional light has this. A spot's frustum comes from its own `angle` and `range`,
     * so giving it a square as well would be two ways to say one thing.
     */
    shadowArea?: number;
    /**
     * How far back along its own beam it sits when it looks at the scene. Default `20`.
     */
    shadowDistance?: number;
};

/**
 * A lamp: it has a place, shines every way, and fades out by `range`.
 *
 * @category Lighting
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPointLight = TLightBase & { readonly type: 'point'; range: number };

/**
 * A torch: a lamp that only shines inside a cone.
 *
 * `angle` is half the width of that cone and `penumbra` is how soft its edge is, from a hard rim at
 * `0` to a beam that fades all the way to the middle at `1`.
 *
 * @category Lighting
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSpotLight = TLightBase & { readonly type: 'spot'; range: number; angle: number; penumbra: number };

/**
 * Light with no source: the level everything is lit to before any lamp reaches it.
 *
 * It has no place and no direction, so it never shades anything: it only decides how dark the dark
 * side is. A scene with one of these and nothing else is flat, which is a look and not a mistake.
 *
 * @category Lighting
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TAmbientLight = { readonly type: 'ambient'; id: string; color: TColor; intensity: number };

/**
 * Any light. A box holds one, and a scene holds as many as it has boxes with one.
 *
 * @category Lighting
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TLight = TDirectionalLight | TPointLight | TSpotLight | TAmbientLight;

/**
 * The lights that actually shine on something: the ones with a place in the world, a direction, or
 * both. Ambient is left out because it has nothing to shine on.
 *
 * @category Lighting
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPunctualLight = TDirectionalLight | TPointLight | TSpotLight;

/**
 * How many lights shine on one frame.
 *
 * Eight is not a number picked out of the air: it is what the hardware of this engine's era
 * offered. The GameCube's GX had eight, each of them free to be a sun, a lamp or a torch; the
 * N64 did seven and an ambient; the fixed pipeline the Dreamcast era was written against also
 * stopped at eight. Past the eighth they are dropped in the order the scene made them, once, with
 * a warning. Ambient lights do not count against it.
 *
 * @category Lighting
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MAX_LIGHTS = 8;

/**
 * Whether this light takes part in the shading, which is everything but ambient.
 */
export const isPunctualLight = (light: TLight): light is TPunctualLight => light.type !== 'ambient';
