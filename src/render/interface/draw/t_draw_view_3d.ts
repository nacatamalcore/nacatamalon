import type { TColor } from '../../../color';
import type { TDrawCamera3d } from './t_draw_camera_3d';
import type { TDrawLight } from './t_draw_light';

/**
 * How one scene's models are seen and lit: where they are looked at from, what shines on them, and
 * how dark their dark side is.
 *
 * One of these per scene in the pass rather than one per pass, because scenes stack: a level and
 * the menu over it are two worlds that happen to be drawn one after the other, and the menu's lamp
 * has no business lighting the level.
 *
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDrawView3d = {
    /**
     * Where it is looked at from, or `null` to draw flat on in the game's pixels.
     */
    readonly camera: TDrawCamera3d | null;
    /**
     * What shines on it. Never more than eight.
     */
    readonly lights: readonly TDrawLight[];
    /**
     * The level everything is lit to before any of those reach it.
     */
    readonly ambient: TColor;
    /**
     * The fog it is seen through, or `null` for none. Read whole every frame.
     */
    readonly fog?: TDrawFog | null;
};

/**
 * What the backends need of a scene's fog: what it fades into, between which distances from the
 * camera, and whether it is on.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDrawFog = {
    readonly color: TColor;
    readonly near: number;
    readonly far: number;
    readonly enabled: boolean;
};
