import type { TColor } from '../../../color';

/**
 * Where a light is and which way it faces. Scale is ignored: a light does not stretch.
 */
type TLightPlacement = {
    x: number; y: number; z: number;
    rotation: number; rotationX: number; rotationY: number;
    scaleX: number; scaleY: number; scaleZ: number;
};

/**
 * A light as a backend sees it: a kind, a colour, and whatever that kind needs to be aimed.
 *
 * One type with the extra fields optional rather than three, because what a backend does with it is
 * write sixteen numbers into a slot: telling three types apart to write the same slot would be
 * ceremony. The game's own light records fit by shape.
 *
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDrawLight = {
    readonly type: 'directional' | 'point' | 'spot';
    readonly color: TColor;
    readonly intensity: number;
    readonly transform: TLightPlacement;
    /**
     * How far a lamp or a torch reaches. A sun does not have one.
     */
    readonly range?: number;
    /**
     * Half the width of a torch's cone, and how soft its edge is. Only a torch has them.
     */
    readonly angle?: number;
    readonly penumbra?: number;
    /**
     * Whether the scene's shadows are drawn from this one. Absent is no.
     *
     * Only one light in a scene casts, because there is one map. A bulb never does, whatever it
     * says: shining every way at once needs six pictures rather than one.
     */
    readonly castShadow?: boolean;
    /**
     * How far a surface is nudged away from itself before it is compared, against self-striping.
     */
    readonly shadowBias?: number;
    /**
     * How dark what it cannot see goes, `0` to `1`.
     */
    readonly shadowStrength?: number;
    /**
     * How wide a square of the world a sun's shadows cover. A torch has its cone instead.
     */
    readonly shadowArea?: number;
    /**
     * How far back a sun stands to look at that square.
     */
    readonly shadowDistance?: number;
};
