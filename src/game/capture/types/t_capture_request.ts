import type { TColor } from '../../../color';
import type { TCamera2d } from '../../../camera/types/t_camera_2d';
import type { TCamera3d } from '../../../camera/types/t_camera_3d';
import type { TDrawable } from '../../../gameobjects/types';
import type { ITexture } from '../../../render/interface';

/**
 * A capture waiting for its frame: the options already worked out against the screen, the picture
 * it is drawn into, and the promise to settle once that frame is over.
 *
 * Into a picture and not off the canvas, because the canvas of a WebGPU game is gone by the time
 * anything could read it; a picture drawn into keeps its pixels until someone asks for them.
 *
 * @internal
 */
export type TCaptureRequest = {
    camera3d: TCamera3d | null;
    camera2d: TCamera2d | null;
    layers: ReadonlyArray<TDrawable['type']> | null;
    background: TColor;
    target: ITexture;
    /**
     * With nothing when the frame drew it, with the error when the frame did not. Called once.
     */
    settle: (error?: unknown) => void;
};
