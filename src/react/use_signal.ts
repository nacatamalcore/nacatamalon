'use client';

import { useEffect, useRef } from 'react';
import type { TGameSignal, TSignalHandler } from '../signal';

/**
 * Listens to a signal from a React component, and stops when the component goes away.
 *
 * The same as the engine's `useSignal` in a scene, from the other side of the canvas: a HUD flashing
 * when a coin is picked up, a menu opening when the player dies. The handler can change between
 * renders without reconnecting; the latest one is the one called.
 *
 * @example
 * ```tsx
 * declare const coinCollected: TGameSignal<number>;
 *
 * export const Coins = () => {
 *     const [coins, setCoins] = useState(0);
 *     useSignal(coinCollected, (points) => setCoins((c) => c + points));
 *     return <span>{coins}</span>;
 * };
 * ```
 *
 * @param signal The signal, made with `createGameSignal`.
 * @param handler What to do when it fires.
 *
 * @category React
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useSignal = <T>(signal: TGameSignal<T>, handler: TSignalHandler<T>): void => {
    const latest = useRef(handler);
    latest.current = handler;

    useEffect(() => signal.connect((payload) => latest.current(payload)), [signal]);
};
