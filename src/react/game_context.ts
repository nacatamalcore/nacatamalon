import { createContext } from 'react';
import type { TGameHandle } from '../game/handle';

/**
 * What a `<Game>` hands the components inside it: its handle, or `null` while the renderer is still
 * starting.
 *
 * Wrapped in an object so that "outside any `<Game>`" (the context's default, `null`) and "inside
 * one that is not ready yet" (`{ handle: null }`) are two different answers. Only the first is a
 * mistake worth throwing about.
 */
export type TGameContextValue = { handle: TGameHandle | null };

export const GameContext = createContext<TGameContextValue | null>(null);
