import { bindingKey } from './normalize_action_map';
import type { TActionSource } from './create_actions';
import type { TActionBinding, TActionName, TActionOverrides, TActionPersist, TInputMapHandle } from './types/t_action';

/**
 * Where the player's own bindings are kept when nobody says otherwise.
 *
 * It has a prefix because browser storage belongs to the **site**, not to this game: a portal or an
 * itch.io page can host several games on one domain, and a bare name would have them overwriting
 * each other's controls.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const INPUT_MAP_STORAGE_KEY = 'nacatamalon:input-map';

/**
 * Builds the remapping handle for one game, and starts bringing the player's own bindings back if
 * the game asked for them to be kept.
 *
 * The load is started and left to arrive: it takes time, the game is already booting, and the layers
 * do not care about order, so bindings that land three frames in are right from that moment. Holding
 * up the boot to avoid a few frames of default controls would be a worse trade.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createInputMap = (source: TActionSource, persist: TActionPersist | null): TInputMapHandle => {
    const key = persist?.key ?? INPUT_MAP_STORAGE_KEY;

    const write = async (): Promise<void> => {
        if (persist === null) {
            return;
        }
        try {
            await persist.adapter.save(key, source.overrides());
        } catch (error) {
            // A player losing a remap should degrade, not crash.
            console.warn('[NacatamalOn] The controls could not be saved:', error);
        }
    };

    if (persist !== null) {
        void persist.adapter.load(key)
            .then((saved) => {
                if (saved !== null) {
                    source.setOverrides(saved);
                }
            })
            .catch((error: unknown) => console.warn('[NacatamalOn] The controls could not be loaded:', error));
    }

    /**
     * What an action listens to now, as a copy the caller cannot break anything with.
     */
    const currentOf = (action: TActionName): TActionBinding[] => source.bindingsOf(action).map((binding) => ({ ...binding }));

    return {
        list: () => source.defs.map((def) => def.name),
        bindings: (action) => source.bindingsOf(action),
        defaults: (action) => source.defaultsOf(action),

        bind: (action, binding, slot) => {
            const next = currentOf(action);
            if (slot === undefined || slot < 0 || slot >= next.length) {
                next.push(binding);
            } else {
                next[slot] = binding;
            }
            source.setOverride(action, next);
            void write();
        },

        unbind: (action, binding) => {
            const next = currentOf(action);
            const before = next.length;
            if (typeof binding === 'number') {
                if (binding >= 0 && binding < next.length) {
                    next.splice(binding, 1);
                }
            } else {
                const target = bindingKey(binding);
                for (let i = next.length - 1; i >= 0; i--) {
                    if (bindingKey(next[i]) === target) {
                        next.splice(i, 1);
                    }
                }
            }
            const removed = before - next.length;
            if (removed > 0) {
                source.setOverride(action, next);
                void write();
            }
            return removed;
        },

        clear: (action) => {
            source.setOverride(action, []);
            void write();
        },

        reset: (action) => {
            // The player's change is dropped, not replaced by a copy of the defaults, so an action
            // the game rebinds in a later version follows along instead of being frozen at whatever
            // it said the day the player pressed reset.
            if (action === undefined) {
                source.setOverrides({});
            } else {
                source.setOverride(action, null);
            }
            void write();
        },

        conflicts: (binding, exclude) => {
            const target = bindingKey(binding);
            const hits: TActionName[] = [];
            for (const def of source.defs) {
                if (def.name === exclude) {
                    continue;
                }
                if (source.bindingsOf(def.name).some((existing) => bindingKey(existing) === target)) {
                    hits.push(def.name);
                }
            }
            return hits;
        },

        capture: (done, options) => source.capture(done, options),

        overrides: () => source.overrides(),
        load: (overrides: TActionOverrides) => source.setOverrides(overrides),
        save: write,
    };
};
