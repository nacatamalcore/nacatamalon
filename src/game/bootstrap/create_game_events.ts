import type { TGameEventName, TGameEvents } from '../types/t_game_events';

type THandler<E extends TGameEventName> = (payload: TGameEvents[E]) => void;

/**
 * The events of one game: who is listening, and what already happened.
 *
 * All three events happen at most once, so each one is remembered with what it carried, and a
 * listener that arrives afterwards is called at once. A handler that throws is reported and does
 * not stop the others: one broken HUD must not keep the rest of the page from hearing the game is
 * ready.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createGameEvents = () => {
    const listeners = new Map<TGameEventName, Set<THandler<TGameEventName>>>();
    const happened = new Map<TGameEventName, TGameEvents[TGameEventName]>();

    const call = <E extends TGameEventName>(handler: THandler<E>, payload: TGameEvents[E]): void => {
        try {
            handler(payload);
        } catch (error) {
            console.error('[NacatamalOn] a game event listener threw:', error);
        }
    };

    const on = <E extends TGameEventName>(event: E, handler: THandler<E>): (() => void) => {
        if (happened.has(event)) {
            call(handler, happened.get(event) as TGameEvents[E]);
            return () => {};
        }
        let set = listeners.get(event);
        if (set === undefined) {
            set = new Set();
            listeners.set(event, set);
        }
        set.add(handler as THandler<TGameEventName>);
        return () => {
            set.delete(handler as THandler<TGameEventName>);
        };
    };

    const emit = <E extends TGameEventName>(event: E, payload: TGameEvents[E]): void => {
        // Once gone, a game says nothing more: see `TGameInstance.on`.
        if (happened.has('destroy') || happened.has(event)) {
            return;
        }
        happened.set(event, payload);
        const set = listeners.get(event);
        listeners.delete(event);
        for (const handler of set ?? []) {
            call(handler as THandler<E>, payload);
        }
    };

    return { on, emit };
};
