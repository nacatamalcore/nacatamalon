import type { TBox } from '../box';
import type { TRuntimeStore } from '../store';

/**
 * The root of the running scene called `name`, or `undefined` when none is running. A name means
 * one scene at a time: `startScene` refuses to start a name that is already running.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const findScene = (store: TRuntimeStore, name: string): TBox | undefined =>
    store.get('world').scenes.find((scene) => scene.name === name);
