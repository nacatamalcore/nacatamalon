import type { TColor } from '../../color';

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
    color?: TColor;
    /**
     * How far from the camera the fog begins. Default `10`.
     */
    near?: number;
    /**
     * How far from the camera it is complete. Default `100`.
     */
    far?: number;
    /**
     * Whether it is drawn. Default `true`.
     */
    enabled?: boolean;
};
