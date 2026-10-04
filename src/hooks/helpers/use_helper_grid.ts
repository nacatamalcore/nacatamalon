import { newLines } from '../../gameobjects/lines';
import type { TColor } from '../../color';
import type { TNewLinesOptions } from '../../gameobjects/lines';
import type { TLines } from '../../gameobjects/lines';

/**
 * What `useHelperGrid` is asked for.
 *
 * @category Debug
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TUseHelperGridOptions = TNewLinesOptions & {
    /**
     * How far the grid reaches from its middle, in world units, on both sides. Default `10`.
     */
    half?: number;
    /**
     * How far apart its lines are. Default `1`.
     */
    step?: number;
    /**
     * The colour of the ordinary lines. Default a dim grey.
     */
    color?: TColor;
    /**
     * The colour of the middle line along X. Default red. `null` draws it like the rest.
     */
    xColor?: TColor | null;
    /**
     * The colour of the middle line along Z. Default blue. `null` draws it like the rest.
     */
    zColor?: TColor | null;
};

const DEFAULT_COLOR: TColor = { r: 0.3, g: 0.3, b: 0.34, a: 1 };
const DEFAULT_X: TColor = { r: 0.7, g: 0.26, b: 0.3, a: 1 };
const DEFAULT_Z: TColor = { r: 0.28, g: 0.44, b: 0.78, a: 1 };

/**
 * Draws a floor grid on the ground plane, the one every 3D editor shows, with its middle lines in the
 * colours of the X and Z axes.
 *
 * It is drawn in the scene like anything else, so a model standing on it hides the lines behind it
 * instead of the grid being painted over everything. Raise it, turn it or stand it up with
 * `transform`.
 *
 * @param options How big it is, how close its lines are, and their colours.
 * @returns The lines, to hide or move like any other drawing.
 *
 * @example
 * ```ts
 * const Level = () => {
 *     useCamera3d({ projection: 'perspective', fov: 60, y: 4, z: 8, rotationX: -0.45 });
 *     useHelperGrid({ half: 5 });
 *     return createScene();
 * };
 * ```
 *
 * @category Debug
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useHelperGrid = (options: TUseHelperGridOptions = {}): TLines => {
    const half = options.half ?? 10;
    const step = options.step ?? 1;
    const color = options.color ?? DEFAULT_COLOR;
    const xColor = options.xColor === undefined ? DEFAULT_X : options.xColor;
    const zColor = options.zColor === undefined ? DEFAULT_Z : options.zColor;
    if (!(step > 0) || !(half > 0)) {
        throw new Error('[NacatamalOn] useHelperGrid: half and step have to be more than zero.');
    }

    const data: number[] = [];
    const corner = (x: number, z: number, c: TColor): void => {
        data.push(x, 0, z, c.r, c.g, c.b, c.a);
    };
    // Counted in whole steps rather than added up, so a step that does not divide evenly in binary
    // (0.1) cannot drift and drop the last line.
    const lines = Math.floor(half / step + 1e-6);
    for (let n = -lines; n <= lines; n++) {
        const at = n * step;
        const middle = n === 0;
        const alongX = middle && xColor !== null ? xColor : color;
        corner(-half, at, alongX);
        corner(half, at, alongX);
        const alongZ = middle && zColor !== null ? zColor : color;
        corner(at, -half, alongZ);
        corner(at, half, alongZ);
    }

    return newLines('useHelperGrid', options, new Float32Array(data));
};
