'use client';

import { useContext } from 'react';
import type { TGameHandle } from '../game/handle';
import { GameContext } from './game_context';

/**
 * The game this component is drawn over: the same handle the engine's `useGame` gives a scene, to
 * pause it, put it full screen or read its size from a menu.
 *
 * `null` until the renderer is up, which takes a moment after `<Game>` first renders; the component
 * renders again with the handle when it is.
 *
 * @example
 * ```tsx
 * export const PauseButton = () => {
 *     const game = useGame();
 *     return <button disabled={game === null} onClick={() => game?.pause('menu')}>Pause</button>;
 * };
 * ```
 *
 * @returns The game's handle, or `null` while it starts.
 *
 * @category React
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useGame = (): TGameHandle | null => {
    const context = useContext(GameContext);
    if (context === null) {
        throw new Error('[NacatamalOn] useGame (nacatamalon/react): call it from a component inside a <Game>.');
    }
    return context.handle;
};
