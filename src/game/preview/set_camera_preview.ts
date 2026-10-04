import type { TRuntimeStore } from '../../store';
import type { TCameraPreview } from './types/t_camera_preview';

/**
 * Starts drawing the game once more every frame onto the preview's canvas, or stops with `null`.
 *
 * Its choices are made here, once, the way a capture makes them: what was left out is taken from
 * the screen as it is now. The cameras themselves are read every frame, so one moved in place is
 * followed.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const setCameraPreview = (store: TRuntimeStore, preview: TCameraPreview | null): void => {
    if (preview === null) {
        store.setState('viewport', { preview: null });
        return;
    }
    const viewport = store.get('viewport');
    store.setState('viewport', {
        preview: {
            canvas: preview.canvas,
            camera3d: 'camera3d' in preview ? preview.camera3d ?? null : viewport.camera3d,
            camera2d: 'camera2d' in preview ? preview.camera2d ?? null : viewport.camera2d,
            layers: 'layers' in preview ? preview.layers ?? null : viewport.layers,
        },
    });
};
