import { getActiveBox, getActiveGame } from '../../store';
import type { TInputMapHandle } from '../../input';

/**
 * Remapping: what a game's controls screen is built on.
 *
 * It lists the game's actions, says what each one listens to, changes them, puts them back and warns
 * that two actions are on the same button. If the game said where to keep them, every change is
 * written and comes back next time; starting a new game does **not** wipe them, because the controls
 * are a preference and not part of a saved game.
 *
 * @example
 * ```ts
 * declare const jumpRow: TText;
 *
 * export const Controls: TSceneFn = () => {
 *     const map = useInputMap();
 *
 *     // "Press a key or a button for JUMP..."
 *     listen(jumpRow, { onClick: () => {
 *         map.capture((binding) => {
 *             if (binding === null) return;              // they pressed Escape
 *             if (map.conflicts(binding, 'jump').length > 0) return;
 *             map.bind('jump', binding, 0);
 *         });
 *     } });
 *
 *     return createScene();
 * };
 * ```
 *
 * @returns What a controls screen needs: see {@link TInputMapHandle}.
 *
 * @category Input
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useInputMap = (): TInputMapHandle => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw new Error('[NacatamalOn] useInputMap: call it inside a scene body.');
    }
    return store.get('input').inputMap;
};
