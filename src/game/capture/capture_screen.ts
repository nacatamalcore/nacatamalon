import { screenSizeOf } from '../../DOM/screen_size';
import type { TRuntimeStore } from '../../store';
import type { TCaptureResult } from '../../render/interface';
import type { TCaptureOptions } from './types/t_capture_options';

/**
 * Draws the running scenes once more, into a picture of their own, and brings its pixels back.
 *
 * The screen of a WebGPU game cannot be read: it is handed to the page at the end of every frame and
 * gone by the time anything asks. So the frame draws everything a second time into a picture that
 * keeps its pixels, and they are read once the frame is over. It costs one more pass over the scenes
 * and a trip back from the graphics card, so it is for taking a picture, not for every frame.
 *
 * It works while the game is paused: a paused game still draws, and a capture asks for pixels, not
 * for time. One at a time: a second one asked for before the first is drawn is refused, since both
 * would want the same frame.
 *
 * @internal
 */
export const captureScreen = async (store: TRuntimeStore, options: TCaptureOptions = {}): Promise<TCaptureResult> => {
    if (store.get('loop').destroyed) {
        throw new Error('[NacatamalOn] capture: the game has been destroyed.');
    }
    if (store.get('capture').request !== null) {
        throw new Error('[NacatamalOn] capture: another capture is waiting for its frame.');
    }

    const { canvas, renderer } = store.get('screen');
    const viewport = store.get('viewport');
    // The game's size, not the buffer's: a capture is of the game, at the resolution it measures in,
    // whatever `pixelRatio` the screen is drawn with.
    const screen = screenSizeOf(canvas);
    const width = Math.max(1, Math.floor(options.width ?? screen.width));
    const height = Math.max(1, Math.floor(options.height ?? screen.height));
    const target = renderer.createRenderTexture(width, height);

    try {
        await new Promise<void>((resolve, reject) => {
            store.setState('capture', {
                request: {
                    // Left out and `null` are two answers in these three, see `TCaptureOptions`. A `null`
                    // camera is left to each scene, which is what the frame does with no tool's camera.
                    camera3d: 'camera3d' in options ? options.camera3d ?? null : viewport.camera3d,
                    camera2d: 'camera2d' in options ? options.camera2d ?? null : viewport.camera2d,
                    layers: 'layers' in options ? options.layers ?? null : viewport.layers,
                    background: options.background ?? store.get('config').background,
                    target,
                    settle: (error) => (error === undefined ? resolve() : reject(error)),
                },
            });
        });

        // After the frame and not inside it: the picture outlives its pass, so nothing here has to reach
        // into the loop.
        return await renderer.readTexture(target);
    } finally {
        // Read or failed, nothing will look at it again: the next capture is framed by its own options.
        renderer.destroyTexture(target);
    }
};
