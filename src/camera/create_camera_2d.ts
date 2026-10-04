import { createRecord } from '../gameobjects/create_record';
import type { TCamera2d, TCamera2dOptions } from './types/t_camera_2d';

/**
 * A camera record with the defaults filled in: at the origin, not turned, no zoom.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createCamera2d = (options: TCamera2dOptions = {}): TCamera2d => createRecord('camera2d', {
    transform: { x: options.x ?? 0, y: options.y ?? 0, rotation: options.rotation ?? 0 },
    zoom: options.zoom ?? 1,
});
