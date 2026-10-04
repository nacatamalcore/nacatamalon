import { createRecord } from '../gameobjects/create_record';
import type { TCamera3d, TCamera3dOptions } from './types/t_camera_3d';

/**
 * Builds a 3D camera record from what was asked for, filling in the rest.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createCamera3d = (options: TCamera3dOptions = {}): TCamera3d => createRecord('camera3d', {
    projection: options.projection ?? 'orthographic',
    transform: {
        x: options.x ?? 0,
        y: options.y ?? 0,
        z: options.z ?? 0,
        rotation: options.rotation ?? 0,
        rotationX: options.rotationX ?? 0,
        rotationY: options.rotationY ?? 0,
        // A camera does not stretch, and these are here so it is the same shape as everything else.
        scaleX: 1,
        scaleY: 1,
        scaleZ: 1,
    },
    fov: options.fov ?? 60,
    near: options.near ?? 0.1,
    far: options.far ?? 1000,
    zoom: options.zoom ?? 1,
});
