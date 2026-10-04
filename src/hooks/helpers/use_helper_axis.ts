import { newLines } from '../../gameobjects/lines';
import type { TColor } from '../../color';
import type { TNewLinesOptions } from '../../gameobjects/lines';
import type { TLines } from '../../gameobjects/lines';

/**
 * The colour of each arm of the gizmo.
 *
 * @category Debug
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type THelperAxisColors = {
    x?: TColor;
    y?: TColor;
    z?: TColor;
};

/**
 * What `useHelperAxis` is asked for.
 *
 * @category Debug
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TUseHelperAxisOptions = TNewLinesOptions & {
    /**
     * How long each arm is, in world units. Default `1`.
     */
    size?: number;
    /**
     * Also draw the other half of each axis, dimmed, so all six directions show. Default `false`.
     */
    negative?: boolean;
    /**
     * The colour of any arm. Left out, the usual ones: X red, Y green, Z blue.
     */
    colors?: THelperAxisColors;
};

const DEFAULT_X: TColor = { r: 1, g: 0.23, b: 0.23, a: 1 };
const DEFAULT_Y: TColor = { r: 0.4, g: 0.9, b: 0.2, a: 1 };
const DEFAULT_Z: TColor = { r: 0.3, g: 0.45, b: 1, a: 1 };

/**
 * How much darker the other half of an axis is: the same axis the other way, not a second one.
 */
const NEGATIVE_DIM = 0.4;

const dim = (c: TColor): TColor => ({ r: c.r * NEGATIVE_DIM, g: c.g * NEGATIVE_DIM, b: c.b * NEGATIVE_DIM, a: c.a });

/**
 * One arm from the middle along `(dx, dy, dz)`, in `c`.
 */
const arm = (data: number[], dx: number, dy: number, dz: number, c: TColor): void => {
    data.push(0, 0, 0, c.r, c.g, c.b, c.a);
    data.push(dx, dy, dz, c.r, c.g, c.b, c.a);
};

/**
 * Draws the three axes as coloured lines from where it is placed: X red, Y green, Z blue, the colours
 * every 3D tool uses.
 *
 * Made inside something, it shows which way that thing is turned, because the lines are measured from
 * it and turn with it. Made in the scene, it marks the world's origin.
 *
 * @param options How long the arms are, their colours, and where the gizmo goes.
 * @returns The lines, to hide or move like any other drawing.
 *
 * @example
 * ```ts
 * const Level = () => {
 *     useCamera3d({ projection: 'perspective', fov: 60, y: 1, z: 4, rotationX: -0.2 });
 *     useHelperAxis({ size: 2, negative: true });
 *     return createScene();
 * };
 * ```
 *
 * @category Debug
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useHelperAxis = (options: TUseHelperAxisOptions = {}): TLines => {
    const size = options.size ?? 1;
    const x = options.colors?.x ?? DEFAULT_X;
    const y = options.colors?.y ?? DEFAULT_Y;
    const z = options.colors?.z ?? DEFAULT_Z;

    const data: number[] = [];
    arm(data, size, 0, 0, x);
    arm(data, 0, size, 0, y);
    arm(data, 0, 0, size, z);
    if (options.negative === true) {
        arm(data, -size, 0, 0, dim(x));
        arm(data, 0, -size, 0, dim(y));
        arm(data, 0, 0, -size, dim(z));
    }

    return newLines('useHelperAxis', options, new Float32Array(data));
};
