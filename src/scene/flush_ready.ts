import { withActiveBox } from '../store/active_box';
import { withActiveGame } from '../store/active_game';
import type { TRuntimeStore } from '../store';

/**
 * Runs what `useReady` set aside, now that the build it waited for is over: a scene that has just
 * started whole, or a box spawned from outside any build with everything beneath it.
 *
 * Each callback runs with its own box active, so what it calls lands where the callback was
 * written. A callback whose box was destroyed meanwhile is dropped. One that builds more (a spawn)
 * may set aside more, which runs in the same pass, after it. All of them run even if one throws;
 * the first error then reaches the caller, as a throw in a body does.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const flushReady = (store: TRuntimeStore): void => {
    const { ready } = store.get('world');
    let failure: unknown = null;
    while (ready.length > 0) {
        const { box, run } = ready.shift()!;
        if (box.destroyed) continue;
        try {
            withActiveGame(store, () => withActiveBox(store, box, run));
        } catch (error) {
            failure ??= error;
        }
    }
    if (failure !== null) throw failure;
};
