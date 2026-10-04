import type { TLoadable } from './types/t_loadable';

/**
 * The promise behind each asset record. Kept here rather than on the record so the record stays
 * plain data, and weak so a record nobody holds any more takes its promise with it.
 */
const loads = new WeakMap<TLoadable, Promise<void>>();

/**
 * Remembers the load that will settle `record`, for anything that needs to wait on it later.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const trackLoad = (record: TLoadable, load: Promise<void>): void => {
    loads.set(record, load);
};

/**
 * Resolves when `record` has settled. Never rejects: a failed load settles as `'error'`. A record
 * that was never tracked resolves at once, since there is nothing to wait for.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const whenLoaded = (record: TLoadable): Promise<void> => loads.get(record) ?? Promise.resolve();
