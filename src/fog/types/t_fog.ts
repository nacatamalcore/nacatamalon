import type { TColor, TColorOption } from '../../color';

/**
 * The fog a scene is seen through: things fade into `color` as they get further from the camera.
 *
 * It is what the Nintendo 64 is remembered by, and the way every game of the era hid how near it
 * stopped drawing. Worked out per corner and smeared across each triangle, like the light, which is
 * how that hardware did it too. Everything here is read every frame, so changing a field fades the
 * fog in, thickens it or turns it to dusk with nothing set up again.
 *
 * @category Camera
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TFog = {
    readonly type: 'fog';
    id: string;
    /**
     * What things fade into. Usually the background, or the fog shows as a wall.
     */
    color: TColor;
    /**
     * How far from the camera the fog begins. Nearer than this is clear.
     */
    near: number;
    /**
     * How far from the camera it is complete. Further than this is all fog.
     */
    far: number;
    /**
     * Whether things fade by how far they are from the camera (`near` to `far`). `false` leaves only
     * the fog by height, for a valley full of mist that is clear across.
     */
    distance: boolean;
    /**
     * Fog by height: below `top` things start to fade, and at `bottom` they are gone, however near.
     * The mist at the foot of a cliff, a pit with no bottom to see. With `top` under `bottom` it
     * runs upwards instead, for a cloud the top of a tower disappears into. `enabled` is `false`
     * unless it was asked for, so the record always has it and a tween can fade it in.
     */
    height: { enabled: boolean; top: number; bottom: number };
    /**
     * Whether it is drawn. Switching it off keeps the rest, so it can be switched back on.
     */
    enabled: boolean;
};

/**
 * What `useFog` is asked for. Everything has a default, so `useFog({ color })` is a fog.
 *
 * @category Camera
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TFogOptions = {
    /**
     * What things fade into. Default black.
     */
    color?: TColorOption;
    /**
     * How far from the camera the fog begins. Default `10`.
     */
    near?: number;
    /**
     * How far from the camera it is complete. Default `100`.
     */
    far?: number;
    /**
     * Whether things fade by how far they are from the camera. Default `true`.
     */
    distance?: boolean;
    /**
     * Fog by height: it begins at `top` and is complete at `bottom` (default `-10` under `top`).
     * Given, it is on unless `enabled: false`; left out, there is none.
     *
     * @example
     * ```ts
     * useFog({ color, height: { top: 0, bottom: -8 } });                  // a cliff, and fog far off
     * useFog({ color, distance: false, height: { top: 0, bottom: -8 } }); // only the cliff
     * ```
     */
    height?: { top?: number; bottom?: number; enabled?: boolean };
    /**
     * Whether it is drawn. Default `true`.
     */
    enabled?: boolean;
};
