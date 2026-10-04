import { createRecord } from '../gameobjects/create_record';
import type { TFog, TFogOptions } from './types/t_fog';

/**
 * A fog record with every field filled in.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createFog = (options: TFogOptions = {}): TFog => createRecord('fog', {
    color: options.color ?? { r: 0, g: 0, b: 0, a: 1 },
    near: options.near ?? 10,
    far: options.far ?? 100,
    enabled: options.enabled ?? true,
});
