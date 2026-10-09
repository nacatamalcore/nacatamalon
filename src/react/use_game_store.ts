'use client';

import { useRef, useSyncExternalStore } from 'react';
import type { TGameStore, TStoreSelector } from '../game_store';

/**
 * The stores already warned about, so a component that renders sixty times a second says it once.
 */
const warned = new WeakSet<object>();

/**
 * Says so when a selector picks something that will not re-render the way its author expects.
 *
 * Two mistakes, and both look like "the HUD does not update":
 *
 * - the selector hands back an object **from** the state. The state is changed in place, so it is
 *   the same object after every change and React never sees one;
 * - the selector builds a **new** object every time. React sees a change on every read and renders
 *   for ever.
 *
 * Asking the selector twice tells them apart: the same object both times is the first, a different
 * one is the second.
 */
const checkSelected = <S extends object, T>(store: TGameStore<S, unknown>, selector: TStoreSelector<S, T>, value: T): void => {
    if (warned.has(store) || typeof value !== 'object' || value === null) {
        return;
    }
    warned.add(store);
    if (Object.is(selector(store.state), value)) {
        console.warn(`[NacatamalOn] useGameStore('${store.key}'): the selector picked an object out of the state. The state is changed in place, so it is the same object after every change and this component will not render again. Pick a value instead (s.items.length, not s.items), or pass an \`equals\` that compares what is inside.`);
    } else {
        console.warn(`[NacatamalOn] useGameStore('${store.key}'): the selector builds a new object every time, so every read looks like a change. Pick one value per useGameStore, or pass an \`equals\` that compares what is inside.`);
    }
};

/**
 * Reads one value of a store from a React component, and renders it again when that value changes.
 *
 * The engine's `useStore` is told about a change and runs a handler, because a scene's body runs
 * once. A component renders instead, so this one hands the value back. Same store, same selector,
 * two sides of the canvas:
 *
 * ```ts
 * useStore(petStore, (s) => s.hunger, (hunger) => { bar.width = hunger; }); // in a scene
 * const hunger = useGameStore(petStore, (s) => s.hunger);                    // in a component
 * ```
 *
 * Pick values, not objects: the state is changed in place, so `(s) => s.inventory` is the same
 * object after every change and never renders again. `(s) => s.inventory.length` does. A store that
 * changes every frame renders the component every frame too; select something coarser (`hunger > 30`
 * rather than `hunger`) when the component does not need every step.
 *
 * @param store The store, made with `createGameStore`.
 * @param selector Picks the value to read.
 * @param equals When two values count as the same. Default `Object.is`.
 * @returns The selected value, as it is now.
 *
 * @example
 * ```tsx
 * declare const petStore: TGameStore<{ hunger: number }, { feed(): void }>;
 *
 * export const HungerBar = () => {
 *     const hunger = useGameStore(petStore, (s) => s.hunger);
 *     return <progress max={100} value={hunger} onClick={petStore.actions.feed} />;
 * };
 * ```
 *
 * @category React
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useGameStore = <S extends object, A, T>(
    store: TGameStore<S, A>,
    selector: TStoreSelector<S, T>,
    equals: (a: T, b: T) => boolean = Object.is,
): T => {
    // The last value handed to React. `useSyncExternalStore` compares reads by identity, so a value
    // `equals` calls the same has to come back as the very same one, or React renders for nothing.
    const last = useRef<{ value: T } | null>(null);

    const read = (): T => {
        const next = selector(store.state);
        if (last.current !== null && equals(last.current.value, next)) {
            return last.current.value;
        }
        if (equals === Object.is) {
            checkSelected(store as TGameStore<S, unknown>, selector, next);
        }
        last.current = { value: next };
        return next;
    };

    return useSyncExternalStore(store.subscribe, read, read);
};
